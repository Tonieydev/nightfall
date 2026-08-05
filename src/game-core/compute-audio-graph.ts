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
    // The GM says what the room just did and the room reacts. Silence here
    // would read as the call dropping at the most charged beat of the round.
    case 'VERDICT':
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

  // The eliminated, optionally, get each other and nobody else. Added to what
  // the stage already decided rather than replacing it, so GAME_OVER — where
  // everyone hears everyone — keeps its wider audience.
  if (state.config.deadChannel === true) {
    const dead = state.players.filter((p) => !p.alive).map((p) => p.id);
    for (const listener of dead) {
      const room = graph.get(listener) ?? new Set<string>();
      for (const other of dead) if (other !== listener) room.add(other);
      graph.set(listener, room);
    }
  }

  return graph;
}
