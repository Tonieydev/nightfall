import { describe, expect, it } from 'vitest';
import { computeAudioGraph } from './compute-audio-graph.js';
import { dead, gameState, player } from './state.fixture.js';
import type { AudioGraph, Phase, Player } from './types.js';

const ALL_PHASES: Phase[] = [
  'LOBBY',
  'ROLE_REVEAL',
  'NIGHT_MAFIA',
  'NIGHT_DOCTOR',
  'NIGHT_DETECTIVE',
  'DAWN',
  'DAY',
  'VOTE',
  'VERDICT',
  'GAME_OVER',
];

const cast = (): Player[] => [
  player('m1', 'MAFIA'),
  player('m2', 'MAFIA'),
  player('v1', 'VILLAGER'),
  player('v2', 'VILLAGER'),
  player('doc', 'DOCTOR'),
  player('det', 'DETECTIVE'),
];

// The graph is speaker -> listeners; this inverts it to answer "who can X hear?".
function audibleTo(graph: AudioGraph, listenerId: string): Set<string> {
  const heard = new Set<string>();
  for (const [speaker, listeners] of graph) {
    if (listeners.has(listenerId)) heard.add(speaker);
  }
  return heard;
}

function speaks(graph: AudioGraph, speakerId: string): Set<string> {
  return graph.get(speakerId) ?? new Set<string>();
}

describe('computeAudioGraph', () => {
  it('makes the GM audible to every player in every phase', () => {
    for (const phase of ALL_PHASES) {
      const state = gameState([...cast(), dead('v3', 'VILLAGER')], { phase });
      const graph = computeAudioGraph(state);

      expect(speaks(graph, 'gm'), phase).toEqual(
        new Set(['m1', 'm2', 'v1', 'v2', 'doc', 'det', 'v3']),
      );
    }
  });

  it('never leaks NIGHT_MAFIA audio to a non-Mafia listener', () => {
    const graph = computeAudioGraph(gameState(cast(), { phase: 'NIGHT_MAFIA' }));

    for (const mafiaId of ['m1', 'm2']) {
      expect(speaks(graph, mafiaId)).toEqual(new Set(['gm', ...['m1', 'm2'].filter((id) => id !== mafiaId)]));
      for (const townId of ['v1', 'v2', 'doc', 'det']) {
        expect(speaks(graph, mafiaId).has(townId), `${mafiaId} -> ${townId}`).toBe(false);
      }
    }
  });

  it('leaves a Villager hearing the GM and nobody else during NIGHT_MAFIA', () => {
    const graph = computeAudioGraph(gameState(cast(), { phase: 'NIGHT_MAFIA' }));

    for (const townId of ['v1', 'v2', 'doc', 'det']) {
      expect(audibleTo(graph, townId), townId).toEqual(new Set(['gm']));
      expect(speaks(graph, townId), townId).toEqual(new Set());
    }
  });

  it('cuts an eliminated Mafia out of the next NIGHT_MAFIA entirely', () => {
    const state = gameState(
      [
        player('m1', 'MAFIA'),
        dead('m2', 'MAFIA', { eliminatedAtPhase: 1 }),
        player('v1', 'VILLAGER'),
        player('v2', 'VILLAGER'),
        player('doc', 'DOCTOR'),
      ],
      { phase: 'NIGHT_MAFIA', phaseNumber: 2 },
    );
    const graph = computeAudioGraph(state);

    expect(audibleTo(graph, 'm2')).toEqual(new Set(['gm']));
    expect(speaks(graph, 'm2')).toEqual(new Set());
    expect(speaks(graph, 'm1')).toEqual(new Set(['gm']));
  });

  it('lets a dead player hear every living player during DAY', () => {
    const state = gameState([...cast(), dead('v3', 'VILLAGER')], { phase: 'DAY' });
    const graph = computeAudioGraph(state);

    expect(audibleTo(graph, 'v3')).toEqual(
      new Set(['gm', 'm1', 'm2', 'v1', 'v2', 'doc', 'det']),
    );
  });

  it('keeps a dead player silent during DAY', () => {
    const state = gameState([...cast(), dead('v3', 'VILLAGER')], { phase: 'DAY' });
    const graph = computeAudioGraph(state);

    expect(speaks(graph, 'v3')).toEqual(new Set());
    expect(speaks(graph, 'v1')).toEqual(new Set(['gm', 'm1', 'm2', 'v2', 'doc', 'det', 'v3']));
  });

  it('produces a valid NIGHT_MAFIA graph with a single living Mafia', () => {
    const state = gameState(
      [
        player('m1', 'MAFIA'),
        player('v1', 'VILLAGER'),
        player('v2', 'VILLAGER'),
        player('doc', 'DOCTOR'),
        player('det', 'DETECTIVE'),
      ],
      { phase: 'NIGHT_MAFIA' },
    );
    const graph = computeAudioGraph(state);

    expect(speaks(graph, 'm1')).toEqual(new Set(['gm']));
    expect(speaks(graph, 'm1').has('m1')).toBe(false);
    expect(audibleTo(graph, 'm1')).toEqual(new Set(['gm']));
  });

  it('never gives a dead player a voice outside GAME_OVER', () => {
    const players = [...cast(), dead('v3', 'VILLAGER'), dead('m3', 'MAFIA')];

    for (const phase of ALL_PHASES) {
      const graph = computeAudioGraph(gameState(players, { phase }));
      const silent = phase !== 'GAME_OVER';

      expect(speaks(graph, 'v3').size === 0, `v3 in ${phase}`).toBe(silent);
      expect(speaks(graph, 'm3').size === 0, `m3 in ${phase}`).toBe(silent);
    }
  });

  it('silences everyone but the GM during NIGHT_DOCTOR, NIGHT_DETECTIVE and DAWN', () => {
    for (const phase of ['NIGHT_DOCTOR', 'NIGHT_DETECTIVE', 'DAWN'] as const) {
      const graph = computeAudioGraph(gameState(cast(), { phase }));

      for (const id of ['m1', 'm2', 'v1', 'v2', 'doc', 'det']) {
        expect(speaks(graph, id), `${id} in ${phase}`).toEqual(new Set());
        expect(audibleTo(graph, id), `${id} in ${phase}`).toEqual(new Set(['gm']));
      }
    }
  });

  it('matches the phase table on every possible edge, in both directions', () => {
    const players = [...cast(), dead('v3', 'VILLAGER'), dead('m3', 'MAFIA')];
    const permitted = phaseTableOracle(players);
    const nodes = ['gm', ...players.map((p) => p.id)];

    for (const phase of ALL_PHASES) {
      const graph = computeAudioGraph(gameState(players, { phase }));

      expect(new Set(graph.keys())).toEqual(new Set(nodes));

      for (const speaker of nodes) {
        for (const listener of nodes) {
          expect(
            speaks(graph, speaker).has(listener),
            `${phase}: ${speaker} -> ${listener}`,
          ).toBe(permitted(phase, speaker, listener));
        }
      }
    }
  });
});

