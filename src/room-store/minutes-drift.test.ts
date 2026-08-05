import { describe, expect, it } from 'vitest';
import { createRoomStoreFacade } from './index.js';
import { ROOM_TTL_SECONDS } from './keys.js';
import { MemoryRedis } from './memory-redis.js';
import { MINUTE_BUDGET_DEFAULT, minutesInUse, minutesSpent } from './minutes.js';

const NOW = 1_700_000_000_000;

function setup(budget = MINUTE_BUDGET_DEFAULT) {
  const clock = { now: NOW };
  const redis = new MemoryRedis(() => clock.now);
  const store = createRoomStoreFacade(
    redis,
    { maxConcurrentRooms: 8, killSwitch: false },
    () => clock.now,
    () => 0.5,
    { budget },
  );
  const expire = () => {
    clock.now += (ROOM_TTL_SECONDS + 1) * 1000;
  };
  return { clock, redis, store, expire };
}

/**
 * Observed in production: 4,320 of 4,500 participant-minutes held with only two
 * live rooms — two rooms' worth stranded by rooms that had died by TTL. Voice
 * was then refused for everybody until the month rolled over.
 *
 * The cause is the same shape as the concurrent-room counter leak: a running
 * total that only comes down when something remembers to bring it down, and a
 * room that expires by TTL never calls close.
 */
describe('participant-minutes do not leak when a room dies by TTL', () => {
  it('stops holding a room’s reservation once the room is gone', async () => {
    const { redis, store, expire } = setup();
    await store.room.open('AAA222');
    expect(await minutesInUse(redis, NOW)).toBeGreaterThan(0);

    expire();

    // Nobody closed it. This is the ordinary ending for a room.
    expect(await minutesInUse(redis, NOW + (ROOM_TTL_SECONDS + 1) * 1000)).toBe(0);
  });

  it('still funds voice after many rooms have expired uncounted', async () => {
    const { store, expire } = setup();

    // Four rooms' worth of worst case is 4,320 of the 4,500 budget — the exact
    // figure production was stuck at.
    for (let i = 0; i < 6; i += 1) {
      const room = await store.room.open(`R${String(i).padStart(5, '0')}`);
      expect(room.voiceEnabled, `room ${String(i)}`).toBe(true);
      expire();
    }

    const last = await store.room.open('ZZZ999');
    expect(last.voiceEnabled, 'a fresh room must still get voice').toBe(true);
  });

  it('still refuses when the live rooms genuinely fill the budget', async () => {
    // The governor has to keep governing: this is not about relaxing it.
    // 1,500 funds exactly one room of 1,080.
    const { store } = setup(1_500);
    const first = await store.room.open('AAA222');
    const second = await store.room.open('BBB333');

    expect(first.voiceEnabled).toBe(true);
    expect(second.voiceEnabled).toBe(false);
  });

  it('counts what a finished game actually used, and only that', async () => {
    const { redis, store } = setup();
    await store.room.open('AAA222');

    await store.room.close('AAA222', 120);

    // Spend is what happened; the reservation was never spend.
    expect(await minutesSpent(redis, NOW)).toBe(120);
    expect(await minutesInUse(redis, NOW)).toBe(0);
  });

  it('does not let a closed room’s spend vanish with it', async () => {
    const { store, redis } = setup();
    await store.room.open('AAA222');
    await store.room.close('AAA222', 300);
    await store.room.open('BBB333');
    await store.room.close('BBB333', 200);

    // A month's real usage accumulates. Only the in-flight part is derived.
    expect(await minutesSpent(redis, NOW)).toBe(500);
  });

  it('adds spend and live rooms together when deciding', async () => {
    const { store } = setup(2_000);
    await store.room.open('AAA222');
    await store.room.close('AAA222', 1_400);

    // 1,400 spent leaves 600 of the 2,000 — not enough for another room.
    const next = await store.room.open('BBB333');
    expect(next.voiceEnabled).toBe(false);
  });
});
