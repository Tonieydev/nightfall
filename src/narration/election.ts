import type { PlayerView } from '../game-core/index.js';

export interface ElectionCopy {
  /** Who the room voted out this round, or null if it voted out nobody. */
  name: string | null;
  /**
   * Whether the room got a mafia. Null when nobody was elected, and null when
   * the card came face down: a projection that hides the role must not be read
   * as proof of innocence.
   */
  caught: boolean | null;
  headline: string;
  verdict: string;
  detail: string;
}

/**
 * What the room reads at the verdict, living and dead alike.
 *
 * Derived from the players it was handed rather than from a stored outcome,
 * because the elimination is already written on the player: cause VOTE, stamped
 * with the round it happened in. A second copy of that on the state is a second
 * thing that can disagree with it.
 */
export function electionCopy(players: PlayerView[], phaseNumber: number): ElectionCopy {
  const elected = players.find(
    (p) => !p.alive && p.eliminatedBy === 'VOTE' && p.eliminatedAtPhase === phaseNumber,
  );

  if (elected === undefined) {
    return {
      name: null,
      caught: null,
      headline: 'Nobody was elected.',
      verdict: 'A tie, or nobody voted.',
      detail: 'The day ends with everyone still here. That happens, and it costs you a round.',
    };
  }

  if (elected.role === null) {
    return {
      name: elected.name,
      caught: null,
      headline: `${elected.name} is out.`,
      verdict: 'Their card is still face down.',
      detail: 'Nothing to read here yet.',
    };
  }

  const caught = elected.role === 'MAFIA';

  return {
    name: elected.name,
    caught,
    headline: `${elected.name} is out.`,
    verdict: caught ? 'You caught a mafia.' : 'You did not catch the mafia.',
    detail: caught
      ? 'One down. There may be more of them at this table.'
      : 'They were town. The mafia are still here, and now there are fewer of you.',
  };
}
