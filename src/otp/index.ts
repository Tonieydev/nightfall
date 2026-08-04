import { createHmac } from 'node:crypto';
import { loadServerConfig } from '../config.js';
import { DomainError } from '../room-store/errors.js';
import { getRedis } from '../room-store/index.js';
import { generateCode, normaliseEmail } from './codes.js';
import { createResendEmail, otpMessage, type EmailPort } from './email.js';
import { spendOtpAllowance } from './rate-limit.js';
import { consumeCode, otpKey, storeCode } from './store.js';
import type { RedisPort } from '../room-store/redis-port.js';

export { CODE_LENGTH, generateCode, hashCode, normaliseEmail } from './codes.js';
export { createResendEmail, otpMessage } from './email.js';
export type { EmailMessage, EmailPort } from './email.js';
export { OtpRateLimitedError, PER_EMAIL_PER_HOUR, PER_IP_PER_HOUR, spendOtpAllowance } from './rate-limit.js';
export { MAX_ATTEMPTS, OTP_TTL_SECONDS, consumeCode, otpKey, storeCode } from './store.js';

/**
 * Delivery failed — the provider refused the message, or could not be reached.
 * Distinct from a bad address or a spent allowance: nothing the player did is
 * wrong, and the right answer is to try again rather than to correct anything.
 */
export class EmailSendFailedError extends DomainError {
  readonly code = 'EMAIL_SEND_FAILED' as const;

  constructor(cause: unknown) {
    super(`the code could not be sent: ${cause instanceof Error ? cause.message : 'unknown'}`);
    this.name = 'EmailSendFailedError';
  }
}

export interface OtpService {
  /** False when Resend is not configured; the claim is then never offered. */
  readonly enabled: boolean;
  request(email: string, ip: string, now?: number): Promise<void>;
  verify(email: string, code: string): Promise<boolean>;
}

/**
 * Derived from the JWT secret rather than read from its own variable: one fewer
 * secret to rotate, and deriving it keeps the two uses cryptographically
 * separate, so an OTP digest tells an attacker nothing about token signing.
 */
function pepperFrom(jwtSecret: string): string {
  return createHmac('sha256', jwtSecret).update('nightfall:otp-pepper').digest('hex');
}

export function createOtpService(
  redis: RedisPort,
  email: EmailPort | null,
  jwtSecret: string,
  now: () => number = Date.now,
): OtpService {
  const pepper = pepperFrom(jwtSecret);

  return {
    enabled: email !== null,

    async request(address, ip, at = now()) {
      const canonical = normaliseEmail(address);
      if (canonical === null) throw new Error('refusing to send to an unparseable address');
      if (email === null) throw new Error('claim is not configured');

      // Rate limit before generating: a refused request must not have cost a
      // code, or the limit itself becomes a way to invalidate someone's code.
      await spendOtpAllowance(redis, { email: canonical, ip }, at);

      const code = generateCode();
      await storeCode(redis, canonical, code, pepper);

      const message = otpMessage(code);
      try {
        await email.send({ to: canonical, subject: message.subject, text: message.text });
      } catch (cause) {
        // Observed against Resend: a refused message used to leave a live code
        // behind for something the player never received. Drop it — a code
        // nobody has seen is only a liability.
        //
        // The allowance is deliberately NOT refunded. An attempted send costs
        // provider quota whether or not it is delivered, and refunding on
        // failure would let anyone able to force one request without limit.
        await redis.del(otpKey(canonical));
        throw new EmailSendFailedError(cause);
      }
    },

    async verify(address, code) {
      const canonical = normaliseEmail(address);
      if (canonical === null) return false;
      return await consumeCode(redis, canonical, code, pepper);
    },
  };
}

const globalRef = globalThis as typeof globalThis & { __nightfallOtp?: OtpService };

export function getOtpService(): OtpService {
  const existing = globalRef.__nightfallOtp;
  if (existing !== undefined) return existing;

  const config = loadServerConfig();
  const email = config.claim.enabled
    ? createResendEmail(config.claim.resendApiKey, config.claim.resendFrom)
    : null;

  const service = createOtpService(getRedis(), email, config.jwtSecret);
  globalRef.__nightfallOtp = service;
  return service;
}
