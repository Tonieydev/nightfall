import { createHash } from 'node:crypto';
import { hashCode, hashesMatch, normaliseEmail } from './codes.js';
import type { RedisPort } from '../room-store/redis-port.js';

export const OTP_TTL_SECONDS = 600;

/**
 * Ten minutes is long enough to walk a fair share of a million codes if guesses
 * are free. They are not.
 */
export const MAX_ATTEMPTS = 5;

interface StoredOtp {
  hash: string;
  attempts: number;
}

/**
 * The address is hashed into the key as well as the value. Redis keys turn up in
 * logs, dashboards and slow-query output; an address is personal data and does
 * not belong in any of them.
 */
export function otpKey(email: string): string {
  const canonical = normaliseEmail(email) ?? email;
  return `otp:${createHash('sha256').update(canonical).digest('hex').slice(0, 32)}`;
}

/** Replaces any code already outstanding: only the newest one is ever valid. */
export async function storeCode(
  redis: RedisPort,
  email: string,
  code: string,
  pepper: string,
): Promise<void> {
  const record: StoredOtp = { hash: hashCode(email, code, pepper), attempts: 0 };
  await redis.set(otpKey(email), JSON.stringify(record), OTP_TTL_SECONDS);
}

/**
 * True exactly once, for the right code, before it expires and within the
 * attempt budget. A wrong guess costs an attempt but does not burn the code —
 * a typo must not force a resend of something the player is still looking at.
 *
 * Read-modify-write rather than compare-and-set: this runs on one backend
 * instance, and the worst a lost update could do is grant an extra guess out of
 * five. The room document uses CAS because a lost update there loses a game.
 */
export async function consumeCode(
  redis: RedisPort,
  email: string,
  code: string,
  pepper: string,
): Promise<boolean> {
  const key = otpKey(email);
  const raw = await redis.get(key);
  if (raw === null) return false;

  const record = JSON.parse(raw) as StoredOtp;

  if (hashesMatch(record.hash, hashCode(email, code, pepper))) {
    await redis.del(key);
    return true;
  }

  const attempts = record.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await redis.del(key);
    return false;
  }

  // Keep the original expiry: a wrong guess must not extend the window.
  const remaining = await redis.ttl(key);
  await redis.set(
    key,
    JSON.stringify({ hash: record.hash, attempts } satisfies StoredOtp),
    remaining > 0 ? remaining : OTP_TTL_SECONDS,
  );
  return false;
}
