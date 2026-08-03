import type { AudioGraph, GameState } from './types.js';

interface Stage {
  speakers: string[];
  audience: string[];
}

function stageFor(state: GameState): Stage {
  const livingMafia = state.players
    .filter((p) => p.alive && p.role === 'MAFIA')
    .map((p) => p.id);

  const living = state.players.filter((p) => p.alive).map((p) => p.id);
  const everyone = [state.gmPlayerId, ...state.players.map((p) => p.id)];

  switch (state.phase) {
    case 'NIGHT_MAFIA':
      return { speakers: livingMafia, audience: [state.gmPlayerId, ...livingMafia] };
    case 'DAY':
    case 'VOTE':
      return { speakers: living, audience: everyone };
    // Nobody is dead before the first night, so "everyone speaks" and "the dead
    // never speak" only diverge in unreachable states. The stricter rule wins.
    case 'LOBBY':
    case 'ROLE_REVEAL':
      return { speakers: living, audience: everyone };
    case 'GAME_OVER':
      return { speakers: state.players.map((p) => p.id), audience: everyone };
    default:
      return { speakers: [], audience: [] };
  }
}

export function computeAudioGraph(state: GameState): AudioGraph {
  const gm = state.gmPlayerId;
  const playerIds = state.players.map((p) => p.id);

  const graph: AudioGraph = new Map(playerIds.map((id) => [id, new Set<string>()]));
  graph.set(gm, new Set(playerIds));

  const { speakers, audience } = stageFor(state);
  for (const speaker of speakers) {
    graph.set(speaker, new Set(audience.filter((id) => id !== speaker)));
  }

  return graph;
}
