import { describe, expect, it } from 'vitest';
import { verdictCopy } from './verdict.js';
import type { NightOutcome } from '../game-core/index.js';

const NAMES: Record<string, string> = { v1: 'Ada', v2: 'Musa', v3: 'Chidi' };
const nameOf = (id: string): string => NAMES[id] ?? id;

function outcome(overrides: Partial<NightOutcome> = {}): NightOutcome {
  return {
    phaseNumber: 2,
    targetIds: [],
    savedId: null,
    eliminatedIds: [],
    detective: null,
    ...overrides,
  };
}

/**
 * What the GM reads out at dawn. The kill count made this plural, and a line
 * that says "Ada, Musa did not survive" is the console failing at the one job
 * it has here — handing the moderator something they can say out loud.
 */
describe('the dawn verdict', () => {
  it('names the one who did not survive', () => {
    const copy = verdictCopy(outcome({ targetIds: ['v1'], eliminatedIds: ['v1'] }), nameOf);

    expect(copy.headline).toBe('Ada did not survive the night.');
  });

  it('joins two names the way a person says them', () => {
    const copy = verdictCopy(
      outcome({ targetIds: ['v1', 'v2'], eliminatedIds: ['v1', 'v2'] }),
      nameOf,
    );

    expect(copy.headline).toBe('Ada and Musa did not survive the night.');
  });

  it('joins three with commas and a final and', () => {
    const copy = verdictCopy(
      outcome({ targetIds: ['v1', 'v2', 'v3'], eliminatedIds: ['v1', 'v2', 'v3'] }),
      nameOf,
    );

    expect(copy.headline).toBe('Ada, Musa and Chidi did not survive the night.');
  });

  it('says nobody died when the ballot settled on nobody', () => {
    const copy = verdictCopy(outcome(), nameOf);

    expect(copy.headline).toBe('Nobody died last night.');
    expect(copy.detail).toContain('tie');
  });

  it('credits the doctor when the only target came back', () => {
    const copy = verdictCopy(outcome({ targetIds: ['v1'], savedId: 'v1' }), nameOf);

    expect(copy.headline).toBe('The doctor got there first. Everybody lived.');
    expect(copy.detail).toContain('Ada');
  });

  it('reports a death and a save in the same night', () => {
    // Two kills, one pulled back. The GM says one name aloud and keeps the
    // other to themselves — the save is the doctor's to reveal, not the GM's.
    const copy = verdictCopy(
      outcome({ targetIds: ['v1', 'v2'], savedId: 'v1', eliminatedIds: ['v2'] }),
      nameOf,
    );

    expect(copy.headline).toBe('Musa did not survive the night.');
    expect(copy.detail).toContain('pulled back');
  });

  it('never puts a saved name in the line the GM reads aloud', () => {
    const copy = verdictCopy(
      outcome({ targetIds: ['v1', 'v2'], savedId: 'v1', eliminatedIds: ['v2'] }),
      nameOf,
    );

    expect(copy.headline).not.toContain('Ada');
  });

  it('never names a role', () => {
    // The cards stay down until the end, so nothing here can leak one.
    const copy = verdictCopy(
      outcome({
        targetIds: ['v1'],
        eliminatedIds: ['v1'],
        detective: { targetId: 'v2', team: 'MAFIA' },
      }),
      nameOf,
    );

    expect(`${copy.headline} ${copy.detail}`).not.toMatch(/MAFIA|VILLAGER|DETECTIVE/);
  });
});
