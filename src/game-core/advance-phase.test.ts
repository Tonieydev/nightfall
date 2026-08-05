import { describe, expect, it } from 'vitest';
import { advancePhase } from './advance-phase.js';
import { dead, gameState, player } from './state.fixture.js';
import type { Phase, Player } from './types.js';

const NOW = 1_700_000_000_000;

const cast = (): Player[] => [
  player('m1', 'MAFIA'),
  player('v1', 'VILLAGER'),
  player('v2', 'VILLAGER'),
  player('doc', 'DOCTOR'),
  player('det', 'DETECTIVE'),
];

describe('advancePhase', () => {
  it('walks the full legal order and loops back to NIGHT_MAFIA', () => {
    const expected: Phase[] = [
      'ROLE_REVEAL',
      'NIGHT_MAFIA',
      'NIGHT_DOCTOR',
      'NIGHT_DETECTIVE',
      'DAWN',
      'DAY',
      'VOTE',
      'VERDICT',
      'NIGHT_MAFIA',
    ];

    let state = gameState(cast(), { phase: 'LOBBY', phaseNumber: 0 });
    const walked: Phase[] = [];
    for (let step = 0; step < expected.length; step += 1) {
      state = advancePhase(state, NOW);
      walked.push(state.phase);
    }

    expect(walked).toEqual(expected);
  });

  it('skips NIGHT_DOCTOR when no Doctor is alive', () => {
    const state = gameState(
      [
        player('m1', 'MAFIA'),
        player('v1', 'VILLAGER'),
        player('v2', 'VILLAGER'),
        dead('doc', 'DOCTOR'),
        player('det', 'DETECTIVE'),
      ],
      { phase: 'NIGHT_MAFIA' },
    );

    expect(advancePhase(state, NOW).phase).toBe('NIGHT_DETECTIVE');
  });

  it('skips NIGHT_DETECTIVE when no Detective is alive', () => {
    const state = gameState(
      [
        player('m1', 'MAFIA'),
        player('v1', 'VILLAGER'),
        player('v2', 'VILLAGER'),
        player('doc', 'DOCTOR'),
        dead('det', 'DETECTIVE'),
      ],
      { phase: 'NIGHT_DOCTOR' },
    );

    expect(advancePhase(state, NOW).phase).toBe('DAWN');
  });

  it('skips straight to DAWN when neither night role is alive', () => {
    const state = gameState(
      [
        player('m1', 'MAFIA'),
        player('v1', 'VILLAGER'),
        player('v2', 'VILLAGER'),
        dead('doc', 'DOCTOR'),
        dead('det', 'DETECTIVE'),
      ],
      { phase: 'NIGHT_MAFIA' },
    );

    expect(advancePhase(state, NOW).phase).toBe('DAWN');
  });

  it('sets phaseEndsAt only when entering NIGHT_MAFIA', () => {
    let state = gameState(cast(), { phase: 'LOBBY', phaseNumber: 0, phaseEndsAt: 1 });

    for (let step = 0; step < 8; step += 1) {
      state = advancePhase(state, NOW);
      const expected = state.phase === 'NIGHT_MAFIA' ? NOW + state.config.mafiaNightMs : null;

      expect(state.phaseEndsAt, state.phase).toBe(expected);
    }
  });

  it('increments version on every returned state', () => {
    let state = gameState(cast(), { phase: 'LOBBY', phaseNumber: 0, version: 7 });

    for (let step = 1; step <= 8; step += 1) {
      state = advancePhase(state, NOW);

      expect(state.version).toBe(7 + step);
    }
  });

  it('never mutates the state it was given', () => {
    const state = gameState(cast(), {
      phase: 'DAY',
      dayVotes: { v1: 'm1' },
      night: { mafiaVotes: { m1: 'v1' }, doctorSave: 'v2', detectiveCheck: 'm1' },
    });
    const before = structuredClone(state);
    deepFreeze(state);

    const next = advancePhase(state, NOW);

    expect(state).toEqual(before);
    expect(next).not.toBe(state);
    expect(next.players).not.toBe(state.players);
  });

  it('throws when advanced out of GAME_OVER', () => {
    const state = gameState(cast(), { phase: 'GAME_OVER', winner: 'TOWN' });

    expect(() => advancePhase(state, NOW)).toThrow(/GAME_OVER/);
  });

  it('diverts to GAME_OVER from any phase once the game is decided', () => {
    const mafiaWin = [
      player('m1', 'MAFIA'),
      player('m2', 'MAFIA'),
      dead('v1', 'VILLAGER'),
      dead('v2', 'VILLAGER'),
      player('doc', 'DOCTOR'),
      player('det', 'DETECTIVE'),
    ];

    for (const phase of ['DAWN', 'DAY', 'VOTE', 'NIGHT_MAFIA', 'ROLE_REVEAL'] as const) {
      const next = advancePhase(gameState(mafiaWin, { phase }), NOW);

      expect(next.phase, phase).toBe('GAME_OVER');
      expect(next.winner, phase).toBe('MAFIA');
      expect(next.phaseEndsAt, phase).toBeNull();
    }
  });

  it('records a TOWN win when the last Mafia is gone', () => {
    const townWin = [
      dead('m1', 'MAFIA'),
      player('v1', 'VILLAGER'),
      player('v2', 'VILLAGER'),
      player('doc', 'DOCTOR'),
      player('det', 'DETECTIVE'),
    ];
    const next = advancePhase(gameState(townWin, { phase: 'VOTE' }), NOW);

    expect(next.phase).toBe('GAME_OVER');
    expect(next.winner).toBe('TOWN');
  });

  it('starts a clean cycle on entering NIGHT_MAFIA', () => {
    const state = gameState(cast(), {
      phase: 'VERDICT',
      phaseNumber: 1,
      night: { mafiaVotes: { m1: 'v1' }, doctorSave: 'v1', detectiveCheck: 'v2' },
    });

    const next = advancePhase(state, NOW);

    expect(next.phase).toBe('NIGHT_MAFIA');
    expect(next.phaseNumber).toBe(2);
    expect(next.night).toEqual({ mafiaVotes: {}, doctorSave: null, detectiveCheck: null });
  });

  it('clears the previous round of day votes on entering VOTE', () => {
    const state = gameState(cast(), { phase: 'DAY', dayVotes: { v1: 'm1', v2: 'm1' } });

    const next = advancePhase(state, NOW);

    expect(next.phase).toBe('VOTE');
    expect(next.dayVotes).toEqual({});
  });
});

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const nested of Object.values(value)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
