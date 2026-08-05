import { describe, expect, it } from 'vitest';
import { playerPhase } from './player-phase.js';
import { NARRATION_SCRIPT } from './script.js';
import type { Phase, Role } from '../game-core/index.js';

const PHASES = Object.keys(NARRATION_SCRIPT) as Phase[];
const ROLES: Role[] = ['VILLAGER', 'MAFIA', 'DOCTOR', 'DETECTIVE'];

/**
 * A player watched a whole round go by and reported seeing one unchanging
 * screen. They were not wrong: the heading was their role, which never changes,
 * and the phase was a kicker two thirds smaller than it. Between their own taps
 * there was nothing on screen that moved.
 */
describe('what the player is told is happening', () => {
  it('has something to say in every phase, for every role', () => {
    for (const phase of PHASES) {
      for (const role of ROLES) {
        for (const alive of [true, false]) {
          const copy = playerPhase(phase, role, alive);

          expect(copy.title.trim(), `${phase}/${role}`).not.toBe('');
          expect(copy.line.trim(), `${phase}/${role}`).not.toBe('');
        }
      }
    }
  });

  it('leads with the phase, not with the role that never changes', () => {
    // The role belongs on screen all game, but it cannot be the headline: it is
    // the one thing guaranteed to look identical from start to finish.
    expect(playerPhase('DAY', 'MAFIA', true).title).not.toBe('Mafia');
    expect(playerPhase('NIGHT_DOCTOR', 'VILLAGER', true).title).not.toBe('Villager');
  });

  it('makes the reveal the exception, because that beat is the card', () => {
    expect(playerPhase('ROLE_REVEAL', 'MAFIA', true).title).toBe('Mafia');
  });

  it('says plainly when there is nothing for this player to do', () => {
    // "Nothing to do" has to be stated. An empty screen is indistinguishable
    // from a broken one, which is exactly what got reported.
    const idle = playerPhase('NIGHT_DOCTOR', 'VILLAGER', true);

    expect(idle.waiting).toBe(true);
    expect(idle.line.toLowerCase()).toMatch(/listen|wait|quiet|noth/);
  });

  it('does not call it waiting when the player has a tap to make', () => {
    expect(playerPhase('NIGHT_MAFIA', 'MAFIA', true).waiting).toBe(false);
    expect(playerPhase('NIGHT_DOCTOR', 'DOCTOR', true).waiting).toBe(false);
    expect(playerPhase('NIGHT_DETECTIVE', 'DETECTIVE', true).waiting).toBe(false);
    expect(playerPhase('VOTE', 'VILLAGER', true).waiting).toBe(false);
  });

  it('never gives a dead player something to do', () => {
    for (const phase of PHASES) {
      for (const role of ROLES) {
        expect(playerPhase(phase, role, false).waiting, `${phase}/${role}`).toBe(true);
      }
    }
  });

  it('tells the eliminated they are out rather than leaving them guessing', () => {
    expect(playerPhase('DAY', 'VILLAGER', false).line.toLowerCase()).toMatch(/out|eliminated|dead/);
  });

  it('never names another player’s role, in any phase', () => {
    // The copy is keyed on the phase and this player's own card. Naming any
    // other role here would leak through the one screen everybody can see.
    for (const phase of PHASES) {
      for (const role of ROLES) {
        const said = Object.values(playerPhase(phase, role, true)).join(' ');
        const others = ROLES.filter((r) => r !== role && r !== 'VILLAGER');

        for (const other of others) {
          const label = other.charAt(0) + other.slice(1).toLowerCase();
          expect(said, `${phase}/${role} named ${label}`).not.toContain(label);
        }
      }
    }
  });

  it('writes it the way the rest of the copy is written', () => {
    for (const phase of PHASES) {
      for (const role of ROLES) {
        const { line } = playerPhase(phase, role, true);

        expect(line, `${phase}/${role}`).not.toContain('—');
        expect(line.trim(), `${phase}/${role}: "${line}"`).toMatch(/[.?!…]$/);
      }
    }
  });
});
