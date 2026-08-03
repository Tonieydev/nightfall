import { nextState } from './next-state.js';
import { plurality } from './plurality.js';
import { teamOf } from './team.js';
import type { GameState, NightOutcome } from './types.js';

function eligibleMafiaVotes(state: GameState): Record<string, string> {
  const livingMafia = new Set(
    state.players.filter((p) => p.alive && p.role === 'MAFIA').map((p) => p.id),
  );
  const living = new Set(state.players.filter((p) => p.alive).map((p) => p.id));

  return Object.fromEntries(
    Object.entries(state.night.mafiaVotes).filter(
      ([voter, target]) => livingMafia.has(voter) && living.has(target),
    ),
  );
}

function detectiveResult(state: GameState): NightOutcome['detective'] {
  const targetId = state.night.detectiveCheck;
  if (targetId === null) return null;

  const checked = state.players.find((p) => p.id === targetId);
  if (checked === undefined) return null;

  return { targetId, team: teamOf(checked.role) };
}

export function resolveNight(state: GameState): GameState {
  const { leader: target } = plurality(eligibleMafiaVotes(state));
  const saved = target !== null && state.night.doctorSave === target;
  const eliminated = saved ? null : target;

  return nextState(state, {
    players: state.players.map((p) =>
      p.id === eliminated
        ? { ...p, alive: false, eliminatedAtPhase: state.phaseNumber, eliminatedBy: 'MAFIA' }
        : { ...p },
    ),
    lastNight: {
      phaseNumber: state.phaseNumber,
      targetId: target,
      saved,
      eliminatedId: eliminated,
      detective: detectiveResult(state),
    },
  });
}
