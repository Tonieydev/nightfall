'use client';

// The leaf module, not the '@/room-store' barrel: the barrel reaches
// node:crypto, which a client component cannot bundle.
import { verdictCopy } from '@/narration/verdict';
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

  const { headline, detail } = verdictCopy(
    night,
    (id) => game.players.find((p) => p.id === id)?.name ?? id,
  );

  return (
    <section className="nf-verdict" role="status" aria-label="Last night">
      <p className="nf-kicker">Last night</p>
      <p className="nf-verdict-head">{headline}</p>
      <p className="nf-verdict-body">{detail}</p>
    </section>
  );
}
