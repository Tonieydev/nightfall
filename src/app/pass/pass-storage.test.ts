import { describe, expect, it } from 'vitest';
import { parseHistory, parseNames } from './pass-storage';

describe('parseHistory', () => {
  it('returns [] for anything that is not a list of lists of strings', () => {
    for (const bad of [null, undefined, 4, 'x', {}, [1], [['a', 2]], '[[1]]']) {
      expect(parseHistory(bad)).toEqual([]);
    }
  });

  it('parses a stored round list', () => {
    expect(parseHistory('[["Ada"],["Bayo","Ese"]]')).toEqual([['Ada'], ['Bayo', 'Ese']]);
  });

  it('survives corrupt JSON', () => {
    expect(parseHistory('{not json')).toEqual([]);
  });

  it('keeps only the rounds the dealer still looks at', () => {
    const raw = JSON.stringify([['a'], ['b'], ['c'], ['d'], ['e']]);

    expect(parseHistory(raw)).toEqual([['c'], ['d'], ['e']]);
  });
});

describe('parseNames', () => {
  it('returns [] for corrupt or wrongly shaped storage', () => {
    for (const bad of [null, '{', '5', '[1]', '{"a":1}']) {
      expect(parseNames(bad)).toEqual([]);
    }
  });

  it('parses a stored name list', () => {
    expect(parseNames('["Ada","Bayo"]')).toEqual(['Ada', 'Bayo']);
  });
});
