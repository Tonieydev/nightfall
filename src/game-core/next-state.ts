import type { GameState } from './types.js';

// Every transition returns a state that shares no mutable substructure with its
// input, so a later write cannot reach back through an earlier version.
export function nextState(state: GameState, patch: Partial<GameState>): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p })),
    night: {
      mafiaVotes: { ...state.night.mafiaVotes },
      doctorSave: state.night.doctorSave,
      detectiveCheck: state.night.detectiveCheck,
    },
    dayVotes: { ...state.dayVotes },
    ...patch,
    version: state.version + 1,
  };
}
