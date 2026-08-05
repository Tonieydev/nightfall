'use client';

import type { RoomView } from '@/room-store';

/**
 * The ballot as it stands. Public and live by design — catching a mafia bloc
 * vote is one of town's main reads, and a secret ballot destroys it. This is
 * the GM's copy of what every player can already see.
 *
 * Nothing here eliminates anybody: ADVANCE is the lock, and the tally is
 * resolved by game-core when the GM presses it.
 */
export function VoteTally({ view }: { view: RoomView }) {
  const game = view.game;
  if (game === null || game.phase !== 'VOTE') return null;

  const nameOf = (id: string): string => game.players.find((p) => p.id === id)?.name ?? id;

  const counts = new Map<string, string[]>();
  for (const [voter, target] of Object.entries(game.dayVotes)) {
    counts.set(target, [...(counts.get(target) ?? []), voter]);
  }

  const living = game.players.filter((p) => p.alive);
  const ranked = [...counts.entries()].sort((a, b) => b[1].length - a[1].length);
  const top = ranked[0]?.[1].length ?? 0;
  const tied = ranked.filter(([, voters]) => voters.length === top).length > 1;

  return (
    <section className="card elev-sm nf-panel" aria-label="Vote tally">
      <div className="nf-panel-head">
        <h4>Vote tally</h4>
        <span className="nf-panel-note">
          {Object.keys(game.dayVotes).length} of {living.length} cast
          {ranked.length === 0
            ? ' · nobody goes if it stays empty'
            : tied
              ? ' · tied, so nobody goes'
              : ` · ${nameOf(ranked[0]?.[0] ?? '')} goes if you advance now`}
        </span>
      </div>

      {ranked.length === 0 ? (
        <p className="nf-muted">No votes yet. A tie or an empty ballot eliminates nobody.</p>
      ) : (
        <ul className="nf-roster">
          {ranked.map(([target, voters]) => (
            <li key={target} className="nf-row">
              <span className="nf-name">{nameOf(target)}</span>
              {/* Weight accumulating, not a counter incrementing. */}
              <span className="nf-weight" data-count={String(voters.length)} aria-hidden="true" />
              <span className="tag tag-neutral">{voters.length}</span>
              <span className="nf-muted">{voters.map(nameOf).join(', ')}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
