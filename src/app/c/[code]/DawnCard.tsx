'use client';

import type { RoomView } from '@/room-store';

/**
 * The night told back, a line at a time, as the GM reads it.
 *
 * Everyone gets the same lines, including the person it is about: the death is
 * withheld from every projection until the line that names it, so this card and
 * the room hearing it are the same moment. That is the whole mechanic, and it
 * only works because the server holds the fact back rather than the component.
 */
export function DawnCard({ view }: { view: RoomView }) {
  const dawn = view.game?.dawn ?? null;
  if (dawn === null) return null;

  const total = dawn.lines.length;

  return (
    <section className="nf-dawn" role="status" aria-live="polite">
      <p className="nf-kicker">Dawn</p>

      <div className="nf-dawn-lines">
        {dawn.lines.map((line, i) => (
          // The line just read is bright; the ones before it settle back.
          <p key={line} className="nf-dawn-line" data-current={String(i === total - 1)}>
            {line}
          </p>
        ))}
      </div>

      <p className="nf-dawn-foot">
        {dawn.revealed ? 'The floor opens in a moment.' : 'Listen. Nothing is decided yet.'}
      </p>
    </section>
  );
}

/**
 * The card the newly dead get, at the instant the room hears it and not before.
 * Rendered only once the reveal has landed, because until then the projection
 * says they are alive and this component has nothing to know.
 */
export function OutCard({ view }: { view: RoomView }) {
  const game = view.game;
  const me = game?.players.find((p) => p.id === view.you?.playerId) ?? null;
  if (game === null || me === null || me.alive) return null;
  if (me.eliminatedAtPhase !== game.phaseNumber) return null;

  return (
    <section className="nf-out nf-reveal" role="alert">
      <p className="nf-out-head">You are out.</p>
      <p className="nf-out-body">
        You can hear the day from here. The living cannot hear you.
      </p>
    </section>
  );
}
