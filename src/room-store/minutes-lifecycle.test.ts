import { describe, expect, it, vi } from 'vitest';
import {
  MAX_CONCURRENT_ROOMS_DEFAULT,
  LIVEKIT_MAX_CONCURRENT_PARTICIPANTS,
  MAX_SEATS,
} from './keys.js';
import { createRoomStoreFacade } from './index.js';
import { MemoryRedis } from './memory-redis.js';
import { joinLobby } from './lobby.js';
import { minutesReserved } from './minutes.js';
import { projectRoom } from './project-room.js';

const AUG = Date.UTC(2026, 7, 15, 12, 0, 0);
const ROOM_MAX = 1080;

function setup(budget: number, clock: () => number = () => AUG, onAlarm?: () => void) {
  const redis = new MemoryRedis(clock);
  const store = createRoomStoreFacade(
    redis,
    { maxConcurrentRooms: 8, killSwitch: false },
    clock,
    () => 0.5,
    onAlarm === undefined ? { budget } : { budget, onAlarm },
  );
  return { redis, store };
}

describe('the concurrent-room ceiling fits the provider', () => {
  it('never permits more participants than LiveKit allows at once', () => {
    expect(MAX_CONCURRENT_ROOMS_DEFAULT * MAX_SEATS).toBeLessThanOrEqual(
      LIVEKIT_MAX_CONCURRENT_PARTICIPANTS,
    );
    expect(MAX_CONCURRENT_ROOMS_DEFAULT).toBe(8);
  });
});

describe('minutes across the room lifecycle', () => {
  it('reserves a room’s worst case at creation', async () => {
    const { redis, store } = setup(4500);

    await store.room.open('ABC234');

    expect(await minutesReserved(redis, AUG)).toBe(ROOM_MAX);
  });

  it('does not reserve twice for a room that already exists', async () => {
    const { redis, store } = setup(4500);
    await store.room.open('ABC234');

    await store.room.open('ABC234');

    expect(await minutesReserved(redis, AUG)).toBe(ROOM_MAX);
  });

  it('opens the room voiceless rather than refusing a spent month', async () => {
    const { redis, store } = setup(1500);
    const funded = await store.room.open('AAA222');

    const degraded = await store.room.open('BBB333');

    // The pinned crew link keeps working; the night is just silent.
    expect(funded.voiceEnabled).toBe(true);
    expect(degraded.voiceEnabled).toBe(false);
    expect(degraded.reservedMinutes).toBe(0);
    // And it costs the budget nothing, because it publishes nothing.
    expect(await minutesReserved(redis, AUG)).toBe(ROOM_MAX);
  });

  it('tells every player when voice is unavailable', async () => {
    const { store } = setup(1500);
    await store.room.open('AAA222');
    await store.room.open('BBB333');

    const doc = await store.room.read('BBB333');
    if (doc === null) throw new Error('no room');

    expect(projectRoom(doc, 'anyone').voiceEnabled).toBe(false);
  });

  it('hands a voiceless room back to the budget untouched', async () => {
    const { redis, store } = setup(1500);
    await store.room.open('AAA222');
    await store.room.open('BBB333');

    await store.room.close('BBB333');

    // Reconciling a room that held nothing must not credit minutes it never had.
    expect(await minutesReserved(redis, AUG)).toBe(ROOM_MAX);
  });

  it('still refuses when the concurrency ceiling is reached', async () => {
    const redis = new MemoryRedis(() => AUG);
    const store = createRoomStoreFacade(
      redis,
      { maxConcurrentRooms: 1, killSwitch: false },
      () => AUG,
      () => 0.5,
      { budget: 4500 },
    );
    await store.room.open('AAA222');

    // Voice degrades; concurrency does not — that ceiling is a hard limit.
    await expect(store.room.open('BBB333')).rejects.toThrow(/at capacity/i);
    expect(await store.room.read('BBB333')).toBeNull();
  });

  it('gives back the reservation the room did not spend', async () => {
    let clock = AUG;
    const { redis, store } = setup(4500, () => clock);
    await store.room.open('ABC234');
    await store.room.mutate('ABC234', (doc) => {
      let next = doc;
      for (let i = 1; i <= 6; i += 1) {
        next = joinLobby(next, { playerId: `p${i}`, displayName: `P${i}`, now: clock });
      }
      return next;
    });

    clock = AUG + 20 * 60 * 1000;
    await store.room.close('ABC234');

    // Six seats for twenty minutes is 120, not the 1080 held.
    expect(await minutesReserved(redis, AUG)).toBe(120);
  });

  it('prefers LiveKit’s own figure when one is supplied', async () => {
    const { redis, store } = setup(4500);
    await store.room.open('ABC234');

    await store.room.close('ABC234', 47);

    expect(await minutesReserved(redis, AUG)).toBe(47);
  });

  it('restores voice for the next room once one closes', async () => {
    const { store } = setup(1500);
    await store.room.open('AAA222');
    expect((await store.room.open('BBB333')).voiceEnabled, 'no budget left').toBe(false);

    await store.room.close('AAA222', 60);
    await store.room.close('BBB333');

    expect((await store.room.open('CCC444')).voiceEnabled).toBe(true);
  });

  it('sells the last of the month’s budget exactly once', async () => {
    const { redis, store } = setup(2200);

    const rooms = await Promise.all([
      store.room.open('AAA222'),
      store.room.open('BBB333'),
      store.room.open('CCC444'),
    ]);

    // Two get voice, one degrades — the budget is never oversold.
    expect(rooms.filter((r) => r.voiceEnabled)).toHaveLength(2);
    expect(await minutesReserved(redis, AUG)).toBe(2 * ROOM_MAX);
  });

  it('raises the alarm as the month fills', async () => {
    const onAlarm = vi.fn();
    const { store } = setup(4500, () => AUG, onAlarm);

    await store.room.open('AAA222');
    await store.room.open('BBB333');
    expect(onAlarm, '2160 is under the 3150 threshold').not.toHaveBeenCalled();

    await store.room.open('CCC444');

    expect(onAlarm).toHaveBeenCalledTimes(1);
  });
});
