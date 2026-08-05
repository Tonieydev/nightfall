import { describe, expect, it } from 'vitest';
import { computeLobbyGraph } from './lobby-graph.js';

/**
 * Before a game exists there are no roles, no phases and nothing to hide, so
 * the lobby is one open room. It needs saying out loud because subscriptions
 * are explicit now: with auto-subscribe off, audio nobody grants is audio
 * nobody hears, and the lobby had been relying on the SFU's default.
 */
describe('the lobby is one open room', () => {
  it('gives everybody everybody else', () => {
    const graph = computeLobbyGraph(['a', 'b', 'c']);

    expect(graph.get('a')).toEqual(new Set(['b', 'c']));
    expect(graph.get('b')).toEqual(new Set(['a', 'c']));
    expect(graph.get('c')).toEqual(new Set(['a', 'b']));
  });

  it('never routes anyone back to themselves', () => {
    for (const [id, listeners] of computeLobbyGraph(['a', 'b', 'c'])) {
      expect(listeners.has(id), id).toBe(false);
    }
  });

  it('handles the first person in, who has nobody to talk to yet', () => {
    const graph = computeLobbyGraph(['a']);

    expect(graph.get('a')).toEqual(new Set());
    expect([...graph.keys()]).toEqual(['a']);
  });

  it('handles an empty room without inventing a node', () => {
    expect([...computeLobbyGraph([]).keys()]).toEqual([]);
  });

  it('gives every member a row, so nobody is missing from the map', () => {
    // applyAudioGraph walks the graph to decide what to forbid as well as what
    // to allow. A member with no row is a member nothing is ever stated about.
    const ids = ['a', 'b', 'c', 'd'];

    expect([...computeLobbyGraph(ids).keys()].sort()).toEqual(ids);
  });
});
