import { describe, expect, it } from 'vitest';
import { tallyVotes } from './tally-votes.js';
import { player } from './state.fixture.js';
import type { Player } from './types.js';

const living = (): Player[] => [
  player('m1', 'MAFIA'),
  player('v1', 'VILLAGER'),
  player('v2', 'VILLAGER'),
  player('doc', 'DOCTOR'),
  player('det', 'DETECTIVE'),
];

describe('tallyVotes', () => {
  it('eliminates the plurality target', () => {
    const votes = { v1: 'm1', v2: 'm1', doc: 'v1' };

    expect(tallyVotes(votes, living())).toEqual({ eliminated: 'm1', tie: false });
  });

  it('eliminates nobody on a tie', () => {
    const votes = { v1: 'm1', v2: 'm1', doc: 'v1', det: 'v1' };

    expect(tallyVotes(votes, living())).toEqual({ eliminated: null, tie: true });
  });

  it('treats an empty ballot as no elimination and no tie', () => {
    expect(tallyVotes({}, living())).toEqual({ eliminated: null, tie: false });
  });

  it('ignores votes cast by players who are not among the living', () => {
    const votes = { v1: 'm1', ghost1: 'v2', ghost2: 'v2' };

    expect(tallyVotes(votes, living())).toEqual({ eliminated: 'm1', tie: false });
  });

  it('ignores votes cast at players who are not among the living', () => {
    const votes = { v1: 'ghost', v2: 'ghost', doc: 'm1' };

    expect(tallyVotes(votes, living())).toEqual({ eliminated: 'm1', tie: false });
  });

  it('resolves without every living player having voted', () => {
    expect(tallyVotes({ v1: 'm1' }, living())).toEqual({ eliminated: 'm1', tie: false });
    expect(tallyVotes({ v1: 'm1', v2: 'doc' }, living())).toEqual({
      eliminated: null,
      tie: true,
    });
  });
});
