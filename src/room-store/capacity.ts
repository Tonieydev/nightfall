import { ROOM_COUNT_KEY } from './keys.js';
import type { RedisPort } from './redis-port.js';

export class RoomCeilingReachedError extends Error {
  constructor(limit: number) {
    super(`Nightfall is at capacity (${limit} concurrent rooms)`);
    this.name = 'RoomCeilingReachedError';
  }
}

export class KillSwitchError extends Error {
  constructor() {
    super('room creation is disabled by the kill switch');
    this.name = 'KillSwitchError';
  }
}

export interface CapacityPolicy {
  maxConcurrentRooms: number;
  killSwitch: boolean;
}

export async function roomsInUse(redis: RedisPort): Promise<number> {
  const raw = await redis.get(ROOM_COUNT_KEY);
  return raw === null ? 0 : Number(raw);
}

export async function acquireRoomSlot(redis: RedisPort, policy: CapacityPolicy): Promise<void> {
  if (policy.killSwitch) throw new KillSwitchError();

  // Reserve first, then check: INCR is atomic, so two callers racing for the
  // last slot cannot both read a count below the ceiling and both proceed.
  const count = await redis.incr(ROOM_COUNT_KEY);
  if (count > policy.maxConcurrentRooms) {
    await redis.decr(ROOM_COUNT_KEY);
    throw new RoomCeilingReachedError(policy.maxConcurrentRooms);
  }
}

export async function releaseRoomSlot(redis: RedisPort): Promise<void> {
  const count = await redis.decr(ROOM_COUNT_KEY);
  // A double release must not mint free capacity.
  if (count < 0) await redis.set(ROOM_COUNT_KEY, '0');
}
