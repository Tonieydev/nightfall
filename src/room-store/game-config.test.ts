import { describe, expect, it } from 'vitest';
import { assignRoles, type GameConfig } from '../game-core/index.js';
import {
  DAY_TARGET_CHOICES,
  MAFIA_NIGHT_CHOICES,
  MAFIA_NIGHT_MAX_MS,
  MAFIA_NIGHT_MIN_MS,
  NIGHT_KILL_CHOICES,
  configProblems,
  mafiaCountFor,
} from './game-config.js';
import { DEFAULT_GAME_CONFIG } from './lobby.js';

const base: GameConfig = { mafiaCount: null, doctor: true, detective: true, mafiaNightMs: 60_000 };
const rng = () => 0.5;

describe('the default night is a minute', () => {
  it('gives the mafia sixty seconds, not forty-five', () => {
    expect(DEFAULT_GAME_CONFIG.mafiaNightMs).toBe(60_000);
  });

  it('offers the GM a spread either side of it', () => {
    expect(MAFIA_NIGHT_CHOICES).toContain(DEFAULT_GAME_CONFIG.mafiaNightMs);
    for (const choice of MAFIA_NIGHT_CHOICES) {
      expect(choice, `${String(choice)}ms`).toBeGreaterThanOrEqual(MAFIA_NIGHT_MIN_MS);
      expect(choice, `${String(choice)}ms`).toBeLessThanOrEqual(MAFIA_NIGHT_MAX_MS);
    }
  });

  it('lets the GM skip the day target entirely', () => {
    // Not every GM wants a clock on the conversation.
    expect(DAY_TARGET_CHOICES).toContain(null);
  });
});

describe('how many the mafia may take in a night', () => {
  it('is one unless the GM says otherwise', () => {
    // Absent rather than 1, so a game recorded before the setting existed reads
    // back the same way it was played.
    expect(DEFAULT_GAME_CONFIG.nightKills).toBeUndefined();
    expect(NIGHT_KILL_CHOICES[0]).toBe(1);
  });

  it('passes a big room taking two a night', () => {
    expect(configProblems({ ...base, mafiaCount: 2, nightKills: 2 }, 10, null)).toEqual([]);
  });

  it('refuses a kill count below one', () => {
    // A night that cannot take anybody is not a game, it is a stalemate.
    expect(configProblems({ ...base, nightKills: 0 }, 8, null)).not.toEqual([]);
  });

  it('refuses more kills than there are mafia to name them', () => {
    // Each mafia casts one name, so two mafia can never settle on three.
    const problems = configProblems({ ...base, mafiaCount: 2, nightKills: 3 }, 11, null);

    expect(problems.join(' ')).toMatch(/mafia/i);
  });

  it('refuses a kill count that ends the game on the first night', () => {
    // Six players, one mafia, two kills: town goes 5 -> 3 -> 1 and it is over
    // before anybody has said anything worth hearing.
    const problems = configProblems({ ...base, mafiaCount: 2, nightKills: 2 }, 6, null);

    expect(problems.join(' ')).toMatch(/night/i);
  });

  it('says nothing about a kill count the GM left alone', () => {
    expect(configProblems(base, 5, null)).toEqual([]);
  });
});

describe('what the GM is told before they commit', () => {
  it('passes a sane six-player room', () => {
    expect(configProblems(base, 5, null)).toEqual([]);
  });

  it('refuses more mafia than there are players', () => {
    const problems = configProblems({ ...base, mafiaCount: 9 }, 5, null);

    expect(problems.join(' ')).toMatch(/more mafia than there are players|parity/i);
    expect(problems.length).toBeGreaterThan(0);
  });

  it('refuses a lineup that starts at parity, exactly as game-core would', () => {
    // Three mafia against two town. Five players, because game-core's own
    // five-player minimum fires first on anything smaller and would mask this.
    const config = { ...base, mafiaCount: 3 };

    expect(configProblems(config, 5, null).length).toBeGreaterThan(0);
    // The pre-Start check has to agree with the thing that actually throws,
    // or the GM is warned about the wrong lineup — or worse, not warned.
    expect(() => assignRoles(['a', 'b', 'c', 'd', 'e'], config, rng)).toThrow(/parity/i);
  });

  it('agrees with game-core across every lineup a room can hold', () => {
    for (let players = 5; players <= 11; players += 1) {
      for (let mafia = 1; mafia <= players; mafia += 1) {
        const config = { ...base, mafiaCount: mafia };
        const ids = Array.from({ length: players }, (_, i) => `p${String(i)}`);

        const flagged = configProblems(config, players, null).length > 0;
        let threw = false;
        try {
          assignRoles(ids, config, rng);
        } catch {
          threw = true;
        }

        expect(flagged, `${String(mafia)} mafia in ${String(players)} players`).toBe(threw);
      }
    }
  });

  it('refuses too few players to start at all', () => {
    expect(configProblems(base, 4, null).length).toBeGreaterThan(0);
  });

  it('refuses a night nobody could act in, and one that outlives the room', () => {
    expect(configProblems({ ...base, mafiaNightMs: 5_000 }, 5, null).length).toBeGreaterThan(0);
    expect(configProblems({ ...base, mafiaNightMs: 3_600_000 }, 5, null).length).toBeGreaterThan(0);
  });

  it('refuses a day target longer than the room itself lives', () => {
    // The room dies at ninety minutes whatever the GM hoped for.
    expect(configProblems(base, 5, 91 * 60_000).length).toBeGreaterThan(0);
    expect(configProblems(base, 5, 5 * 60_000)).toEqual([]);
  });

  it('says what is wrong in words a GM can act on', () => {
    for (const problem of configProblems({ ...base, mafiaCount: 4 }, 5, null)) {
      expect(problem).toMatch(/[a-z]/);
      expect(problem.length).toBeGreaterThan(15);
      // Not an exception message leaking implementation at the GM.
      expect(problem).not.toMatch(/Error|undefined|null|throw/);
    }
  });
});

describe('the derived mafia count', () => {
  it('matches what game-core would derive when the GM does not override', () => {
    for (let players = 5; players <= 11; players += 1) {
      const derived = mafiaCountFor(players, null);
      const ids = Array.from({ length: players }, (_, i) => `p${String(i)}`);
      const roles = assignRoles(ids, base, rng);
      const actual = Object.values(roles).filter((r) => r === 'MAFIA').length;

      expect(derived, `${String(players)} players`).toBe(actual);
    }
  });
});
