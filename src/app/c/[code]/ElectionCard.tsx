'use client';

import { electionCopy } from '@/narration/election';
import type { RoomView } from '@/room-store';

/**
 * The card the room turns over after a vote, seen by everyone, living and dead.
 *
 * It is the only thing a day vote gives back. Without it the room votes into
 * silence and learns nothing, so the day is spent guessing at the same blank
 * board every round.
 *
 * Keyed on the phase by its parent, so it mounts fresh at the verdict and plays
 * its rise once. The motion is the one-time reveal exception in the design
 * system's budget, not decoration: it rises, holds a beat, and settles. Anyone
 * who has asked their device for less motion gets the settled state directly.
 */
export function ElectionCard({ view }: { view: RoomView }) {
  const game = view.game;
  if (game === null || game.phase !== 'VERDICT') return null;

  const copy = electionCopy(game.players, game.phaseNumber);

  return (
    <section
      className="nf-election"
      data-caught={copy.caught === null ? 'none' : String(copy.caught)}
      role="status"
      aria-live="polite"
      aria-label="Election result"
    >
      <p className="nf-kicker">The room decided</p>
      <p className="nf-election-head">{copy.headline}</p>
      <p className="nf-election-verdict">{copy.verdict}</p>
      <p className="nf-election-detail">{copy.detail}</p>
    </section>
  );
}
