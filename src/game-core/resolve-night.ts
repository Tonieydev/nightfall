import { nextState } from './next-state.js';
import { topTargets } from './plurality.js';
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
  // Absent means one. The GM raising it changes how many names the ballot may
  // settle on, never who chooses them.
  const targetIds = topTargets(eligibleMafiaVotes(state), state.config.nightKills ?? 1);

  // The doctor covers one person, so at most one of the night's targets comes
  // back — the save does not scale with the kill count.
  const save = state.night.doctorSave;
  const savedId = save !== null && targetIds.includes(save) ? save : null;
  const eliminatedIds = targetIds.filter((id) => id !== savedId);

  return nextState(state, {
    players: state.players.map((p) =>
      eliminatedIds.includes(p.id)
        ? { ...p, alive: false, eliminatedAtPhase: state.phaseNumber, eliminatedBy: 'MAFIA' }
        : { ...p },
    ),
    lastNight: {
      phaseNumber: state.phaseNumber,
      targetIds,
      savedId,
      eliminatedIds,
      detective: detectiveResult(state),
    },
  });
}
