import type { Phase, Role } from '@/game-core';

export const PHASE_LABEL: Record<Phase, string> = {
  LOBBY: 'Lobby',
  ROLE_REVEAL: 'Roles',
  NIGHT_MAFIA: 'Night: Mafia',
  NIGHT_DOCTOR: 'Night: Doctor',
  NIGHT_DETECTIVE: 'Night: Detective',
  DAWN: 'Dawn',
  DAY: 'Day',
  VERDICT: 'Verdict',
  VOTE: 'Vote',
  GAME_OVER: 'Game over',
};

export const ROLE_LABEL: Record<Role, string> = {
  VILLAGER: 'Villager',
  MAFIA: 'Mafia',
  DOCTOR: 'Doctor',
  DETECTIVE: 'Detective',
};

/**
 * How the room is lit for a phase. Purely presentational — the ground shift is
 * how a player feels the phase without reading the label.
 */
export function litFor(phase: Phase): 'day' | 'night' | 'dawn' {
  if (phase === 'DAWN') return 'dawn';
  return phase.startsWith('NIGHT_') ? 'night' : 'day';
}

/** What this player is being asked to do right now, or null if it is not their turn. */
export function actionFor(phase: Phase, role: Role | null, alive: boolean): string | null {
  if (!alive) return null;

  if (phase === 'VOTE') return 'Vote to eliminate';
  if (phase === 'NIGHT_MAFIA' && role === 'MAFIA') return 'Choose tonight’s target';
  if (phase === 'NIGHT_DOCTOR' && role === 'DOCTOR') return 'Choose who to save';
  if (phase === 'NIGHT_DETECTIVE' && role === 'DETECTIVE') return 'Choose who to investigate';
  return null;
}
