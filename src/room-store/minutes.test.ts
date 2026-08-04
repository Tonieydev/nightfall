import { describe, expect, it, vi } from 'vitest';
import {
  ALARM_FRACTION,
  MinuteBudgetExceededError,
  maxSpendFor,
  minutesReserved,
  monthKey,
  reconcileMinutes,
  reserveMinutes,
} from './minutes.js';
import { MAX_SEATS, ROOM_TTL_SECONDS } from './keys.js';
import { MemoryRedis } from './memory-redis.js';

const AUG = Date.UTC(2026, 7, 15, 12, 0, 0);
const SEP = Date.UTC(2026, 8, 1, 0, 0, 0);

const policy = (budget: number, onAlarm?: (reserved: number, budget: number) => void) =>
  onAlarm === undefined ? { budget } : { budget, onAlarm };

describe('participant-minute budget', () => {
  it('reserves a room’s maximum possible spend, not its current usage', () => {
    // 12 seats for the full 90-minute lifetime is the worst a room can cost.
    expect(maxSpendFor(MAX_SEATS, ROOM_TTL_SECONDS / 60)).toBe(1080);
  });

  it('keys the counter by month', () => {
    expect(monthKey(AUG)).toBe('livekit:minutes:2026-08');
    expect(monthKey(SEP)).toBe('livekit:minutes:2026-09');
  });

  it('adds the reservation to the month', async () => {
    const redis = new MemoryRedis(() => AUG);

    await reserveMinutes(redis, AUG, 1080, policy(4500));

    expect(await minutesReserved(redis, AUG)).toBe(1080);
  });

  it('fails closed when the reservation would exceed the budget', async () => {
    const redis = new MemoryRedis(() => AUG);
    // 2000 fits one room's 1080 but not two.
    await reserveMinutes(redis, AUG, 1080, policy(2000));

    await expect(reserveMinutes(redis, AUG, 1080, policy(2000))).rejects.toThrow(
      MinuteBudgetExceededError,
    );

    // The refused reservation must not linger and strand the budget.
    expect(await minutesReserved(redis, AUG)).toBe(1080);
  });

  it('refuses pessimistically rather than admitting a room it cannot fund', async () => {
    const redis = new MemoryRedis(() => AUG);
    await reserveMinutes(redis, AUG, 4000, policy(4500));

    // 500 left, a room could cost 1080 — refuse, do not admit and cut off mid-game.
    await expect(reserveMinutes(redis, AUG, 1080, policy(4500))).rejects.toThrow(/capacity/i);
  });

  it('sells the last slot exactly once when two creates race', async () => {
    const redis = new MemoryRedis(() => AUG);
    await reserveMinutes(redis, AUG, 3000, policy(4500));

    const results = await Promise.allSettled([
      reserveMinutes(redis, AUG, 1080, policy(4500)),
      reserveMinutes(redis, AUG, 1080, policy(4500)),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(await minutesReserved(redis, AUG)).toBe(4080);
  });

  it('reconciles the reservation down to what was actually spent', async () => {
    const redis = new MemoryRedis(() => AUG);
    await reserveMinutes(redis, AUG, 1080, policy(4500));

    // Six players for twenty minutes is 120, not the 1080 held.
    await reconcileMinutes(redis, AUG, 1080, 120);

    expect(await minutesReserved(redis, AUG)).toBe(120);
  });

  it('frees the reservation for the next room', async () => {
    const redis = new MemoryRedis(() => AUG);
    await reserveMinutes(redis, AUG, 1080, policy(1200));
    await reconcileMinutes(redis, AUG, 1080, 100);

    await expect(reserveMinutes(redis, AUG, 1080, policy(1200))).resolves.toBeUndefined();
  });

  it('never lets reconciliation drive the counter below zero', async () => {
    const redis = new MemoryRedis(() => AUG);

    await reconcileMinutes(redis, AUG, 1080, 0);

    expect(await minutesReserved(redis, AUG)).toBe(0);
  });

  it('raises the alarm when reservations cross the threshold', async () => {
    const redis = new MemoryRedis(() => AUG);
    const onAlarm = vi.fn();

    await reserveMinutes(redis, AUG, 3000, policy(4500, onAlarm));
    expect(onAlarm, 'below 70% of 4500 = 3150').not.toHaveBeenCalled();

    await reserveMinutes(redis, AUG, 200, policy(4500, onAlarm));

    expect(onAlarm).toHaveBeenCalledTimes(1);
    expect(onAlarm).toHaveBeenCalledWith(3200, 4500);
    expect(Math.round(ALARM_FRACTION * 4500)).toBe(3150);
  });

  it('starts a new month on a clean budget', async () => {
    const redis = new MemoryRedis(() => AUG);
    await reserveMinutes(redis, AUG, 4400, policy(4500));

    expect(await minutesReserved(redis, SEP)).toBe(0);
    await expect(reserveMinutes(redis, SEP, 1080, policy(4500))).resolves.toBeUndefined();
    expect(await minutesReserved(redis, AUG), 'August untouched').toBe(4400);
  });

  it('lets an old month evict itself', async () => {
    let clock = AUG;
    const redis = new MemoryRedis(() => clock);
    await reserveMinutes(redis, AUG, 1080, policy(4500));

    clock = AUG + 41 * 24 * 60 * 60 * 1000;

    expect(await minutesReserved(redis, AUG)).toBe(0);
  });
});
