'use client';

import { CHANNEL_LABEL, channelFor, voteOf } from './audio-state';
import { ROLE_LABEL } from './phase-labels';
import type { RoomView } from '@/room-store';

/**
 * Every seat and, once the cards are dealt, the role in it. Only the GM's
 * projection carries every role — a player's copy of this list has nulls where
 * somebody else's card is, and that is enforced upstream in projectState, not
 * here. This component would happily render whatever it was given, which is
 * exactly why it must never be given a player's view.
 */
export function Roster({ view }: { view: RoomView }) {
  const game = view.game;

  // Before Start there are no roles to attach, only seats.
  const rows = view.members.map((m) => {
    const player = game?.players.find((p) => p.id === m.playerId);
    const channel = channelFor(view, m.playerId);
    return {
      id: m.playerId,
      name: m.displayName,
      role: player?.role ?? null,
      alive: player?.alive ?? true,
      connected: m.connected,
      // The GM draws no card, so they are a seat with no role, not a gap.
      isGm: view.gmPlayerId === m.playerId,
      vote: voteOf(view, m.playerId),
      hearing: channel,
      audio: CHANNEL_LABEL[channel],
    };
  });

  const living = rows.filter((r) => !r.isGm && r.alive).length;
  const playing = rows.filter((r) => !r.isGm).length;

  return (
    <section className="card elev-sm nf-panel" aria-label="Roster">
      <div className="nf-panel-head">
        <h4>Roster</h4>
        <span className="nf-panel-note">
          {game === null
            ? `${String(rows.length)} seated · roles are dealt at random on start`
            : `${String(living)} of ${String(playing)} alive · you narrate and hold no role`}
        </span>
      </div>

      <div className="nf-table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Player</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              <th scope="col">Vote</th>
              <th scope="col">Audio</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} data-dead={String(!row.alive)}>
                <td>{row.name}</td>
                <td>
                  {row.isGm ? (
                    <span className="tag tag-outline">Narrator</span>
                  ) : row.role === null ? (
                    <span className="tag tag-neutral">-</span>
                  ) : (
                    <span className="tag tag-neutral">
                      {ROLE_LABEL[row.role as 'MAFIA'] ?? row.role}
                    </span>
                  )}
                </td>
                <td>{row.alive ? 'Alive' : 'Eliminated'}</td>
                <td className="nf-muted">{row.vote}</td>
                <td>
                  <span className="tag" data-hearing={row.hearing}>
                    {row.audio}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
