import { describe, expect, it } from 'vitest';
import { createCrew, readCrew } from './crew.js';
import { isCrewCode } from './crew-code.js';
import { MemoryRedis } from './memory-redis.js';

const NOW = 1_700_000_000_000;

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('crew records', () => {
  it('creates a crew under a well-formed code and reads it back', async () => {
    const redis = new MemoryRedis();

    const crew = await createCrew(redis, 'Lagos Boys', NOW, seeded(1));

    expect(isCrewCode(crew.code)).toBe(true);
    expect(await readCrew(redis, crew.code)).toEqual(crew);
  });

  it('never hands the same code to two crews', async () => {
    const redis = new MemoryRedis();
    // A generator stuck on one code forces the collision path.
    const stuck = () => 0;

    const first = await createCrew(redis, 'First', NOW, stuck);

    await expect(createCrew(redis, 'Second', NOW, stuck, 3)).rejects.toThrow(/unused crew code/);
    expect((await readCrew(redis, first.code))?.name).toBe('First');
  });

  it('gives the crew link no expiry', async () => {
    const redis = new MemoryRedis();

    const crew = await createCrew(redis, 'Lagos Boys', NOW, seeded(2));

    expect(await redis.ttl(`crew:${crew.code}`)).toBe(-1);
  });

  it('returns null for an unknown code', async () => {
    expect(await readCrew(new MemoryRedis(), 'ZZZ999')).toBeNull();
  });
});
