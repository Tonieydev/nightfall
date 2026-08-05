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

  it('records the names taken, not a single name', () => {
    const next = resolveNight(night({ mafiaVotes: { m1: 'v1', m2: 'v1' }, doctorSave: 'v1' }));

    expect(next.lastNight).toMatchObject({
      targetIds: ['v1'],
      savedId: 'v1',
      eliminatedIds: [],
    });
  });
});

/**
 * How many the mafia may take in a night is the GM's to set before the game.
 * The ballot still decides WHO — the count only says how many names it is
 * allowed to settle on.
 */
describe('resolveNight with more than one kill a night', () => {
  const twoKills = (players: Player[] = cast()): Partial<GameState> => ({
    config: { ...gameState(players).config, nightKills: 2 },
  });

  it('takes one a night when the GM never said otherwise', () => {
    // Absent, not zero: every game played before the setting existed, and every
    // game whose GM leaves it alone, is a one-kill game.
    const state = night({ mafiaVotes: { m1: 'v1', m2: 'v2' } });

    expect(state.config.nightKills).toBeUndefined();
    expect(resolveNight(state).players.filter((p) => !p.alive)).toHaveLength(0);
  });

  it('takes both names when two were allowed and two were cast', () => {
    const next = resolveNight(night({ mafiaVotes: { m1: 'v1', m2: 'v2' } }, cast(), twoKills()));

    expect(alive(next, 'v1')).toBe(false);
    expect(alive(next, 'v2')).toBe(false);
    expect(next.lastNight?.eliminatedIds.sort()).toEqual(['v1', 'v2']);
  });

  it('lets the doctor pull back one of the two, never both', () => {
    const next = resolveNight(
      night({ mafiaVotes: { m1: 'v1', m2: 'v2' }, doctorSave: 'v1' }, cast(), twoKills()),
    );

    expect(alive(next, 'v1')).toBe(true);
    expect(alive(next, 'v2')).toBe(false);
    expect(next.lastNight).toMatchObject({ savedId: 'v1', eliminatedIds: ['v2'] });
  });

  it('stamps every one of them with the cause and the phase', () => {
    const next = resolveNight(
      night({ mafiaVotes: { m1: 'v1', m2: 'doc' } }, cast(), {
        ...twoKills(),
        phaseNumber: 4,
      }),
    );

    for (const id of ['v1', 'doc']) {
      expect(next.players.find((p) => p.id === id), id).toMatchObject({
        alive: false,
        eliminatedBy: 'MAFIA',
        eliminatedAtPhase: 4,
      });
    }
  });

  it('still takes nobody when the mafia never agreed on anyone', () => {
    const next = resolveNight(night({ mafiaVotes: {} }, cast(), twoKills()));

    expect(next.players.every((p) => p.alive)).toBe(true);
    expect(next.lastNight?.eliminatedIds).toEqual([]);
  });

  it('leaves the second kill unspent rather than break a tie for it', () => {
    // Four mafia: two on v1, then v2 and doc level for the one slot left. v1
    // goes; the slot stays empty. A tie kills nobody, at any kill count.
    const players = [
      player('m1', 'MAFIA'),
      player('m2', 'MAFIA'),
      player('m3', 'MAFIA'),
      player('m4', 'MAFIA'),
      player('v1', 'VILLAGER'),
      player('v2', 'VILLAGER'),
      player('doc', 'DOCTOR'),
    ];
    const next = resolveNight(
      night({ mafiaVotes: { m1: 'v1', m2: 'v1', m3: 'v2', m4: 'doc' } }, players, twoKills(players)),
    );

    expect(next.lastNight?.eliminatedIds).toEqual(['v1']);
    expect(alive(next, 'v2')).toBe(true);
    expect(alive(next, 'doc')).toBe(true);
  });

  it('cannot take a name the mafia never cast', () => {
    // Three kills allowed, one name agreed on. The extra slots go unused —
    // the count is a ceiling, never a quota.
    const next = resolveNight(
      night({ mafiaVotes: { m1: 'v1', m2: 'v1' } }, cast(), {
        config: { ...gameState(cast()).config, nightKills: 3 },
      }),
    );

    expect(next.players.filter((p) => !p.alive).map((p) => p.id)).toEqual(['v1']);
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
