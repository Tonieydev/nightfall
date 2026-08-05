import { describe, expect, it } from 'vitest';
import { plurality, topTargets } from './plurality.js';

/**
 * The mafia get more than one name some nights. Who they actually take is still
 * decided by the ballot alone — the GM never picks, and a room that cannot agree
 * still kills nobody.
 */
describe('topTargets', () => {
  it('takes the one name the ballot settled on', () => {
    expect(topTargets({ m1: 'v1', m2: 'v1' }, 1)).toEqual(['v1']);
  });

  it('takes nobody when the room splits and there is one name to give', () => {
    expect(topTargets({ m1: 'v1', m2: 'v2' }, 1)).toEqual([]);
  });

  it('takes nobody from an empty ballot however many kills are allowed', () => {
    expect(topTargets({}, 3)).toEqual([]);
  });

  it('takes both names when the split is the point and two may go', () => {
    // Two mafia, two kills, one name each: that is not a deadlock, it is the
    // ballot doing exactly what it was allowed to do.
    expect(topTargets({ m1: 'v1', m2: 'v2' }, 2).sort()).toEqual(['v1', 'v2']);
  });

  it('fills the second slot from the runner-up', () => {
    expect(topTargets({ m1: 'v1', m2: 'v1', m3: 'v2' }, 2)).toEqual(['v1', 'v2']);
  });

  it('leaves a slot empty rather than break a tie for it', () => {
    // v1 is agreed. v2 and v3 are level with one slot between them, and nothing
    // in this game breaks a tie — so the second kill simply does not happen.
    expect(topTargets({ m1: 'v1', m2: 'v1', m3: 'v2', m4: 'v3' }, 2)).toEqual(['v1']);
  });

  it('takes a whole tied group when there is room for all of it', () => {
    expect(topTargets({ m1: 'v1', m2: 'v1', m3: 'v2', m4: 'v3' }, 3).sort()).toEqual([
      'v1',
      'v2',
      'v3',
    ]);
  });

  it('never returns more names than the mafia actually cast', () => {
    expect(topTargets({ m1: 'v1', m2: 'v1' }, 3)).toEqual(['v1']);
  });

  it('takes nobody when no kills are allowed', () => {
    expect(topTargets({ m1: 'v1', m2: 'v1' }, 0)).toEqual([]);
  });

  it('agrees with plurality on every single-kill ballot', () => {
    // One kill a night is what every game before this played under, and what
    // most will keep playing under. The two must not drift apart.
    const ballots = [
      {},
      { m1: 'v1' },
      { m1: 'v1', m2: 'v1' },
      { m1: 'v1', m2: 'v2' },
      { m1: 'v1', m2: 'v1', m3: 'v2' },
      { m1: 'v1', m2: 'v2', m3: 'v3' },
    ];

    for (const votes of ballots) {
      const leader = plurality(votes).leader;

      expect(topTargets(votes, 1), JSON.stringify(votes)).toEqual(leader === null ? [] : [leader]);
    }
  });
});
