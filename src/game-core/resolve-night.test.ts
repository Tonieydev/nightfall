import { describe, expect, it } from 'vitest';
import { resolveNight } from './resolve-night.js';
import { dead, gameState, player } from './state.fixture.js';
import type { GameState, NightState, Player } from './types.js';

const cast = (): Player[] => [
  player('m1', 'MAFIA'),
  player('m2', 'MAFIA'),
  player('v1', 'VILLAGER'),
  player('v2', 'VILLAGER'),
  player('doc', 'DOCTOR'),
  player('det', 'DETECTIVE'),
];

function night(
  overrides: Partial<NightState>,
  players: Player[] = cast(),
  stateOverrides: Partial<GameState> = {},
): GameState {
  return gameState(players, {
    phase: 'NIGHT_DETECTIVE',
    phaseNumber: 2,
    night: { mafiaVotes: {}, doctorSave: null, detectiveCheck: null, ...overrides },
    ...stateOverrides,
  });
}

function alive(state: GameState, id: string): boolean {
  const found = state.players.find((p) => p.id === id);
  if (found === undefined) throw new Error(`no player ${id}`);
  return found.alive;
}

describe('resolveNight', () => {
  it('kills the plurality target of the Mafia vote', () => {
    const state = night({ mafiaVotes: { m1: 'v1', m2: 'v1' } });

    const next = resolveNight(state);

    expect(alive(next, 'v1')).toBe(false);
    expect(alive(next, 'v2')).toBe(true);
  });

  it('kills nobody on a tie', () => {
    const next = resolveNight(night({ mafiaVotes: { m1: 'v1', m2: 'v2' } }));

    expect(next.players.every((p) => p.alive)).toBe(true);
  });

  it('kills nobody when no Mafia voted', () => {
    const next = resolveNight(night({ mafiaVotes: {} }));

    expect(next.players.every((p) => p.alive)).toBe(true);
  });

  it('negates the kill when the Doctor saves the target', () => {
    const next = resolveNight(night({ mafiaVotes: { m1: 'v1', m2: 'v1' }, doctorSave: 'v1' }));

    expect(alive(next, 'v1')).toBe(true);
    expect(next.players.every((p) => p.alive)).toBe(true);
  });

  it('does not negate the kill when the Doctor saves someone else', () => {
    const next = resolveNight(night({ mafiaVotes: { m1: 'v1', m2: 'v1' }, doctorSave: 'v2' }));

    expect(alive(next, 'v1')).toBe(false);
    expect(alive(next, 'v2')).toBe(true);
  });

  it('ignores a dead Mafia’s vote', () => {
    const players = [
      player('m1', 'MAFIA'),
      dead('m2', 'MAFIA'),
      player('v1', 'VILLAGER'),
      player('v2', 'VILLAGER'),
      player('doc', 'DOCTOR'),
      player('det', 'DETECTIVE'),
    ];

    const next = resolveNight(night({ mafiaVotes: { m1: 'v1', m2: 'v2' } }, players));

    expect(alive(next, 'v1')).toBe(false);
    expect(alive(next, 'v2')).toBe(true);
  });

  it('ignores votes cast at an already dead player', () => {
    const players = [
      player('m1', 'MAFIA'),
      player('m2', 'MAFIA'),
      dead('v1', 'VILLAGER'),
      player('v2', 'VILLAGER'),
      player('doc', 'DOCTOR'),
      player('det', 'DETECTIVE'),
    ];

    const next = resolveNight(night({ mafiaVotes: { m1: 'v1', m2: 'v1' } }, players));

    expect(next.players.filter((p) => !p.alive).map((p) => p.id)).toEqual(['v1']);
    expect(alive(next, 'v2')).toBe(true);
    expect(next.players.find((p) => p.id === 'v1')?.eliminatedBy).toBe('VOTE');
  });

  it('ignores a night vote cast by a player who is not Mafia', () => {
    const next = resolveNight(night({ mafiaVotes: { v1: 'm1', v2: 'm1', m1: 'v2' } }));

    expect(alive(next, 'm1')).toBe(true);
    expect(alive(next, 'v2')).toBe(false);
  });

  it('stamps the victim with the cause and the current phase number', () => {
    const state = night({ mafiaVotes: { m1: 'doc', m2: 'doc' } }, cast(), { phaseNumber: 3 });

    const victim = resolveNight(state).players.find((p) => p.id === 'doc');

    expect(victim).toMatchObject({
      alive: false,
      eliminatedBy: 'MAFIA',
      eliminatedAtPhase: 3,
    });
  });

  it('reports the checked player’s team and never their exact role', () => {
    const townCheck = resolveNight(night({ detectiveCheck: 'doc' }));
    const mafiaCheck = resolveNight(night({ detectiveCheck: 'm1' }));

    expect(townCheck.lastNight?.detective).toEqual({ targetId: 'doc', team: 'TOWN' });
    expect(mafiaCheck.lastNight?.detective).toEqual({ targetId: 'm1', team: 'MAFIA' });
    expect(JSON.stringify(townCheck.lastNight)).not.toContain('DOCTOR');
  });

  it('records no detective result when nobody was checked', () => {
    expect(resolveNight(night({})).lastNight?.detective).toBeNull();
  });

  it('records no detective result for a check on an unknown player', () => {
    expect(resolveNight(night({ detectiveCheck: 'nobody' })).lastNight?.detective).toBeNull();
  });

  it('never mutates the state it was given', () => {
    const state = night({ mafiaVotes: { m1: 'v1', m2: 'v1' }, detectiveCheck: 'm2' });
    const before = structuredClone(state);

    const next = resolveNight(state);

    expect(state).toEqual(before);
    expect(next.version).toBe(state.version + 1);
    expect(next.players).not.toBe(state.players);
  });
});
