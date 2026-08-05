import { ROLE_LABEL } from './roles.js';
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
    // The bracket is the whole point of turning the card over: the room needs
    // to read what it actually lost, not only whether it won the round. A
    // doctor going down is the most expensive miss there is.
    headline: `${elected.name} is out (${ROLE_LABEL[elected.role]}).`,
    // Never a restatement of the bracket. That line says what they were; this
    // one says what it cost.
    verdict: caught ? 'You caught a mafia.' : 'That was one of your own.',
    detail: caught
      ? 'One of them is gone. The rest are still sitting at this table.'
      : 'The mafia are still here, and there is one less of you to find them.',
  };
}
