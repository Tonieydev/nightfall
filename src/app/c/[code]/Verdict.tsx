'use client';

import type { RoomView } from '@/room-store';

/**
 * What the night actually did, once it has resolved. The GM reads this out at
 * dawn — it is the difference between narrating the outcome and guessing at it.
 *
 * A saved target and an empty night both matter: "nobody died" is a legitimate
 * and occasionally devastating result, not a missing case.
 */
export function Verdict({ view }: { view: RoomView }) {
  const game = view.game;
  const night = game?.lastNight ?? null;
  if (game === null || night === null) return null;

  const nameOf = (id: string | null): string =>
    id === null ? 'nobody' : (game.players.find((p) => p.id === id)?.name ?? id);

  const headline =
    night.eliminatedId !== null
      ? `${nameOf(night.eliminatedId)} did not survive the night.`
      : night.saved
        ? 'The doctor got there first. Everybody lived.'
        : 'Nobody died last night.';

  const detail =
    night.eliminatedId !== null
      ? 'Say the name. Do not say the role — the cards stay down until the end.'
      : night.saved
        ? `${nameOf(night.targetId)} was taken and pulled back. That is theirs to know, not yours to tell.`
        : 'A tie or an empty ballot. Say it plainly; it unsettles people more than a death.';

  return (
    <section className="nf-verdict" role="status" aria-label="Last night">
      <p className="nf-kicker">Last night</p>
      <p className="nf-verdict-head">{headline}</p>
      <p className="nf-verdict-body">{detail}</p>
    </section>
  );
}
