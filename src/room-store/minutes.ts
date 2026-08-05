import { MAX_SEATS, ROOM_TTL_SECONDS, VOICE_ROOMS_KEY } from './keys.js';
import { slotExpiryFor } from './capacity.js';
import type { RedisPort } from './redis-port.js';
import { DomainError } from './errors.js';

/** 10% headroom under LiveKit's 5,000-minute free tier. */
export const MINUTE_BUDGET_DEFAULT = 4500;
export const ALARM_FRACTION = 0.7;

/** Long enough to outlive its own month, short enough that old months evict. */
const COUNTER_TTL_SECONDS = 40 * 24 * 60 * 60;

export class MinuteBudgetExceededError extends DomainError {
  readonly code = 'MINUTE_BUDGET_EXCEEDED' as const;

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

/**
 * Minutes a month has actually SPENT. Only ever goes up, and only when a room
 * closes having really used them.
 *
 * Deliberately a new key. The old `livekit:minutes:*` conflated spend with
 * in-flight reservations, so a room that died by TTL — the ordinary ending —
 * stranded its whole worst-case hold forever. Production sat at 4,320 of 4,500
 * with two live rooms and refused voice to everybody. That value must never be
 * read again, so it does not share a name.
 */
export function monthKey(now: number): string {
  const date = new Date(now);
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `livekit:spent:${String(date.getUTCFullYear())}-${month}`;
}

export async function minutesSpent(redis: RedisPort, now: number): Promise<number> {
  const raw = await redis.get(monthKey(now));
  return raw === null ? 0 : Math.max(0, Number(raw));
}

/**
 * Minutes held by rooms that are alive right now — derived, never remembered.
 * Every live room holds the same worst case, and `rooms:live` already expires
 * its members by the room's own lifetime, so a room that dies by TTL stops
 * holding minutes at the same instant it stops holding a slot. Nothing has to
 * remember to release it, which is the whole point.
 */
/** One room's worst case: every seat, the whole lifetime. */
export const ROOM_RESERVATION = maxSpendFor(MAX_SEATS, ROOM_TTL_SECONDS / 60);

export async function minutesInUse(redis: RedisPort, now: number): Promise<number> {
  return (await redis.liveSetCount(VOICE_ROOMS_KEY, now)) * ROOM_RESERVATION;
}

/** Spend plus everything currently held. What the budget is measured against. */
export async function minutesCommitted(redis: RedisPort, now: number): Promise<number> {
  return (await minutesSpent(redis, now)) + (await minutesInUse(redis, now));
}

/**
 * Takes a room's worth of the month's voice budget, or reports that there is
 * none left. True means the room may publish.
 *
 * The budget is expressed as a number of rooms and enforced by the same
 * expiring-set admission the concurrency ceiling uses: prune, count, admit,
 * atomically. So holding minutes IS being in the set, and a room that dies by
 * TTL releases them at the instant it expires. There is no running total to
 * fall out of step with reality — which is exactly how the old counter reached
 * 4,320 of 4,500 with two live rooms and refused voice to everybody.
 *
 * A refusal is not an error: the room opens voiceless and the pinned crew link
 * keeps working.
 */
export async function claimVoiceMinutes(
  redis: RedisPort,
  now: number,
  crewCode: string,
  policy: MinutePolicy,
): Promise<boolean> {
  const spent = await minutesSpent(redis, now);
  const affordable = Math.max(0, Math.floor((policy.budget - spent) / ROOM_RESERVATION));

  const admitted = await redis.liveSetAdmit(
    VOICE_ROOMS_KEY,
    crewCode,
    slotExpiryFor(now),
    affordable,
    now,
  );

  const committed = spent + (await minutesInUse(redis, now));
  if (committed >= Math.round(ALARM_FRACTION * policy.budget)) {
    policy.onAlarm?.(committed, policy.budget);
  }
  return admitted;
}

/** Hands the minutes back early. A room that never gets here expires instead. */
export async function releaseVoiceMinutes(redis: RedisPort, crewCode: string): Promise<void> {
  await redis.liveSetRemove(VOICE_ROOMS_KEY, crewCode);
}

/**
 * What the room actually cost, recorded once at close. Rooms almost never spend
 * their worst case — six players for twenty minutes is 120 of the 1,080 held —
 * and now the difference never had to be handed back, because it was never
 * taken. A room that closes without reaching here simply stops being live.
 */
export async function recordMinutesSpent(
  redis: RedisPort,
  now: number,
  actual: number,
): Promise<void> {
  const spent = Math.max(0, Math.round(actual));
  if (spent === 0) return;
  await redis.incrBy(monthKey(now), spent, COUNTER_TTL_SECONDS);
}
