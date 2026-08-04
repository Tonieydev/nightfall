import { describe, expect, it } from 'vitest';
import { createRoomStoreFacade } from './index.js';
import { ROOM_TTL_SECONDS } from './keys.js';
import { MemoryRedis } from './memory-redis.js';

const NOW = 1_700_000_000_000;

/** A clock the test can push forward, so TTL expiry happens without waiting. */
function setup(maxConcurrentRooms: number) {
  const clock = { now: NOW };
  const redis = new MemoryRedis(() => clock.now);
  const store = createRoomStoreFacade(
    redis,
    { maxConcurrentRooms, killSwitch: false },
    () => clock.now,
    () => 0.5,
  );
  const expire = () => {
    clock.now += (ROOM_TTL_SECONDS + 1) * 1000;
  };
  return { clock, redis, store, expire };
}

/**
 * The failure this guards against was observed in production: the count reached
 * 21 with zero live rooms and refused every new room. Nobody closed those rooms
 * — they died by TTL, which a separately maintained counter never hears about.
 */
describe('the concurrent-room count is derived from live rooms', () => {
  it('frees the slot of a room that expired by TTL rather than closing', async () => {
    const { store, expire } = setup(2);
    await store.room.open('AAA222');
    await store.room.open('BBB333');

    expire();

    expect(await store.room.read('AAA222'), 'AAA222 should be gone').toBeNull();
    expect(await store.room.read('BBB333'), 'BBB333 should be gone').toBeNull();
    await expect(store.room.open('CCC444')).resolves.toBeDefined();
  });

  it('does not drift upward however many rooms expire uncounted', async () => {
    const { store, expire } = setup(2);

    // Well past the ceiling: a counter that only decrements on close would be
    // at 20 by the end of this loop and would have started refusing at 3.
    for (let i = 0; i < 20; i += 1) {
      await store.room.open(`R${String(i).padStart(5, '0')}`);
      expire();
    }

    await expect(store.room.open('ZZZ999')).resolves.toBeDefined();
  });

  it('still counts a room that is alive, whatever else has expired', async () => {
    const { clock, store } = setup(2);
    await store.room.open('AAA222');

    // Half a lifetime on: the first room is alive and must still hold its slot.
    clock.now += (ROOM_TTL_SECONDS / 2) * 1000;
    await store.room.open('BBB333');

    expect(await store.room.read('AAA222')).not.toBeNull();
    await expect(store.room.open('CCC444')).rejects.toThrow(/at capacity/i);
  });

  it('reclaims only the expired room when rooms expire at different times', async () => {
    const { clock, store } = setup(2);
    await store.room.open('AAA222');
    clock.now += (ROOM_TTL_SECONDS / 2) * 1000;
    await store.room.open('BBB333');

    // Far enough for the first room to die and not the second.
    clock.now += (ROOM_TTL_SECONDS / 2 + 1) * 1000;

    expect(await store.room.read('AAA222')).toBeNull();
    expect(await store.room.read('BBB333')).not.toBeNull();
    await expect(store.room.open('CCC444')).resolves.toBeDefined();
    await expect(store.room.open('DDD555')).rejects.toThrow(/at capacity/i);
  });
});
