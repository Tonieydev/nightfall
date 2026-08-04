import type { RedisPort } from './redis-port.js';

/** 10% headroom under LiveKit's 5,000-minute free tier. */
export const MINUTE_BUDGET_DEFAULT = 4500;
export const ALARM_FRACTION = 0.7;

/** Long enough to outlive its own month, short enough that old months evict. */
const COUNTER_TTL_SECONDS = 40 * 24 * 60 * 60;

export class MinuteBudgetExceededError extends Error {
  constructor(reserved: number, requested: number, budget: number) {
    super(
      `voice is at capacity this month: ${reserved} of ${budget} participant-minutes ` +
        `reserved, this room needs ${requested}`,
    );
    this.name = 'MinuteBudgetExceededError';
  }
}

export interface MinutePolicy {
  budget: number;
  /** Fires once, on the reservation that crosses the threshold. */
  onAlarm?: (reserved: number, budget: number) => void;
}

/**
 * A room's worst case, not its likely cost: every seat filled for the whole
 * 90-minute lifetime. Reserving this at creation is what stops a room being
 * admitted near the cap and then quietly burning past it — minutes accrue
 * continuously, and there is no safe moment to cut a game off mid-play.
 */
export function maxSpendFor(seatCap: number, lifetimeMinutes: number): number {
  return seatCap * lifetimeMinutes;
}

export function monthKey(now: number): string {
  const date = new Date(now);
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `livekit:minutes:${String(date.getUTCFullYear())}-${month}`;
}

export async function minutesReserved(redis: RedisPort, now: number): Promise<number> {
  const raw = await redis.get(monthKey(now));
  return raw === null ? 0 : Math.max(0, Number(raw));
}

export async function reserveMinutes(
  redis: RedisPort,
  now: number,
  amount: number,
  policy: MinutePolicy,
): Promise<void> {
  const key = monthKey(now);

  // Reserve first, then check — INCRBY is atomic, so two rooms racing for the
  // last of the budget cannot both read a figure under it and both proceed.
  const reserved = await redis.incrBy(key, amount, COUNTER_TTL_SECONDS);

  if (reserved > policy.budget) {
    await redis.incrBy(key, -amount, COUNTER_TTL_SECONDS);
    throw new MinuteBudgetExceededError(reserved - amount, amount, policy.budget);
  }

  const threshold = Math.round(ALARM_FRACTION * policy.budget);
  if (reserved >= threshold && reserved - amount < threshold) {
    policy.onAlarm?.(reserved, policy.budget);
  }
}

/**
 * Rooms almost never spend their reservation — six players for twenty minutes
 * is 120 of the 1,080 held. Releasing the difference at destroy is what keeps
 * the pessimistic reservation from starving a month that had capacity all along.
 */
export async function reconcileMinutes(
  redis: RedisPort,
  now: number,
  reserved: number,
  actual: number,
): Promise<void> {
  const key = monthKey(now);
  const delta = Math.max(0, actual) - reserved;
  if (delta === 0) return;

  const remaining = await redis.incrBy(key, delta, COUNTER_TTL_SECONDS);
  if (remaining < 0) await redis.set(key, '0', COUNTER_TTL_SECONDS);
}
