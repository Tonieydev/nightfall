'use client';

import type { RoomView } from '@/room-store';

import { CHANNEL_LABEL, channelFor } from './audio-state';

/**
 * The thing no competitor has, and the thing the GM otherwise has to take on
 * faith: which room every microphone is actually in, right now, straight off
 * the graph that drives the audio subscriptions. If a phase sounds wrong this
 * is where the GM sees it.
 *
 * GM-only by projection, not by this component — `audioGraph` is null for
 * everyone else, so there is nothing here to hide.
 */
export function AudioMap({ view }: { view: RoomView }) {
  const graph = view.audioGraph;
  const game = view.game;
  if (graph === null || game === null) return null;

  const rows = view.members.map((member) => {
    const player = game.players.find((p) => p.id === member.playerId);
    return {
      id: member.playerId,
      name: member.displayName,
      // The GM is not a player and holds no role; everyone else does.
      role: player === undefined ? 'Narrator' : (player.role ?? '—'),
      dead: player !== undefined && !player.alive,
      hearing: channelFor(view, member.playerId),
    };
  });

  return (
    <section className="card elev-sm nf-panel" aria-label="Who can hear whom">
      <div className="nf-panel-head">
        <h4>Who can hear whom</h4>
        <span className="nf-panel-note">
          Straight off the graph driving the audio. Only you see this.
        </span>
      </div>

      <div className="nf-audio-grid">
        {rows.map((row) => (
          <div key={row.id} className="nf-audio-cell" data-dead={String(row.dead)}>
            <div className="nf-audio-who">
              <span className="nf-initial" aria-hidden="true">
                {row.name.slice(0, 1).toUpperCase()}
              </span>
              <span className="nf-name">{row.name}</span>
              <span className="nf-audio-role">{row.role}</span>
            </div>
            <span className="tag" data-hearing={row.hearing}>
              {CHANNEL_LABEL[row.hearing]}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
