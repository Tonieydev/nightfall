import { describe, expect, it } from 'vitest';
import { MemoryRedis } from '../room-store/memory-redis.js';
import { domainErrorCode } from '../room-store/errors.js';
import { createOtpService } from './index.js';
import { otpKey } from './store.js';
import type { EmailPort } from './email.js';

const SECRET = 'a-test-secret-that-is-long-enough';
const EMAIL = 'ada@example.com';
const IP = '10.0.0.1';
const NOW = 1_700_000_000_000;

const sending = (): EmailPort & { sent: { to: string; text: string }[] } => {
  const sent: { to: string; text: string }[] = [];
  return {
    sent,
    send: (message) => {
      sent.push({ to: message.to, text: message.text });
      return Promise.resolve();
    },
  };
};

const refusing = (): EmailPort =>
  ({ send: () => Promise.reject(new Error('Resend refused the message (403)')) });

describe('requesting a code', () => {
  it('sends the code and stores only its hash', async () => {
    const redis = new MemoryRedis(() => NOW);
    const email = sending();
    const otp = createOtpService(redis, email, SECRET, () => NOW);

    await otp.request(EMAIL, IP);

    const code = /\b(\d{6})\b/.exec(email.sent[0]?.text ?? '')?.[1] ?? '';
    expect(code).toMatch(/^\d{6}$/);
    expect(await redis.get(otpKey(EMAIL))).not.toContain(code);
    // The code that went out is the one that will verify.
    expect(await otp.verify(EMAIL, code)).toBe(true);
  });

  it('leaves no code behind when the message could not be sent', async () => {
    const redis = new MemoryRedis(() => NOW);
    const otp = createOtpService(redis, refusing(), SECRET, () => NOW);

    await expect(otp.request(EMAIL, IP)).rejects.toThrow();

    // Observed against Resend: the code was stored before the send was refused,
    // leaving a ten-minute code for something the player never received.
    expect(await redis.get(otpKey(EMAIL))).toBeNull();
  });

  it('does not invalidate a working code when a later send fails', async () => {
    const redis = new MemoryRedis(() => NOW);
    const email = sending();
    const good = createOtpService(redis, email, SECRET, () => NOW);
    await good.request(EMAIL, IP);
    const code = /\b(\d{6})\b/.exec(email.sent[0]?.text ?? '')?.[1] ?? '';

    const broken = createOtpService(redis, refusing(), SECRET, () => NOW);
    await expect(broken.request('someone-else@example.com', IP)).rejects.toThrow();

    // One address failing must not reach into another's outstanding code.
    expect(await good.verify(EMAIL, code)).toBe(true);
  });

  it('reports a delivery failure as one, not as a generic fault', async () => {
    const redis = new MemoryRedis(() => NOW);
    const otp = createOtpService(redis, refusing(), SECRET, () => NOW);

    const error = await otp.request(EMAIL, IP).catch((e: unknown) => e);

    expect(domainErrorCode(error)).toBe('EMAIL_SEND_FAILED');
  });

  it('still spends the allowance on a refused send', async () => {
    const redis = new MemoryRedis(() => NOW);
    const otp = createOtpService(redis, refusing(), SECRET, () => NOW);

    for (let i = 0; i < 3; i += 1) await otp.request(EMAIL, IP).catch(() => undefined);

    // Deliberate: an attempted send costs Resend quota whether or not it is
    // delivered, and refunding on failure would let anyone who can force a
    // failure request without limit. Failing closed is the safe direction.
    const error = await otp.request(EMAIL, IP).catch((e: unknown) => e);
    expect(domainErrorCode(error)).toBe('OTP_RATE_LIMITED');
  });

  it('refuses to send when the claim is not configured', async () => {
    const redis = new MemoryRedis(() => NOW);
    const otp = createOtpService(redis, null, SECRET, () => NOW);

    expect(otp.enabled).toBe(false);
    await expect(otp.request(EMAIL, IP)).rejects.toThrow();
  });

  it('never sends to an address it could not parse', async () => {
    const redis = new MemoryRedis(() => NOW);
    const email = sending();
    const otp = createOtpService(redis, email, SECRET, () => NOW);

    await expect(otp.request('not-an-address', IP)).rejects.toThrow();

    expect(email.sent).toHaveLength(0);
  });
});
