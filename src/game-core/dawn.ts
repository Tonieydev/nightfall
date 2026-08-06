import { nextState } from './next-state.js';
import type { GameState, Player } from './types.js';

export interface DawnScript {
  /** Every line, in the order the GM reads them. */
  lines: string[];
  /** The index of the line that names who did not make it. */
  revealAt: number;
}

/** "Ada", "Ada and Musa", "Ada, Musa and Chidi". */
function spoken(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

/**
 * The night told back, one line at a time.
 *
 * The name lands in the last line and nowhere before it, which is the whole
 * mechanic: a player learns they are gone when the room hears it, not from a
 * roster that changed under them while the GM was still drawing breath.
 */
export function dawnScript(state: GameState): DawnScript {
  const taken = (state.lastNight?.eliminatedIds ?? [])
    .map((id) => state.players.find((p) => p.id === id)?.name ?? '')
    .filter((name) => name !== '');

  const opening = [
    'The town settled. Doors were locked, lamps went out, and the street went quiet.',
    'Then morning, and the village counts itself.',
  ];

  const lines =
    taken.length === 0
      ? [...opening, 'Everyone made it through the night.']
      : [...opening, 'Somebody did not see the morning.', `${spoken(taken)} is gone.`];

  return { lines, revealAt: lines.length - 1 };
}

/** How many lines the GM has read. Absent means they have read the first. */
function beatOf(state: GameState): number {
  return state.dawnBeat ?? 0;
}

/**
 * Whether the line that names the dead has been spoken.
 *
 * True everywhere outside dawn: no other phase is holding anything back, and a
 * projection that forgot this would resurrect the whole graveyard.
 */
export function dawnRevealed(state: GameState): boolean {
  if (state.phase !== 'DAWN') return true;
  return beatOf(state) >= dawnScript(state).revealAt;
}

/**
 * One more line read. Stops at the last: the GM leaves dawn by advancing the
 * phase, which is the same button and a separate decision.
 */
export function advanceDawn(state: GameState): GameState {
  const last = dawnScript(state).lines.length - 1;
  return nextState(state, { dawnBeat: Math.min(beatOf(state) + 1, last) });
}

/**
 * This round's dead, hidden until they are named. Only this round's: a body
 * from last night is old news, and hiding it would rewrite the game.
 */
export function withheldAtDawn(state: GameState): Set<string> {
  if (dawnRevealed(state)) return new Set();

  return new Set(
    state.players
      .filter((p: Player) => !p.alive && p.eliminatedAtPhase === state.phaseNumber)
      .map((p) => p.id),
  );
}
