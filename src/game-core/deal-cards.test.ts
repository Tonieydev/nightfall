import { describe, expect, it } from 'vitest';
import { HISTORY_ROUNDS, dealCards, recordRound } from './deal-cards.js';
import type { Role } from './types.js';

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

const NAMES = ['Ada', 'Bayo', 'Chidi', 'Dami', 'Ese', 'Femi', 'Gozie', 'Hauwa'];

function tally(cards: { role: Role }[]): Record<Role, number> {
  const counts: Record<Role, number> = { VILLAGER: 0, MAFIA: 0, DOCTOR: 0, DETECTIVE: 0 };
  for (const card of cards) counts[card.role] += 1;
  return counts;
}

describe('dealCards', () => {
  it('deals one card per name, in the order the names were given', () => {
    const cards = dealCards(NAMES, { mafia: 2, doctors: 1 }, [], seeded(1));

    expect(cards.map((card) => card.name)).toEqual(NAMES);
  });

  it('deals exactly the requested mafia and doctors, the rest villagers', () => {
    const cards = dealCards(NAMES, { mafia: 2, doctors: 2 }, [], seeded(2));

    expect(tally(cards)).toEqual({ MAFIA: 2, DOCTOR: 2, VILLAGER: 4, DETECTIVE: 0 });
  });

  it('is deterministic for a seed and varies across seeds', () => {
    const a = dealCards(NAMES, { mafia: 2, doctors: 1 }, [], seeded(7));
    const b = dealCards(NAMES, { mafia: 2, doctors: 1 }, [], seeded(7));
    const c = dealCards(NAMES, { mafia: 2, doctors: 1 }, [], seeded(8));

    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('refuses fewer than 5 players', () => {
    expect(() => dealCards(NAMES.slice(0, 4), { mafia: 1, doctors: 0 }, [], seeded(1))).toThrow(
      /at least 5/i,
    );
  });

  it('refuses duplicate names, ignoring case and surrounding space', () => {
    const names = ['Ada', ' ada ', 'Chidi', 'Dami', 'Ese'];

    expect(() => dealCards(names, { mafia: 1, doctors: 0 }, [], seeded(1))).toThrow(/duplicate/i);
  });

  it('refuses a blank name', () => {
    const names = ['Ada', '  ', 'Chidi', 'Dami', 'Ese'];

    expect(() => dealCards(names, { mafia: 1, doctors: 0 }, [], seeded(1))).toThrow(/blank/i);
  });

  it('refuses mafia at or above parity with the rest', () => {
    expect(() => dealCards(NAMES.slice(0, 6), { mafia: 3, doctors: 0 }, [], seeded(1))).toThrow(
      /parity/i,
    );
  });

  it('refuses zero mafia', () => {
    expect(() => dealCards(NAMES, { mafia: 0, doctors: 0 }, [], seeded(1))).toThrow(/at least 1/i);
  });

  it('refuses more doctors than there are non-mafia seats', () => {
    expect(() => dealCards(NAMES.slice(0, 5), { mafia: 1, doctors: 5 }, [], seeded(1))).toThrow(
      /doctor/i,
    );
  });

  it('makes a recent mafia far less likely to be mafia again, but never impossible', () => {
    const history = [['Ada']];
    let adaMafia = 0;
    let bayoMafia = 0;
    const rounds = 4000;

    for (let seed = 1; seed <= rounds; seed += 1) {
      const cards = dealCards(NAMES, { mafia: 1, doctors: 0 }, history, seeded(seed));
      if (cards.find((card) => card.name === 'Ada')?.role === 'MAFIA') adaMafia += 1;
      if (cards.find((card) => card.name === 'Bayo')?.role === 'MAFIA') bayoMafia += 1;
    }

    expect(adaMafia).toBeGreaterThan(0);
    expect(adaMafia).toBeLessThan(bayoMafia / 3);
  });

  it('matches history names regardless of case', () => {
    const history = [['ADA']];
    let adaMafia = 0;
    let bayoMafia = 0;

    for (let seed = 1; seed <= 2000; seed += 1) {
      const cards = dealCards(NAMES, { mafia: 1, doctors: 0 }, history, seeded(seed));
      if (cards.find((card) => card.name === 'Ada')?.role === 'MAFIA') adaMafia += 1;
      if (cards.find((card) => card.name === 'Bayo')?.role === 'MAFIA') bayoMafia += 1;
    }

    expect(adaMafia).toBeLessThan(bayoMafia / 3);
  });

  it('is uniform when there is no history', () => {
    const hits: Record<string, number> = {};
    for (let seed = 1; seed <= 4000; seed += 1) {
      for (const card of dealCards(NAMES, { mafia: 1, doctors: 0 }, [], seeded(seed))) {
        if (card.role === 'MAFIA') hits[card.name] = (hits[card.name] ?? 0) + 1;
      }
    }

    // 4000 / 8 = 500 each; a wide band keeps this about bias, not noise.
    for (const name of NAMES) {
      expect(hits[name]).toBeGreaterThan(400);
      expect(hits[name]).toBeLessThan(600);
    }
  });
});

describe('recordRound', () => {
  it('appends the round the dealt mafia played', () => {
    const cards = dealCards(NAMES, { mafia: 2, doctors: 0 }, [], seeded(3));
    const mafia = cards.filter((card) => card.role === 'MAFIA').map((card) => card.name);

    expect(recordRound([], cards)).toEqual([mafia]);
  });

  it('keeps only the most recent rounds', () => {
    let history: string[][] = [];
    for (let round = 0; round < HISTORY_ROUNDS + 2; round += 1) {
      history = recordRound(history, [{ name: `Round${round}`, role: 'MAFIA' }]);
    }

    expect(history).toHaveLength(HISTORY_ROUNDS);
    expect(history.at(-1)).toEqual([`Round${HISTORY_ROUNDS + 1}`]);
  });
});
