export interface Plurality {
  leader: string | null;
  tie: boolean;
}

// A tie and an empty ballot both mean "no result", but only one of them is a tie.
export function plurality(votes: Record<string, string>): Plurality {
  const counts = new Map<string, number>();
  for (const target of Object.values(votes)) {
    counts.set(target, (counts.get(target) ?? 0) + 1);
  }

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
