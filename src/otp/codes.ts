import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

export const CODE_LENGTH = 6;

/**
 * A one-time code is a credential, so it comes from the CSPRNG rather than
 * Math.random. Injectable only so tests can pin it — the default is the real
 * thing, because a predictable OTP is not an OTP.
 */
export function generateCode(randomBelow: (max: number) => number = randomInt): string {
  // padStart, not arithmetic: a code of 42 must read 000042, and a version that
  // shifted the range to avoid padding would throw away a tenth of the space.
  return String(randomBelow(10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
}

/**
 * Codes are stored hashed, and the hash is keyed rather than bare: six digits
 * is a million guesses, so a plain digest of a leaked row is broken in seconds.
 * The address is mixed in too, so a code minted for one inbox cannot be
 * presented for another.
 */
export function hashCode(email: string, code: string, pepper: string): string {
  return createHmac('sha256', pepper).update(`${normaliseEmail(email) ?? email}:${code}`).digest('hex');
}

/** Constant time, so a wrong code cannot be narrowed down by how fast it fails. */
export function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

// Deliberately not RFC 5322: that grammar accepts addresses no mail provider
// will route. This rejects what is obviously not an address and leaves the rest
// to the delivery attempt, which is the only real test of one.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/**
 * Lowercased and trimmed, because `Player.email` is unique: without this, one
 * human could hold two rows that differ only in casing.
 */
export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;

  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length > 254 || !EMAIL_SHAPE.test(trimmed)) return null;
  return trimmed;
}
