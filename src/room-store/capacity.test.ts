import { describe, expect, it } from 'vitest';
import { acquireRoomSlot, releaseRoomSlot, roomsInUse, slotExpiryFor } from './capacity.js';
import { ROOM_TTL_SECONDS } from './keys.js';
import { MemoryRedis } from './memory-redis.js';

const NOW = 1_700_000_000_000;
const open = { maxConcurrentRooms: 3, killSwitch: false };

describe('room capacity governors', () => {
  it('counts each acquired room', async () => {
    const redis = new MemoryRedis(() => NOW);

    await acquireRoomSlot(redis, open, 'AAA222', NOW);
    await acquireRoomSlot(redis, open, 'BBB333', NOW);

    expect(await roomsInUse(redis, NOW)).toBe(2);
  });

  it('rejects the room past the ceiling', async () => {
    const redis = new MemoryRedis(() => NOW);
    for (const code of ['AAA222', 'BBB333', 'CCC444']) {
      await acquireRoomSlot(redis, open, code, NOW);
    }

    await expect(acquireRoomSlot(redis, open, 'DDD555', NOW)).rejects.toThrow(/at capacity/i);
  });

  it('does not leak a slot when it rejects', async () => {
    const redis = new MemoryRedis(() => NOW);
    for (const code of ['AAA222', 'BBB333', 'CCC444']) {
      await acquireRoomSlot(redis, open, code, NOW);
    }

    await expect(acquireRoomSlot(redis, open, 'DDD555', NOW)).rejects.toThrow();

    // A rejected attempt must leave the ceiling exactly where it found it.
    expect(await roomsInUse(redis, NOW)).toBe(3);
    await releaseRoomSlot(redis, 'AAA222');
    await expect(acquireRoomSlot(redis, open, 'DDD555', NOW)).resolves.toBeUndefined();
  });

  it('fails closed when the kill switch is on, whatever the count', async () => {
    const redis = new MemoryRedis(() => NOW);

    await expect(
      acquireRoomSlot(redis, { maxConcurrentRooms: 100, killSwitch: true }, 'AAA222', NOW),
    ).rejects.toThrow(/kill switch/i);
    expect(await roomsInUse(redis, NOW)).toBe(0);
  });

  it('frees a slot on release', async () => {
    const redis = new MemoryRedis(() => NOW);
    await acquireRoomSlot(redis, open, 'AAA222', NOW);

    await releaseRoomSlot(redis, 'AAA222');

    expect(await roomsInUse(redis, NOW)).toBe(0);
  });

  it('stops counting a room once its lifetime is up, released or not', async () => {
    const redis = new MemoryRedis(() => NOW);
    await acquireRoomSlot(redis, open, 'AAA222', NOW);

    // Nobody releases it. This is the ordinary ending for a room: the crew
    // closes the tab and the document dies by TTL.
    expect(await roomsInUse(redis, NOW + ROOM_TTL_SECONDS * 1000 - 1)).toBe(1);
    expect(await roomsInUse(redis, NOW + ROOM_TTL_SECONDS * 1000)).toBe(0);
  });

  it('never lets a slot outlive the room that holds it', async () => {
    // The index entry and the room document expire off the same constant, so
    // one cannot survive the other.
    expect(slotExpiryFor(NOW)).toBe(NOW + ROOM_TTL_SECONDS * 1000);
  });

  it('does not let one room take two slots', async () => {
    const redis = new MemoryRedis(() => NOW);

    await acquireRoomSlot(redis, open, 'AAA222', NOW);
    await acquireRoomSlot(redis, open, 'AAA222', NOW);

    expect(await roomsInUse(redis, NOW)).toBe(1);
  });

  it('never mints capacity from a release of something never held', async () => {
    const redis = new MemoryRedis(() => NOW);
    await acquireRoomSlot(redis, open, 'AAA222', NOW);

    await releaseRoomSlot(redis, 'ZZZ999');
    await releaseRoomSlot(redis, 'AAA222');
    await releaseRoomSlot(redis, 'AAA222');

    // A set has no count below zero to drift into: the old counter did.
    expect(await roomsInUse(redis, NOW)).toBe(0);
  });
});
