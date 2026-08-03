import type { GameConfig, GameState, Player, Role } from './types.js';

export const defaultConfig: GameConfig = {
  mafiaCount: null,
  doctor: true,
  detective: true,
  mafiaNightMs: 45_000,
};

export function player(id: string, role: Role, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: id.toUpperCase(),
    role,
    alive: true,
    eliminatedAtPhase: null,
    eliminatedBy: null,
    ...overrides,
  };
}

export function dead(id: string, role: Role, overrides: Partial<Player> = {}): Player {
  return player(id, role, { alive: false, eliminatedAtPhase: 1, eliminatedBy: 'VOTE', ...overrides });
}

export function gameState(players: Player[], overrides: Partial<GameState> = {}): GameState {
  return {
    version: 1,
    phase: 'DAY',
    phaseNumber: 1,
    phaseEndsAt: null,
    gmPlayerId: 'gm',
    config: defaultConfig,
    players,
    night: { mafiaVotes: {}, doctorSave: null, detectiveCheck: null },
    dayVotes: {},
    lastNight: null,
    winner: null,
    ...overrides,
  };
}
