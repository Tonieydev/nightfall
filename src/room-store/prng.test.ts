import { describe, expect, it } from 'vitest';
import { mulberry32, newSeed } from './prng.js';

describe('mulberry32', () => {
  it('replays the same sequence from the same seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);

    const first = [a(), a(), a(), a(), a()];
    const second = [b(), b(), b(), b(), b()];

    expect(first).toEqual(second);
  });

  it('produces a different sequence for a different seed', () => {
    const a = mulberry32(12345);
    const b = mulberry32(12346);

    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  it('stays inside [0, 1)', () => {
    const rng = mulberry32(99);

    for (let i = 0; i < 500; i += 1) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('mints seeds that are whole numbers a JSON document can hold', () => {
    for (let i = 0; i < 50; i += 1) {
      const seed = newSeed();

      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
      expect(seed).toBeLessThanOrEqual(0xffffffff);
      expect(JSON.parse(JSON.stringify({ seed })).seed).toBe(seed);
    }
  });
});
