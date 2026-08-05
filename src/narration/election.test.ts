import { describe, expect, it } from 'vitest';
import { electionCopy } from './election.js';
import type { PlayerView } from '../game-core/index.js';

function seat(id: string, overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    id,
    name: id.toUpperCase(),
    alive: true,
    role: null,
    eliminatedAtPhase: null,
    eliminatedBy: null,
    ...overrides,
  };
}

const ROUND = 2;

/**
 * The card the whole room reads at the verdict, living and dead. It is the only
 * thing a day vote returns, so it has to answer the one question the room is
 * actually asking: did we get one.
 */
describe('the election card', () => {
  it('says so when the room caught a mafia', () => {
    const players = [
      seat('m1', { alive: false, eliminatedAtPhase: ROUND, eliminatedBy: 'VOTE', role: 'MAFIA' }),
      seat('v1'),
    ];

    const copy = electionCopy(players, ROUND);

    expect(copy.caught).toBe(true);
    expect(copy.name).toBe('M1');
    expect(copy.headline).toContain('M1');
    expect(copy.verdict.toLowerCase()).toContain('mafia');
  });

  it('says so when the room got it wrong', () => {
    const players = [
      seat('v1', {
        alive: false,
        eliminatedAtPhase: ROUND,
        eliminatedBy: 'VOTE',
        role: 'VILLAGER',
      }),
      seat('v2'),
    ];

    const copy = electionCopy(players, ROUND);

    expect(copy.caught).toBe(false);
    expect(copy.verdict).toBe('You did not catch the mafia.');
  });

  it('counts the doctor and the detective as a miss, not a catch', () => {
    for (const role of ['DOCTOR', 'DETECTIVE'] as const) {
      const players = [
        seat('x', { alive: false, eliminatedAtPhase: ROUND, eliminatedBy: 'VOTE', role }),
      ];

      expect(electionCopy(players, ROUND).caught, role).toBe(false);
    }
  });

  it('reports nobody when the ballot tied or nobody voted', () => {
    const copy = electionCopy([seat('v1'), seat('v2')], ROUND);

    expect(copy.caught).toBeNull();
    expect(copy.name).toBeNull();
    expect(copy.headline).toBe('Nobody was elected.');
  });

  it('ignores a death from any other cause', () => {
    // A night kill and a GM correction both leave a body in the same round. Only
    // the vote turns a card over, so only the vote gets a card.
    for (const cause of ['MAFIA', 'GM'] as const) {
      const players = [
        seat('v1', {
          alive: false,
          eliminatedAtPhase: ROUND,
          eliminatedBy: cause,
          role: 'VILLAGER',
        }),
      ];

      expect(electionCopy(players, ROUND).name, cause).toBeNull();
    }
  });

  it('ignores a player the room voted out in an earlier round', () => {
    const players = [
      seat('v1', { alive: false, eliminatedAtPhase: 1, eliminatedBy: 'VOTE', role: 'VILLAGER' }),
    ];

    expect(electionCopy(players, ROUND).name).toBeNull();
  });

  it('does not claim a catch it cannot see', () => {
    // Defensive about the projection rather than the game: if a card ever
    // arrives face down, the copy says so instead of guessing "not the mafia".
    const players = [
      seat('v1', { alive: false, eliminatedAtPhase: ROUND, eliminatedBy: 'VOTE', role: null }),
    ];

    const copy = electionCopy(players, ROUND);

    expect(copy.caught).toBeNull();
    expect(copy.name).toBe('V1');
  });
});
