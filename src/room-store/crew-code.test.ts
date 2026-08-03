import { describe, expect, it } from 'vitest';
import {
  CREW_CODE_ALPHABET,
  CREW_CODE_LENGTH,
  generateCrewCode,
  isCrewCode,
  normaliseCrewCode,
} from './crew-code.js';

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

describe('crew codes', () => {
  it('excludes the characters that get misread aloud', () => {
    for (const banned of ['0', 'O', '1', 'I', 'L', '5', 'S']) {
      expect(CREW_CODE_ALPHABET, banned).not.toContain(banned);
    }
    expect(CREW_CODE_ALPHABET).toHaveLength(29);
  });

  it('generates a 6-character code drawn only from that alphabet', () => {
    const code = generateCrewCode(seeded(1));

    expect(code).toHaveLength(CREW_CODE_LENGTH);
    for (const char of code) expect(CREW_CODE_ALPHABET).toContain(char);
  });

  it('is deterministic for a seed and varies across seeds', () => {
    expect(generateCrewCode(seeded(7))).toBe(generateCrewCode(seeded(7)));
    expect(generateCrewCode(seeded(7))).not.toBe(generateCrewCode(seeded(8)));
  });

  it('accepts only well-formed codes', () => {
    expect(isCrewCode(generateCrewCode(seeded(3)))).toBe(true);
    expect(isCrewCode('LAGOS7'), 'contains L, O and S').toBe(false);
    expect(isCrewCode('ABC23'), 'too short').toBe(false);
    expect(isCrewCode('ABC234X'), 'too long').toBe(false);
    expect(isCrewCode('abc234'), 'lowercase is not a code').toBe(false);
    expect(isCrewCode(''), 'empty').toBe(false);
  });

  it('normalises what a player actually types', () => {
    expect(normaliseCrewCode('  abc234 ')).toBe('ABC234');
    expect(normaliseCrewCode('ABC-234')).toBe('ABC234');
  });
});
