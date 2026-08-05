'use client';

import { CircleIcon, SkullIcon } from '@phosphor-icons/react';
import { ROLE_LABEL } from './phase-labels';
import type { RoomView } from '@/room-store';

const CAUSE: Record<string, string> = {
  VOTE: 'voted out',
  MAFIA: 'taken at night',
  GM: 'removed by you',
};

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
  const rows =
    game === null
      ? view.members.map((m) => ({
          id: m.playerId,
          name: m.displayName,
          role: null as string | null,
          alive: true,
          eliminatedBy: null as string | null,
          connected: m.connected,
          isGm: view.gmPlayerId === m.playerId,
        }))
      : view.members.map((m) => {
          const player = game.players.find((p) => p.id === m.playerId);
          return {
            id: m.playerId,
            name: m.displayName,
            role: player?.role ?? null,
            alive: player?.alive ?? true,
            eliminatedBy: player?.eliminatedBy ?? null,
            connected: m.connected,
            // The GM draws no card, so they are a seat with no role, not a gap.
            isGm: view.gmPlayerId === m.playerId,
          };
        });

  const living = rows.filter((r) => !r.isGm && r.alive).length;
  const playing = rows.filter((r) => !r.isGm).length;

  return (
    <section className="nf-panel" aria-label="Roster">
      <div className="nf-panel-head">
        <h4>Roster</h4>
        <span className="nf-panel-note">
          {game === null
            ? `${String(rows.length)} seated · roles are dealt at random on start`
            : `${String(living)} of ${String(playing)} alive · you narrate and hold no role`}
        </span>
      </div>

      <ul className="nf-roster">
        {rows.map((row) => (
          <li key={row.id} className="nf-row" data-dead={String(!row.alive)}>
            {row.alive ? <CircleIcon size={10} weight="fill" /> : <SkullIcon size={12} />}
            <span className="nf-name">{row.name}</span>

            {row.isGm ? (
              <span className="tag tag-outline">narrating</span>
            ) : row.role === null ? (
              <span className="tag tag-neutral">—</span>
            ) : (
              <span className="tag tag-neutral">{ROLE_LABEL[row.role as 'MAFIA'] ?? row.role}</span>
            )}

            {row.eliminatedBy === null ? null : (
              <span className="nf-muted">{CAUSE[row.eliminatedBy] ?? row.eliminatedBy}</span>
            )}
            {row.connected ? null : <span className="tag tag-outline">away</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
