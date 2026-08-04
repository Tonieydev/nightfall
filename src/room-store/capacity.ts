import { LIVE_ROOMS_KEY, ROOM_TTL_SECONDS } from './keys.js';
import type { RedisPort } from './redis-port.js';
import { DomainError } from './errors.js';

export class RoomCeilingReachedError extends DomainError {
  readonly code = 'ROOM_CEILING' as const;

  constructor(limit: number) {
    super(`Nightfall is at capacity (${limit} concurrent rooms)`);
    this.name = 'RoomCeilingReachedError';
  }
}

export class KillSwitchError extends DomainError {
  readonly code = 'KILL_SWITCH' as const;

  constructor() {
    super('room creation is disabled by the kill switch');
    this.name = 'KillSwitchError';
  }
}

export interface CapacityPolicy {
  maxConcurrentRooms: number;
  killSwitch: boolean;
}

/**
 * The room's own lifetime. A room cannot outlive this — store.create fixes
 * expiresAt from the same constant — so an index entry stamped with it cannot
 * outlive the room either.
 */
export function slotExpiryFor(now: number): number {
  return now + ROOM_TTL_SECONDS * 1000;
}

/**
 * How many rooms are live right now, derived rather than remembered.
 *
 * This used to be a counter incremented on open and decremented on close, and
 * it leaked: the common ending for a room is nobody closing it, and a room that
 * dies by TTL never runs a decrement. The count drifted up forever — observed
 * in production at 21 with no rooms alive at all, refusing every new room.
 *
 * Now each room holds an index entry stamped with its own expiry, and the count
 * is the entries that have not reached it. Forgetting to release is no longer a
 * leak, only a delay: the entry stops counting when the room does.
 */
export async function roomsInUse(redis: RedisPort, now: number): Promise<number> {
  return await redis.liveSetCount(LIVE_ROOMS_KEY, now);
}

/**
 * Admits one room under the ceiling. Atomic: the prune, the count and the
 * insert happen together, so two callers racing for the last slot cannot both
 * find room for themselves.
 *
 * Keyed by crew code and idempotent — a room that already holds a live slot
 * keeps the one it has instead of taking a second.
 */
export async function acquireRoomSlot(
  redis: RedisPort,
  policy: CapacityPolicy,
  crewCode: string,
  now: number,
): Promise<void> {
  if (policy.killSwitch) throw new KillSwitchError();

  const admitted = await redis.liveSetAdmit(
    LIVE_ROOMS_KEY,
    crewCode,
    slotExpiryFor(now),
    policy.maxConcurrentRooms,
    now,
  );
  if (!admitted) throw new RoomCeilingReachedError(policy.maxConcurrentRooms);
}

/**
 * Hands a slot back early, when a room closes before its lifetime is up. This
 * is an optimisation, not a correctness requirement: a slot nobody releases is
 * reclaimed at the room's expiry regardless.
 */
export async function releaseRoomSlot(redis: RedisPort, crewCode: string): Promise<void> {
  await redis.liveSetRemove(LIVE_ROOMS_KEY, crewCode);
}
