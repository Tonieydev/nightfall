import { describe, expect, it } from 'vitest';
import { acquireRoomSlot, releaseRoomSlot, roomsInUse } from './capacity.js';
import { ROOM_COUNT_KEY } from './keys.js';
import { MemoryRedis } from './memory-redis.js';

const open = { maxConcurrentRooms: 3, killSwitch: false };

describe('room capacity governors', () => {
  it('counts each acquired room', async () => {
    const redis = new MemoryRedis();

    await acquireRoomSlot(redis, open);
    await acquireRoomSlot(redis, open);

    expect(await roomsInUse(redis)).toBe(2);
  });

  it('rejects the room past the ceiling', async () => {
    const redis = new MemoryRedis();
    for (let i = 0; i < 3; i += 1) await acquireRoomSlot(redis, open);

    await expect(acquireRoomSlot(redis, open)).rejects.toThrow(/at capacity/i);
  });

  it('does not leak a slot when it rejects', async () => {
    const redis = new MemoryRedis();
    for (let i = 0; i < 3; i += 1) await acquireRoomSlot(redis, open);

    await expect(acquireRoomSlot(redis, open)).rejects.toThrow();

    // A rejected attempt must not permanently consume the slot it reserved.
    expect(await roomsInUse(redis)).toBe(3);
    await releaseRoomSlot(redis);
    await expect(acquireRoomSlot(redis, open)).resolves.toBeUndefined();
  });

  it('fails closed when the kill switch is on, whatever the count', async () => {
    const redis = new MemoryRedis();

    await expect(
      acquireRoomSlot(redis, { maxConcurrentRooms: 100, killSwitch: true }),
    ).rejects.toThrow(/kill switch/i);
    expect(await roomsInUse(redis)).toBe(0);
  });

  it('frees a slot on release', async () => {
    const redis = new MemoryRedis();
    await acquireRoomSlot(redis, open);

    await releaseRoomSlot(redis);

    expect(await roomsInUse(redis)).toBe(0);
  });

  it('never lets the counter drift below zero', async () => {
    const redis = new MemoryRedis();

    await releaseRoomSlot(redis);
    await releaseRoomSlot(redis);

    expect(await roomsInUse(redis)).toBe(0);
    expect(await redis.get(ROOM_COUNT_KEY)).not.toContain('-');
  });
});
