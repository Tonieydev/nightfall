import { createHash } from 'node:crypto';
import { DomainError } from './errors.js';
import type { RedisPort } from './redis-port.js';

/**
 * A crew link is pinned once in a group chat and reused forever, so nobody
 * legitimately needs many. This only has to stop a loop.
 */
export const CREWS_PER_IP_PER_HOUR = 8;

const WINDOW_SECONDS = 60 * 60;

export class CrewRateLimitedError extends DomainError {
  readonly code = 'CREW_RATE_LIMITED' as const;

  constructor() {
    super('too many crews created from here — try again within the hour');
    this.name = 'CrewRateLimitedError';
  }
}

/** Hashed: an IP address is personal data and does not belong in a Redis key. */
function bucket(ip: string, now: number): string {
  const hour = Math.floor(now / (WINDOW_SECONDS * 1000));
  const digest = createHash('sha256').update(ip).digest('hex').slice(0, 32);
  return `crew:rate:${digest}:${String(hour)}`;
}

/**
 * Crew records are written with no TTL on purpose — the link has to outlive
 * every session played through it — so an unbounded creation loop grows Redis
 * forever and walks through the crew-code space. The concurrent-room ceiling
 * does not cover this: creating a crew and opening a room are separate paths.
 *
 * Counted first, then checked, because INCR is atomic and two callers racing
 * for the last slot must not both read a figure under the limit.
 */
export async function spendCrewAllowance(
  redis: RedisPort,
  ip: string,
  now: number,
): Promise<void> {
  const used = await redis.incrBy(bucket(ip, now), 1, WINDOW_SECONDS);
  if (used > CREWS_PER_IP_PER_HOUR) throw new CrewRateLimitedError();
}
