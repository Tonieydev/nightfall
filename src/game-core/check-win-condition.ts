import { teamOf } from './team.js';
import type { GameState, Team } from './types.js';

export function checkWinCondition(state: GameState): Team | null {
  const living = state.players.filter((p) => p.alive);
  const mafia = living.filter((p) => teamOf(p.role) === 'MAFIA').length;
  const town = living.length - mafia;

  if (mafia === 0) return 'TOWN';
  if (mafia >= town) return 'MAFIA';
  return null;
}
