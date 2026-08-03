import { describe, expect, it } from 'vitest';
import { assignRoles } from './assign-roles.js';
import type { GameConfig, Role } from './types.js';

const autoConfig: GameConfig = {
  mafiaCount: null,
  doctor: true,
  detective: true,
  mafiaNightMs: 45_000,
};

// Deterministic PRNG so assignment is reproducible under test.
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

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i + 1}`);
}

function counts(map: Record<string, Role>): Record<Role, number> {
  const tally: Record<Role, number> = { VILLAGER: 0, MAFIA: 0, DOCTOR: 0, DETECTIVE: 0 };
  for (const role of Object.values(map)) tally[role] += 1;
  return tally;
}

describe('assignRoles', () => {
  it('gives 5 players 1 Mafia, 1 Doctor, 1 Detective and 2 Villagers', () => {
    const result = assignRoles(ids(5), autoConfig, seeded(1));

    expect(counts(result)).toEqual({ MAFIA: 1, DOCTOR: 1, DETECTIVE: 1, VILLAGER: 2 });
  });

  it('gives 8 players 2 Mafia', () => {
    expect(counts(assignRoles(ids(8), autoConfig, seeded(2))).MAFIA).toBe(2);
  });

  it('gives 12 players 3 Mafia', () => {
    expect(counts(assignRoles(ids(12), autoConfig, seeded(3))).MAFIA).toBe(3);
  });

  it('returns exactly one role per player at every legal seat count', () => {
    for (let seats = 5; seats <= 12; seats += 1) {
      const result = assignRoles(ids(seats), autoConfig, seeded(seats));

      expect(Object.keys(result)).toHaveLength(seats);
      expect(new Set(Object.keys(result))).toEqual(new Set(ids(seats)));
    }
  });

  it('lets an explicit mafiaCount override the ratio', () => {
    const result = assignRoles(ids(12), { ...autoConfig, mafiaCount: 1 }, seeded(4));

    expect(counts(result)).toEqual({ MAFIA: 1, DOCTOR: 1, DETECTIVE: 1, VILLAGER: 9 });
  });

  it('produces no Doctor when the config disables one', () => {
    const result = assignRoles(ids(8), { ...autoConfig, doctor: false }, seeded(5));

    expect(counts(result)).toEqual({ MAFIA: 2, DOCTOR: 0, DETECTIVE: 1, VILLAGER: 5 });
  });

  it('produces no Detective when the config disables one', () => {
    const result = assignRoles(ids(8), { ...autoConfig, detective: false }, seeded(8));

    expect(counts(result)).toEqual({ MAFIA: 2, DOCTOR: 1, DETECTIVE: 0, VILLAGER: 5 });
  });

  it('is deterministic for a given seed and varies across seeds', () => {
    const a = assignRoles(ids(10), autoConfig, seeded(99));
    const b = assignRoles(ids(10), autoConfig, seeded(99));
    const c = assignRoles(ids(10), autoConfig, seeded(100));

    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('throws when Mafia would start at or above parity with Town', () => {
    expect(() => assignRoles(ids(6), { ...autoConfig, mafiaCount: 3 }, seeded(6))).toThrow(
      /parity/i,
    );
    expect(() => assignRoles(ids(6), { ...autoConfig, mafiaCount: 4 }, seeded(6))).toThrow(
      /parity/i,
    );
  });

  it('throws below the 5-player start gate', () => {
    expect(() => assignRoles(ids(4), autoConfig, seeded(7))).toThrow(/at least 5/i);
    expect(() => assignRoles([], autoConfig, seeded(7))).toThrow(/at least 5/i);
  });
});
