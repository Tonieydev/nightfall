import { describe, expect, it } from 'vitest';
import { computeAudioGraph } from './compute-audio-graph.js';
import type { GameConfig, GameState, Phase, Player, Role } from './types.js';

const GM = 'gm';

const base: GameConfig = {
  mafiaCount: null,
  doctor: true,
  detective: true,
  mafiaNightMs: 60_000,
};

function player(id: string, role: Role, alive: boolean): Player {
  return { id, name: id, role, alive, eliminatedAtPhase: alive ? null : 1, eliminatedBy: alive ? null : 'VOTE' };
}

/** Two dead, three living, one of the living Mafia. */
function state(phase: Phase, config: GameConfig): GameState {
  return {
    version: 1,
    phase,
    phaseNumber: 4,
    phaseEndsAt: null,
    gmPlayerId: GM,
    config,
    players: [
      player('deadA', 'VILLAGER', false),
      player('deadB', 'MAFIA', false),
      player('liveMafia', 'MAFIA', true),
      player('liveDoc', 'DOCTOR', true),
      player('liveVil', 'VILLAGER', true),
    ],
    night: { mafiaVotes: {}, doctorSave: null, detectiveCheck: null },
    dayVotes: {},
    lastNight: null,
    winner: null,
  };
}

const hears = (phase: Phase, config: GameConfig, listener: string): string[] =>
  [...computeAudioGraph(state(phase, config))]
    .filter(([, listeners]) => listeners.has(listener))
    .map(([speaker]) => speaker)
    .sort();

const PHASES: Phase[] = ['NIGHT_MAFIA', 'NIGHT_DOCTOR', 'DAWN', 'DAY', 'VOTE'];

describe('the dead channel is closed unless it is asked for', () => {
  it('is closed when the config says nothing at all', () => {
    for (const phase of PHASES) {
      expect(hears(phase, base, 'deadA'), phase).not.toContain('deadB');
    }
  });

  it('is closed when the config says so explicitly', () => {
    const closed = { ...base, deadChannel: false };

    for (const phase of PHASES) {
      expect(hears(phase, closed, 'deadA'), phase).not.toContain('deadB');
    }
  });

  it('leaves every existing rule exactly where it was', () => {
    // The dead still hear the day. They still never hear the night.
    expect(hears('DAY', base, 'deadA')).toContain('liveVil');
    expect(hears('NIGHT_MAFIA', base, 'deadA')).not.toContain('liveMafia');
    // And they still never speak to the living.
    expect(computeAudioGraph(state('DAY', base)).get('deadA')?.size ?? 0).toBe(0);
  });
});

describe('when the GM opens it', () => {
  const open = { ...base, deadChannel: true };

  it('lets the eliminated hear each other', () => {
    for (const phase of PHASES) {
      expect(hears(phase, open, 'deadA'), phase).toContain('deadB');
      expect(hears(phase, open, 'deadB'), phase).toContain('deadA');
    }
  });

  it('never lets a living player hear them', () => {
    // The whole reason the dead are separated: the first player eliminated
    // knows the entire Mafia roster, and it leaks through timing and tone.
    for (const phase of PHASES) {
      for (const living of ['liveMafia', 'liveDoc', 'liveVil']) {
        expect(hears(phase, open, living), `${phase} / ${living}`).not.toContain('deadA');
        expect(hears(phase, open, living), `${phase} / ${living}`).not.toContain('deadB');
      }
    }
  });

  it('never lets the dead hear the mafia at night', () => {
    // Opening a room for the dead must not open the night to them.
    expect(hears('NIGHT_MAFIA', open, 'deadA')).not.toContain('liveMafia');
    expect(hears('NIGHT_MAFIA', open, 'deadB')).not.toContain('liveMafia');
  });

  it('still lets them hear the day, as they always could', () => {
    expect(hears('DAY', open, 'deadA')).toContain('liveVil');
  });

  it('keeps the GM audible to them, and them inaudible to the GM’s room', () => {
    // The GM is heard by everyone in every phase — that does not change.
    expect(hears('NIGHT_MAFIA', open, 'deadA')).toContain(GM);
    // And a dead speaker reaches only other dead players, never the GM's room
    // at large. The GM reads every channel through their console, not their ears.
    const graph = computeAudioGraph(state('DAY', open));
    expect([...(graph.get('deadA') ?? [])].sort()).toEqual(['deadB']);
  });

  it('gives a lone dead player nobody to talk to', () => {
    const solo = state('DAY', open);
    solo.players = solo.players.filter((p) => p.id !== 'deadB');

    expect(computeAudioGraph(solo).get('deadA')?.size ?? 0).toBe(0);
  });

  it('does not resurrect anyone at GAME_OVER', () => {
    // Every card is face up and everyone talks, dead included — that was
    // already true and must stay true.
    expect(hears('GAME_OVER', open, 'liveVil')).toContain('deadA');
  });
});