// An independent restatement of the phase table, written from the spec rather
// than from the implementation, so the audit above cannot agree with a bug.
function phaseTableOracle(players: Player[]) {
  const byId = new Map(players.map((p) => [p.id, p]));

  return (phase: Phase, speakerId: string, listenerId: string): boolean => {
    if (speakerId === listenerId) return false;
    if (speakerId === 'gm') return byId.has(listenerId);

    const speaker = byId.get(speakerId);
    if (speaker === undefined) return false;

    const listener = byId.get(listenerId);
    const listenerIsGm = listenerId === 'gm';
    if (!listenerIsGm && listener === undefined) return false;

    switch (phase) {
      case 'NIGHT_MAFIA':
        return (
          speaker.alive &&
          speaker.role === 'MAFIA' &&
          (listenerIsGm ||
            (listener !== undefined && listener.alive && listener.role === 'MAFIA'))
        );
      case 'LOBBY':
      case 'ROLE_REVEAL':
      case 'DAY':
      case 'VOTE':
      // The verdict is announced to the room and reacted to by it, so the
      // living speak and everybody hears, exactly as in the day.
      case 'VERDICT':
        return speaker.alive;
      case 'GAME_OVER':
        return true;
      case 'NIGHT_DOCTOR':
      case 'NIGHT_DETECTIVE':
      case 'DAWN':
        return false;
    }
  };
}
