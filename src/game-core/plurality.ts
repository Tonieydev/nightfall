export interface Plurality {
  leader: string | null;
  tie: boolean;
}

function tally(votes: Record<string, string>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const target of Object.values(votes)) {
    counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  return counts;
}

/**
 * The names a ballot settles on when there is more than one to give — the mafia
 * kill count, in practice.
 *
 * Ranked by weight and filled a whole tier at a time. A tier that would overflow
 * the slots left is refused outright rather than split, because nothing in this
 * game breaks a tie: three mafia naming two people with one kill between them
 * take nobody, exactly as they always have. At one slot this is `plurality`.
 */
export function topTargets(votes: Record<string, string>, slots: number): string[] {
  const tiers = new Map<number, string[]>();
  for (const [target, count] of tally(votes)) {
    tiers.set(count, [...(tiers.get(count) ?? []), target]);
  }

  const taken: string[] = [];
  for (const weight of [...tiers.keys()].sort((a, b) => b - a)) {
    const tier = tiers.get(weight) ?? [];
    if (taken.length + tier.length > slots) break;
    taken.push(...tier);
  }

  return taken;
}

// A tie and an empty ballot both mean "no result", but only one of them is a tie.
export function plurality(votes: Record<string, string>): Plurality {
  const counts = tally(votes);

  let leader: string | null = null;
  let best = 0;
  let tie = false;
  for (const [target, count] of counts) {
    if (count > best) {
      leader = target;
      best = count;
      tie = false;
    } else if (count === best) {
      tie = true;
    }
  }

  return tie ? { leader: null, tie: true } : { leader, tie: false };
}
