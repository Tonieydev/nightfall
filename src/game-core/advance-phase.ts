import { checkWinCondition } from './check-win-condition.js';
import { nextState } from './next-state.js';
import type { GameState, Phase, Role } from './types.js';

const ORDER: Record<Phase, Phase> = {
  LOBBY: 'ROLE_REVEAL',
  ROLE_REVEAL: 'NIGHT_MAFIA',
  NIGHT_MAFIA: 'NIGHT_DOCTOR',
  NIGHT_DOCTOR: 'NIGHT_DETECTIVE',
  NIGHT_DETECTIVE: 'DAWN',
  DAWN: 'DAY',
  DAY: 'VOTE',
  VOTE: 'VERDICT',
  VERDICT: 'NIGHT_MAFIA',
  GAME_OVER: 'GAME_OVER',
};

const REQUIRES_LIVING_ROLE: Partial<Record<Phase, Role>> = {
  NIGHT_DOCTOR: 'DOCTOR',
  NIGHT_DETECTIVE: 'DETECTIVE',
};

function isPlayable(phase: Phase, state: GameState): boolean {
  const required = REQUIRES_LIVING_ROLE[phase];
  if (required === undefined) return true;
  return state.players.some((p) => p.alive && p.role === required);
}

function nextPlayablePhase(state: GameState): Phase {
  let next = ORDER[state.phase];
  while (!isPlayable(next, state)) next = ORDER[next];
  return next;
}

export function advancePhase(state: GameState, now: number): GameState {
  if (state.phase === 'GAME_OVER') {
    throw new Error('GAME_OVER is terminal; there is no phase after it');
  }

  const winner = checkWinCondition(state);
  if (winner !== null) {
    return nextState(state, { phase: 'GAME_OVER', phaseEndsAt: null, winner });
  }

  const next = nextPlayablePhase(state);
  const opensNight = next === 'NIGHT_MAFIA';

  return nextState(state, {
    phase: next,
    phaseEndsAt: opensNight ? now + state.config.mafiaNightMs : null,
    phaseNumber: opensNight ? state.phaseNumber + 1 : state.phaseNumber,
    ...(opensNight
      ? { night: { mafiaVotes: {}, doctorSave: null, detectiveCheck: null } }
      : {}),
    ...(next === 'VOTE' ? { dayVotes: {} } : {}),
  });
}
