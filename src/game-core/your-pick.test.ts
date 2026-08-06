import { describe, expect, it } from 'vitest';
import { projectState } from './project-state.js';
import { gameState, player } from './state.fixture.js';
import type { GameState, Player } from './types.js';

const cast = (): Player[] => [
  player('m1', 'MAFIA'),
  player('m2', 'MAFIA'),
  player('v1', 'VILLAGER'),
  player('v2', 'VILLAGER'),
  player('doc', 'DOCTOR'),
  player('det', 'DETECTIVE'),
];

const night = (phase: GameState['phase'], overrides: Partial<GameState['night']>): GameState =>
  gameState(cast(), {
    phase,
    phaseNumber: 2,
    night: { mafiaVotes: {}, doctorSave: null, detectiveCheck: null, ...overrides },
  });

/**
 * You tap a name and the screen says nothing back. Every night role had this:
 * only the mafia ballot was projected at all, and even a mafia could not tell
 * which of the two names on it was theirs.
 *
 * What comes back is only ever this viewer's own choice, which is a thing they
 * just did and already know.
 */
describe('your own night pick comes back to you', () => {
  it('gives a mafia the name they chose', () => {
    const state = night('NIGHT_MAFIA', { mafiaVotes: { m1: 'v1', m2: 'v2' } });

    expect(projectState(state, 'm1').night.yourPick).toBe('v1');
    expect(projectState(state, 'm2').night.yourPick).toBe('v2');
  });

  it('gives the doctor the name they saved', () => {
    const state = night('NIGHT_DOCTOR', { doctorSave: 'v1' });

    expect(projectState(state, 'doc').night.yourPick).toBe('v1');
  });

  it('gives the detective the face they chose', () => {
    const state = night('NIGHT_DETECTIVE', { detectiveCheck: 'm1' });

    expect(projectState(state, 'det').night.yourPick).toBe('m1');
  });

  it('is null before they have chosen', () => {
    expect(projectState(night('NIGHT_MAFIA', {}), 'm1').night.yourPick).toBeNull();
    expect(projectState(night('NIGHT_DOCTOR', {}), 'doc').night.yourPick).toBeNull();
  });

  it('never hands one role another role’s pick', () => {
    const state = night('NIGHT_DOCTOR', {
      mafiaVotes: { m1: 'v1', m2: 'v1' },
      doctorSave: 'v2',
      detectiveCheck: 'v1',
    });

    expect(projectState(state, 'm1').night.yourPick, 'a mafia sees their own vote').toBe('v1');
    expect(projectState(state, 'v1').night.yourPick, 'a villager picks nothing').toBeNull();
    expect(projectState(state, 'det').night.yourPick, 'the detective sees their check').toBe('v1');
  });

  it('keeps the doctor’s save from the GM until dawn', () => {
    // Deliberate and long-standing: the GM narrates around the night and
    // knowing the save early is exactly what leaks into how they narrate it.
    const state = night('NIGHT_DOCTOR', { doctorSave: 'v1' });

    expect(projectState(state, 'gm').night.yourPick).toBeNull();
  });

  it('leaks nothing on the wire to anybody it is not for', () => {
    // Asserted on serialized JSON, like roles: a field can be present in the
    // payload while the type says otherwise, and JSON is what is received.
    const state = night('NIGHT_DOCTOR', {
      mafiaVotes: { m1: 'v1' },
      doctorSave: 'v2',
      detectiveCheck: 'doc',
    });

    for (const viewer of ['v1', 'v2']) {
      const wire = JSON.stringify(projectState(state, viewer));

      expect(wire, `${viewer} saw a night choice`).toContain('"yourPick":null');
    }
  });
});
