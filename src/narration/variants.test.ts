import { describe, expect, it } from 'vitest';
import { NARRATION_SCRIPT, narrationFor } from './script.js';
import type { Phase } from '../game-core/index.js';

const PHASES = Object.keys(NARRATION_SCRIPT) as Phase[];

/**
 * A GM who runs four rounds says the same eight sentences four times, and by
 * the third night the room has stopped listening. The mechanics cannot move,
 * so the framing has to: same facts, different telling.
 */
describe('the script tells it differently each round', () => {
  it('offers more than one way to say every phase', () => {
    for (const phase of PHASES) {
      expect(NARRATION_SCRIPT[phase].variants.length, phase).toBeGreaterThan(1);
    }
  });

  it('gives a different telling on the second round', () => {
    for (const phase of PHASES) {
      const first = narrationFor(phase, 1).lines.join(' ');
      const second = narrationFor(phase, 2).lines.join(' ');

      expect(second, phase).not.toBe(first);
    }
  });

  it('comes back round rather than running out', () => {
    // A room can go longer than the script is deep. Wrapping is fine; an empty
    // card or a crash at round nine is not.
    for (const phase of PHASES) {
      for (const round of [1, 2, 3, 7, 12, 40]) {
        const card = narrationFor(phase, round);

        expect(card.lines.length, `${phase} round ${String(round)}`).toBeGreaterThan(0);
      }
    }
  });

  it('defaults to the first telling when nobody says which round', () => {
    for (const phase of PHASES) {
      expect(narrationFor(phase).lines, phase).toEqual(narrationFor(phase, 1).lines);
    }
  });

  it('keeps the facts identical in every telling', () => {
    // The instruction is the fact: whoever the phase wakes or puts under has to
    // be named in every variant, or the GM reads a round where the doctor is
    // never told to sleep. Only the framing around it may move.
    const mechanic: Partial<Record<Phase, string[]>> = {
      NIGHT_MAFIA: ['mafia, wake up'],
      NIGHT_DOCTOR: ['mafia, sleep', 'doctor, wake up'],
      NIGHT_DETECTIVE: ['doctor, sleep', 'detective, wake up'],
      DAWN: ['detective, sleep', 'everyone, wake up'],
    };

    for (const [phase, required] of Object.entries(mechanic)) {
      for (const variant of NARRATION_SCRIPT[phase as Phase].variants) {
        const said = variant.join(' ').toLowerCase();

        for (const fact of required) {
          expect(said, `${phase}: "${variant.join(' ')}"`).toContain(fact);
        }
      }
    }
  });

  it('keeps the cue and the button steady while the telling moves', () => {
    // The cue is instruction and the button is a control. Rotating either would
    // make the console itself unreliable, which is the opposite of the point.
    for (const phase of PHASES) {
      for (const round of [1, 2, 3, 4]) {
        const card = narrationFor(phase, round);

        expect(card.cue, phase).toBe(narrationFor(phase, 1).cue);
        expect(card.advanceLabel, phase).toBe(narrationFor(phase, 1).advanceLabel);
        expect(card.sleepLabel, phase).toBe(narrationFor(phase, 1).sleepLabel);
      }
    }
  });

  it('writes every variant as real spoken lines', () => {
    for (const phase of PHASES) {
      for (const variant of NARRATION_SCRIPT[phase].variants) {
        expect(variant.length, phase).toBeGreaterThan(0);

        for (const line of variant) {
          expect(line.trim(), phase).not.toBe('');
          expect(line.trim(), `${phase}: "${line}"`).toMatch(/[.?!…]$/);
          expect(line, `${phase}: "${line}"`).not.toContain('—');
        }
      }
    }
  });
});
