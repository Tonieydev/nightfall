import { createHash } from 'node:crypto';
import { DomainError } from '../room-store/errors.js';
import { normaliseEmail } from './codes.js';
import type { RedisPort } from '../room-store/redis-port.js';

/** Enough for a mistyped address and a retry; not enough to use as a mail cannon. */
export const PER_EMAIL_PER_HOUR = 3;

/** Higher, because a household or a venue shares one address. */
export const PER_IP_PER_HOUR = 5;

const WINDOW_SECONDS = 60 * 60;

export class OtpRateLimitedError extends DomainError {
  readonly code = 'OTP_RATE_LIMITED' as const;

  constructor(scope: 'address' | 'network') {
    super(`too many codes requested for this ${scope} — try again within the hour`);
    this.name = 'OtpRateLimitedError';
  }
}

/** Hashed for the same reason as the OTP key: neither an address nor an IP belongs in a key. */
function bucket(kind: string, value: string, now: number): string {
  const hour = Math.floor(now / (WINDOW_SECONDS * 1000));
  const digest = createHash('sha256').update(value).digest('hex').slice(0, 32);
  return `otp:rate:${kind}:${digest}:${String(hour)}`;
}

async function spend(
  redis: RedisPort,
  key: string,
  limit: number,
  scope: 'address' | 'network',
): Promise<void> {
  // Count first, then check: INCR is atomic, so two requests racing for the last
  // slot cannot both read a figure under the limit and both proceed.
  const used = await redis.incrBy(key, 1, WINDOW_SECONDS);
  if (used > limit) throw new OtpRateLimitedError(scope);
}

/**
 * Both limits are spent together, and the address is checked first: a refusal
 * there is the common case, and it should not consume the network's allowance.
 *
 * A refused request still leaves its count spent. That is deliberate — refunding
 * it would let an attacker probe the limit for free.
 */
export async function spendOtpAllowance(
  redis: RedisPort,
  who: { email: string; ip: string },
  now: number,
): Promise<void> {
  const canonical = normaliseEmail(who.email) ?? who.email;

  await spend(redis, bucket('email', canonical, now), PER_EMAIL_PER_HOUR, 'address');
  await spend(redis, bucket('ip', who.ip, now), PER_IP_PER_HOUR, 'network');
}
