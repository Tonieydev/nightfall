import { plurality } from './plurality.js';
import type { Player } from './types.js';

export interface VoteOutcome {
  eliminated: string | null;
  tie: boolean;
}

export function tallyVotes(votes: Record<string, string>, alive: Player[]): VoteOutcome {
  const eligible = new Set(alive.map((p) => p.id));
  const cast = Object.fromEntries(
    Object.entries(votes).filter(([voter, target]) => eligible.has(voter) && eligible.has(target)),
  );

  const { leader, tie } = plurality(cast);

  return { eliminated: leader, tie };
}
