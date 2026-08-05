import { describe, expect, it } from 'vitest';
import { CREWS_PER_IP_PER_HOUR, spendCrewAllowance } from './abuse.js';
import { domainErrorCode } from './errors.js';
import { MemoryRedis } from './memory-redis.js';

const NOW = 1_700_000_000_000;
const IP = '10.0.0.1';

describe('creating crews is bounded', () => {
  it('allows a handful an hour from one address, then refuses', async () => {
    const redis = new MemoryRedis(() => NOW);

    for (let i = 0; i < CREWS_PER_IP_PER_HOUR; i += 1) {
      await spendCrewAllowance(redis, IP, NOW);
    }

    // Crew records are written with no TTL by design — the link outlives every
    // session played through it — so an unbounded creation loop grows Redis
    // forever and eats the crew-code space. The room ceiling does not cover
    // this: creating a crew and opening a room are different paths.
    await expect(spendCrewAllowance(redis, IP, NOW)).rejects.toThrow(/too many/i);
  });

  it('reports the refusal as a rate limit', async () => {
    const redis = new MemoryRedis(() => NOW);
    for (let i = 0; i < CREWS_PER_IP_PER_HOUR; i += 1) await spendCrewAllowance(redis, IP, NOW);

    const error = await spendCrewAllowance(redis, IP, NOW).catch((e: unknown) => e);

    expect(domainErrorCode(error)).toBe('CREW_RATE_LIMITED');
  });

  it('does not punish a different address', async () => {
    const redis = new MemoryRedis(() => NOW);
    for (let i = 0; i < CREWS_PER_IP_PER_HOUR; i += 1) await spendCrewAllowance(redis, IP, NOW);

    await expect(spendCrewAllowance(redis, '10.0.0.2', NOW)).resolves.toBeUndefined();
  });

  it('frees the allowance an hour later', async () => {
    const redis = new MemoryRedis(() => NOW);
    for (let i = 0; i < CREWS_PER_IP_PER_HOUR; i += 1) await spendCrewAllowance(redis, IP, NOW);

    await expect(
      spendCrewAllowance(redis, IP, NOW + 60 * 60 * 1000),
    ).resolves.toBeUndefined();
  });

  it('leaves room for a real group that mistypes twice', () => {
    // A crew link is pinned once and reused forever, so nobody legitimately
    // needs many. This only has to stop a loop.
    expect(CREWS_PER_IP_PER_HOUR).toBeGreaterThanOrEqual(5);
    expect(CREWS_PER_IP_PER_HOUR).toBeLessThanOrEqual(20);
  });
});
