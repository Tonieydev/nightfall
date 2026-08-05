import { describe, expect, it, vi } from 'vitest';
import { acquireRoomSlot } from './capacity.js';
import { MemoryRedis } from './memory-redis.js';
import {
  ALARM_FRACTION,
  MINUTE_BUDGET_DEFAULT,
  claimVoiceMinutes,
  maxSpendFor,
  minutesCommitted,
  minutesInUse,
  minutesSpent,
  monthKey,
  recordMinutesSpent,
} from './minutes.js';
import { MAX_SEATS, ROOM_TTL_SECONDS } from './keys.js';

const AUG = Date.UTC(2026, 7, 15, 12, 0, 0);
const SEP = Date.UTC(2026, 8, 1, 0, 0, 0);
const ROOM = maxSpendFor(MAX_SEATS, ROOM_TTL_SECONDS / 60);
const open = { maxConcurrentRooms: 8, killSwitch: false };

/** Grants a room voice the way the facade does, so the tests exercise one path. */
async function grant(redis: MemoryRedis, code: string, at: number, budget = MINUTE_BUDGET_DEFAULT) {
  await acquireRoomSlot(redis, open, code, at);
  return await claimVoiceMinutes(redis, at, code, { budget });
}

describe('what a month is committed to', () => {
  it('holds a room’s worst case, not its current usage', () => {
    // Minutes accrue continuously and there is no safe moment to cut a game off
    // mid-play, so a room is admitted only if its worst case fits.
    expect(ROOM).toBe(MAX_SEATS * 90);
  });

  it('keys spend by month', () => {
    expect(monthKey(AUG)).toBe('livekit:spent:2026-08');
    expect(monthKey(SEP)).toBe('livekit:spent:2026-09');
  });

  it('derives what is held from the rooms that are live', async () => {
    const redis = new MemoryRedis(() => AUG);

    await grant(redis, 'AAA222', AUG);
    await grant(redis, 'BBB333', AUG);

    // Never a stored total. Holding voice IS holding the minutes.
    expect(await minutesInUse(redis, AUG)).toBe(2 * ROOM);
  });

  it('stops holding them the moment the rooms expire', async () => {
    const redis = new MemoryRedis(() => AUG);
    await grant(redis, 'AAA222', AUG);

    // The leak this replaced: a room that died by TTL held its worst case for
    // the rest of the month, and nothing was ever going to release it.
    expect(await minutesInUse(redis, AUG + (ROOM_TTL_SECONDS + 1) * 1000)).toBe(0);
  });

  it('adds real spend to what is currently held', async () => {
    const redis = new MemoryRedis(() => AUG);
    await grant(redis, 'AAA222', AUG);
    await recordMinutesSpent(redis, AUG, 400);

    expect(await minutesSpent(redis, AUG)).toBe(400);
    expect(await minutesCommitted(redis, AUG)).toBe(400 + ROOM);
  });
});

describe('the budget still governs', () => {
  it('grants voice to a room the month can fund', async () => {
    const redis = new MemoryRedis(() => AUG);

    expect(await grant(redis, 'AAA222', AUG)).toBe(true);
  });

  it('refuses once the funded rooms are all taken', async () => {
    const redis = new MemoryRedis(() => AUG);

    // 4,500 funds four rooms of 1,080. The fifth opens voiceless.
    for (let i = 0; i < 4; i += 1) {
      expect(await grant(redis, `R${String(i)}`, AUG), `room ${String(i)}`).toBe(true);
    }
    expect(await grant(redis, 'R4', AUG)).toBe(false);
  });

  it('counts a month’s spend against the same budget', async () => {
    const redis = new MemoryRedis(() => AUG);
    await recordMinutesSpent(redis, AUG, MINUTE_BUDGET_DEFAULT);

    expect(await grant(redis, 'AAA222', AUG)).toBe(false);
  });

  it('raises the alarm as the month runs out', async () => {
    const redis = new MemoryRedis(() => AUG);
    const onAlarm = vi.fn();
    await recordMinutesSpent(redis, AUG, Math.round(ALARM_FRACTION * MINUTE_BUDGET_DEFAULT));

    await acquireRoomSlot(redis, open, 'AAA222', AUG);
    await claimVoiceMinutes(redis, AUG, 'AAA222', { budget: MINUTE_BUDGET_DEFAULT, onAlarm });

    expect(onAlarm).toHaveBeenCalled();
  });
});


describe('spend is recorded once, at close', () => {
  it('accumulates across rooms', async () => {
    const redis = new MemoryRedis(() => AUG);

    await recordMinutesSpent(redis, AUG, 120);
    await recordMinutesSpent(redis, AUG, 80);

    expect(await minutesSpent(redis, AUG)).toBe(200);
  });

  it('ignores a nonsense figure rather than going backwards', async () => {
    const redis = new MemoryRedis(() => AUG);
    await recordMinutesSpent(redis, AUG, 120);

    await recordMinutesSpent(redis, AUG, -500);

    expect(await minutesSpent(redis, AUG)).toBe(120);
  });

  it('starts a new month clean', async () => {
    const redis = new MemoryRedis(() => AUG);
    await recordMinutesSpent(redis, AUG, 4_000);

    expect(await minutesSpent(redis, SEP)).toBe(0);
  });

  it('lets an old month evict itself', async () => {
    const redis = new MemoryRedis(() => AUG);
    await recordMinutesSpent(redis, AUG, 100);

    expect(await redis.ttl(monthKey(AUG))).toBeGreaterThan(0);
  });
});
