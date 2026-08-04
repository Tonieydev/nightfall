import { describe, expect, it } from 'vitest';
import { createRoomStoreFacade } from './index.js';
import { MemoryRedis } from './memory-redis.js';
import { roomsInUse } from './capacity.js';

const NOW = 1_700_000_000_000;
const open = { maxConcurrentRooms: 2, killSwitch: false };

function setup(policy = open) {
  const redis = new MemoryRedis(() => NOW);
  return { redis, store: createRoomStoreFacade(redis, policy, () => NOW, () => 0.5) };
}

describe('room store facade', () => {
  it('opens a room and consumes one slot', async () => {
    const { redis, store } = setup();

    await store.room.open('ABC234');

    expect(await roomsInUse(redis, NOW)).toBe(1);
  });

  it('reopening an existing room does not consume a second slot', async () => {
    const { redis, store } = setup();

    const first = await store.room.open('ABC234');
    const second = await store.room.open('ABC234');

    expect(second).toEqual(first);
    expect(await roomsInUse(redis, NOW)).toBe(1);
  });

  it('refuses a new room once the ceiling is reached', async () => {
    const { store } = setup();
    await store.room.open('AAA222');
    await store.room.open('BBB333');

    await expect(store.room.open('CCC444')).rejects.toThrow(/at capacity/i);
    expect(await store.room.read('CCC444')).toBeNull();
  });

  it('fails room creation closed when the kill switch is on', async () => {
    const { store } = setup({ maxConcurrentRooms: 50, killSwitch: true });

    await expect(store.room.open('ABC234')).rejects.toThrow(/kill switch/i);
    expect(await store.room.read('ABC234')).toBeNull();
  });

  it('returns the slot when a room closes', async () => {
    const { redis, store } = setup();
    await store.room.open('ABC234');

    await store.room.close('ABC234');

    expect(await roomsInUse(redis, NOW)).toBe(0);
    expect(await store.room.read('ABC234')).toBeNull();
    // Closing twice must not mint capacity that was never held.
    await store.room.close('ABC234');
    expect(await roomsInUse(redis, NOW)).toBe(0);
  });

  it('lets only the first caller claim the session', async () => {
    const { store } = setup();
    await store.room.open('ABC234');

    expect(await store.session.claim('ABC234', 'p1')).toBe(true);
    expect(await store.session.claim('ABC234', 'p2')).toBe(false);
  });
});
