import { describe, expect, it } from 'vitest';
import { projectState } from './project-state.js';
import { dead, gameState, player } from './state.fixture.js';
import type { GameState, Player, Role } from './types.js';

const cast = (): Player[] => [
  player('m1', 'MAFIA'),
  player('m2', 'MAFIA'),
  player('v1', 'VILLAGER'),
  player('v2', 'VILLAGER'),
  player('doc', 'DOCTOR'),
  player('det', 'DETECTIVE'),
];

const ROLES: Role[] = ['VILLAGER', 'MAFIA', 'DOCTOR', 'DETECTIVE'];

// The guarantee is about bytes on the wire, so the assertion is made on them.
function roleMentions(view: unknown): Record<Role, number> {
  const json = JSON.stringify(view);
  const tally = {} as Record<Role, number>;
  for (const role of ROLES) {
    tally[role] = json.split(`"${role}"`).length - 1;
  }
  return tally;
}

function day(players: Player[] = cast(), overrides: Partial<GameState> = {}): GameState {
  return gameState(players, { phase: 'DAY', phaseNumber: 2, ...overrides });
}

describe('projectState', () => {
  it('gives a living Villager their own role and nobody else’s', () => {
    const view = projectState(day(), 'v1');

    expect(roleMentions(view)).toEqual({ VILLAGER: 1, MAFIA: 0, DOCTOR: 0, DETECTIVE: 0 });
    expect(view.players.find((p) => p.id === 'v1')?.role).toBe('VILLAGER');
    expect(view.players.filter((p) => p.id !== 'v1').every((p) => p.role === null)).toBe(true);
  });

  it('shows a Mafia their fellow Mafia and no Town role', () => {
    const view = projectState(day(), 'm1');

    expect(roleMentions(view)).toEqual({ MAFIA: 2, VILLAGER: 0, DOCTOR: 0, DETECTIVE: 0 });
    expect(view.players.filter((p) => p.role === 'MAFIA').map((p) => p.id)).toEqual(['m1', 'm2']);
  });

  it('shows the GM every role', () => {
    const view = projectState(day(), 'gm');

    expect(view.isGm).toBe(true);
    expect(roleMentions(view)).toEqual({ MAFIA: 2, VILLAGER: 2, DOCTOR: 1, DETECTIVE: 1 });
    expect(view.players.every((p) => p.role !== null)).toBe(true);
  });

  it('shows a dead player the graveyard and none of the living', () => {
    const players = [
      player('m1', 'MAFIA'),
      player('m2', 'MAFIA'),
      player('v1', 'VILLAGER'),
      dead('v2', 'VILLAGER'),
      dead('doc', 'DOCTOR'),
      player('det', 'DETECTIVE'),
    ];
    const view = projectState(day(players), 'v2');

    expect(roleMentions(view)).toEqual({ VILLAGER: 1, DOCTOR: 1, MAFIA: 0, DETECTIVE: 0 });
    expect(view.players.filter((p) => p.role !== null).map((p) => p.id)).toEqual(['v2', 'doc']);
  });

  it('revokes a dead Mafia’s view of their living partners', () => {
    const players = [
      dead('m1', 'MAFIA'),
      player('m2', 'MAFIA'),
      player('v1', 'VILLAGER'),
      player('v2', 'VILLAGER'),
      player('doc', 'DOCTOR'),
      player('det', 'DETECTIVE'),
    ];
    const view = projectState(day(players), 'm1');

    expect(roleMentions(view)).toEqual({ MAFIA: 1, VILLAGER: 0, DOCTOR: 0, DETECTIVE: 0 });
    expect(view.players.find((p) => p.id === 'm2')?.role).toBeNull();
  });

  it('never mutates the state it was given', () => {
    const state = day(cast(), {
      dayVotes: { v1: 'm1' },
      night: { mafiaVotes: { m1: 'v1' }, doctorSave: 'v2', detectiveCheck: 'm2' },
    });
    const before = structuredClone(state);

    for (const viewerId of ['gm', 'm1', 'v1', 'doc', 'det']) projectState(state, viewerId);

    expect(state).toEqual(before);
  });

  it('publishes the day vote to everyone', () => {
    const state = day(cast(), { phase: 'VOTE', dayVotes: { v1: 'm1', doc: 'm1' } });

    for (const viewerId of ['gm', 'm1', 'v1', 'doc', 'det']) {
      expect(projectState(state, viewerId).dayVotes, viewerId).toEqual({ v1: 'm1', doc: 'm1' });
    }
  });

  it('shows the Mafia night vote only to living Mafia and the GM', () => {
    const players = [
      player('m1', 'MAFIA'),
      player('m2', 'MAFIA'),
      dead('m3', 'MAFIA'),
      player('v1', 'VILLAGER'),
      player('doc', 'DOCTOR'),
      player('det', 'DETECTIVE'),
    ];
    const state = day(players, {
      phase: 'NIGHT_MAFIA',
      night: { mafiaVotes: { m1: 'v1', m2: 'v1' }, doctorSave: null, detectiveCheck: null },
    });

    for (const viewerId of ['gm', 'm1', 'm2']) {
      expect(projectState(state, viewerId).night.mafiaVotes, viewerId).toEqual({
        m1: 'v1',
        m2: 'v1',
      });
    }
    for (const viewerId of ['m3', 'v1', 'doc', 'det']) {
      const view = projectState(state, viewerId);

      expect(view.night.mafiaVotes, viewerId).toBeNull();
      expect(JSON.stringify(view), viewerId).not.toContain('"m1":"v1"');
    }
  });

  it('delivers the Detective result to the Detective and the GM only', () => {
    const state = day(cast(), {
      phase: 'DAWN',
      lastNight: {
        phaseNumber: 2,
        targetIds: ['v1'],
        savedId: 'v1',
        eliminatedIds: [],
        detective: { targetId: 'm1', team: 'MAFIA' },
      },
    });

    for (const viewerId of ['det', 'gm']) {
      expect(projectState(state, viewerId).detectiveResult, viewerId).toEqual({
        targetId: 'm1',
        team: 'MAFIA',
      });
    }
    for (const viewerId of ['m1', 'm2', 'v1', 'v2', 'doc']) {
      const view = projectState(state, viewerId);

      expect(view.detectiveResult, viewerId).toBeNull();
      expect(JSON.stringify(view), viewerId).not.toContain('"team"');
    }
  });

  it('keeps the full night outcome to the GM', () => {
    const outcome = {
      phaseNumber: 2,
      targetIds: ['v1'],
      savedId: 'v1',
      eliminatedIds: [],
      detective: null,
    };
    const state = day(cast(), { phase: 'DAWN', lastNight: outcome });

    expect(projectState(state, 'gm').lastNight).toEqual(outcome);
    for (const viewerId of ['m1', 'v1', 'doc', 'det']) {
      const view = projectState(state, viewerId);

      expect(view.lastNight, viewerId).toBeNull();
      expect(JSON.stringify(view), viewerId).not.toContain('"savedId"');
    }
  });

  it('reveals every card at GAME_OVER for the debrief', () => {
    const state = day(cast(), { phase: 'GAME_OVER', winner: 'TOWN' });

    for (const viewerId of ['v1', 'm1', 'doc', 'det', 'gm']) {
      const view = projectState(state, viewerId);

      expect(view.players.every((p) => p.role !== null), viewerId).toBe(true);
    }
  });

  it('gives an unrecognised viewer no role at all', () => {
    const view = projectState(day(), 'stranger');

    expect(roleMentions(view)).toEqual({ VILLAGER: 0, MAFIA: 0, DOCTOR: 0, DETECTIVE: 0 });
    expect(view.isGm).toBe(false);
    expect(view.night.mafiaVotes).toBeNull();
    expect(view.detectiveResult).toBeNull();
    expect(view.lastNight).toBeNull();
  });

  it('reveals nothing extra one phase before GAME_OVER', () => {
    const view = projectState(day(cast(), { phase: 'VOTE' }), 'v1');

    expect(roleMentions(view)).toEqual({ VILLAGER: 1, MAFIA: 0, DOCTOR: 0, DETECTIVE: 0 });
  });
});
