'use client';

import { topTargets } from '@/game-core/plurality';
import type { RoomView } from '@/room-store';

/**
 * What the night has decided so far, for the GM's eyes only. The GM narrates
 * around this — they never adjudicate with it: the target is whatever the
 * plurality says, and a tie kills nobody.
 */
export function NightActions({ view }: { view: RoomView }) {
  const game = view.game;
  if (game === null || !game.phase.startsWith('NIGHT_')) return null;

  const nameOf = (id: string | null | undefined): string =>
    game.players.find((p) => p.id === id)?.name ?? '-';

  const votes = Object.values(game.night.mafiaVotes ?? {});
  const kills = view.nightKills ?? 1;
  // The same rule the night will actually resolve under, so what the GM reads
  // here cannot disagree with what happens when they advance.
  const settled = topTargets(game.night.mafiaVotes ?? {}, kills);

  const mafia =
    votes.length === 0
      ? 'nobody yet'
      : settled.length === 0
        ? 'tied, nobody dies'
        : settled.map(nameOf).join(', ');

  const cells = [
    {
      label: kills === 1 ? 'Mafia' : `Mafia · ${String(kills)} a night`,
      value: mafia,
      note:
        votes.length === 0
          ? 'Still deciding. A tie or an empty ballot kills nobody.'
          : kills === 1
            ? `${String(votes.length)} cast.`
            : `${String(votes.length)} cast, ${String(settled.length)} of ${String(kills)} settled.`,
    },
    {
      label: 'Doctor',
      value: 'sealed',
      // The save is not projected to anyone, GM included, until the night
      // resolves. Showing it live would need a game-core change, and the GM
      // knowing early is exactly what would leak into how they narrate.
      note: 'Nobody sees this until dawn. Not even you.',
    },
    {
      label: 'Detective',
      value:
        game.detectiveResult === null
          ? 'not yet'
          : `${nameOf(game.detectiveResult.targetId)} is ${game.detectiveResult.team}`,
      note: 'Landed on their own device. Never say it aloud.',
    },
  ];

  return (
    <section className="card elev-sm nf-panel" aria-label="Night actions">
      <div className="nf-panel-head">
        <h4>Night actions</h4>
        <span className="nf-panel-note">Only you see this.</span>
      </div>

      <div className="nf-night-grid">
        {cells.map((cell) => (
          <div key={cell.label} className="nf-night-cell">
            <p className="nf-kicker">{cell.label}</p>
            <p className="nf-night-value">{cell.value}</p>
            <p className="nf-night-note">{cell.note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
