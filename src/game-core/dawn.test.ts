import { describe, expect, it } from 'vitest';
import { advanceDawn, dawnScript, dawnRevealed } from './dawn.js';
import { projectState } from './project-state.js';
import { gameState, player } from './state.fixture.js';
import type { GameState, Player } from './types.js';

const cast = (): Player[] => [
  player('m1', 'MAFIA'),
  player('v1', 'VILLAGER'),
  player('v2', 'VILLAGER'),
  player('doc', 'DOCTOR'),
  player('det', 'DETECTIVE'),
];

/** Dawn of round 2, with v1 taken in the night. */
function dawn(overrides: Partial<GameState> = {}): GameState {
  const players = cast();
  players[1] = player('v1', 'VILLAGER', {
    alive: false,
    eliminatedAtPhase: 2,
    eliminatedBy: 'MAFIA',
  });

  return gameState(players, {
    phase: 'DAWN',
    phaseNumber: 2,
    dawnBeat: 0,
    lastNight: {
      phaseNumber: 2,
      targetIds: ['v1'],
      savedId: null,
      eliminatedIds: ['v1'],
      detective: null,
    },
    ...overrides,
  });
}

const quiet = (): GameState =>
  gameState(cast(), {
    phase: 'DAWN',
    phaseNumber: 2,
    dawnBeat: 0,
    lastNight: {
      phaseNumber: 2,
      targetIds: ['v1'],
      savedId: 'v1',
      eliminatedIds: [],
      detective: null,
    },
  });

/**
 * The whole point: a player does not learn they are dead from a roster the
 * instant dawn opens. They learn it when the GM says their name.
 */
describe('the night, told back', () => {
  it('builds a script the GM reads a line at a time', () => {
    const script = dawnScript(dawn());

    expect(script.lines.length).toBeGreaterThan(2);
    expect(script.revealAt).toBe(script.lines.length - 1);
  });

  it('names the dead only in the last line', () => {
    const script = dawnScript(dawn());

    for (const line of script.lines.slice(0, script.revealAt)) {
      expect(line, `"${line}" named them early`).not.toContain('V1');
    }
    expect(script.lines[script.revealAt]).toContain('V1');
  });

  it('has a quiet night to tell as well', () => {
    const script = dawnScript(quiet());

    expect(script.lines[script.revealAt]?.toLowerCase()).toMatch(/everyone|nobody|all/);
  });

  it('steps a beat at a time and stops at the end', () => {
    let state = dawn();
    const last = dawnScript(state).lines.length - 1;

    for (let i = 0; i < last; i += 1) state = advanceDawn(state);

    expect(state.dawnBeat).toBe(last);
    expect(dawnRevealed(state)).toBe(true);
  });

  it('is not revealed until the beat that names them', () => {
    let state = dawn();
    const revealAt = dawnScript(state).revealAt;

    for (let i = 0; i < revealAt; i += 1) {
      expect(dawnRevealed(state), `beat ${String(i)}`).toBe(false);
      state = advanceDawn(state);
    }

    expect(dawnRevealed(state)).toBe(true);
  });

  it('counts any phase that is not dawn as told', () => {
    // Nothing outside DAWN is holding anything back.
    expect(dawnRevealed(gameState(cast(), { phase: 'DAY' }))).toBe(true);
    expect(dawnRevealed(gameState(cast(), { phase: 'NIGHT_MAFIA' }))).toBe(true);
  });
});

describe('the death is withheld until it is spoken', () => {
  it('shows the victim still alive to the room before the reveal', () => {
    const state = dawn();

    for (const viewer of ['v2', 'doc', 'det', 'm1']) {
      const seen = projectState(state, viewer).players.find((p) => p.id === 'v1');

      expect(seen?.alive, viewer).toBe(true);
    }
  });

  it('shows the victim themselves still alive before the reveal', () => {
    // They are the one person this exists for.
    expect(projectState(dawn(), 'v1').players.find((p) => p.id === 'v1')?.alive).toBe(true);
  });

  it('withholds the night outcome with it', () => {
    // lastNight names the eliminated, so projecting it early gives the game
    // away through a different field.
    expect(JSON.stringify(projectState(dawn(), 'v1'))).not.toContain('eliminatedIds');
  });

  it('tells the truth the moment the beat lands', () => {
    let state = dawn();
    for (let i = 0; i < dawnScript(state).revealAt; i += 1) state = advanceDawn(state);

    expect(projectState(state, 'v1').players.find((p) => p.id === 'v1')?.alive).toBe(false);
    expect(projectState(state, 'v2').players.find((p) => p.id === 'v1')?.alive).toBe(false);
  });

  it('never resurrects somebody who died in an earlier round', () => {
    // Only this round's deaths are held back. A body from last night is old
    // news and hiding it would rewrite the game.
    const players = cast();
    players[2] = player('v2', 'VILLAGER', {
      alive: false,
      eliminatedAtPhase: 1,
      eliminatedBy: 'MAFIA',
    });
    const state = dawn({ players });

    expect(projectState(state, 'v1').players.find((p) => p.id === 'v2')?.alive).toBe(false);
  });

  it('gives every viewer the lines told so far and no more', () => {
    let state = dawn();

    expect(projectState(state, 'v2').dawn?.lines).toHaveLength(1);
    state = advanceDawn(state);
    expect(projectState(state, 'v2').dawn?.lines).toHaveLength(2);
  });

  it('says nothing about dawn in any other phase', () => {
    expect(projectState(gameState(cast(), { phase: 'DAY' }), 'v1').dawn).toBeNull();
  });
});
