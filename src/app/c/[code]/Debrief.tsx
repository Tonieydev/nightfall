'use client';

import { ArrowClockwiseIcon, CrownSimpleIcon, SkullIcon } from '@phosphor-icons/react';
import { ClaimCard } from './ClaimCard';
import { ROLE_LABEL } from './phase-labels';
import type { RoomView } from '@/room-store';

const CAUSE_LABEL: Record<string, string> = {
  VOTE: 'voted out',
  MAFIA: 'taken in the night',
  GM: 'removed by the moderator',
};

/**
 * Rendered from the final projected state, which is Redis. The Postgres write
 * runs alongside this and is not a dependency of it: if the durable copy fails,
 * the crew still gets their debrief.
 */
/** What this player just did, in their own terms, the reason to keep a record. */
function summaryFor(view: RoomView): string {
  const you = view.game?.players.find((p) => p.id === view.you?.playerId);
  if (you === undefined) return 'You narrated this one.';

  const role = you.role === null ? 'a player' : ROLE_LABEL[you.role];
  const won = view.game?.winner !== null && you.role !== null;
  const outcome = won ? 'and your side took it' : 'and your side lost it';
  return `You played ${role}, ${you.alive ? 'survived' : 'did not survive'}, ${outcome}.`;
}

export function Debrief({
  view,
  claimAvailable,
  onNewSession,
}: {
  view: RoomView;
  claimAvailable: boolean;
  /** Back to a lobby, same room, same people. */
  onNewSession: () => void;
}) {
  const game = view.game;
  if (game === null) return null;

  // At GAME_OVER every card is revealed, so this is the whole table.
  const timeline = game.players
    .filter((p) => !p.alive)
    .sort((a, b) => (a.eliminatedAtPhase ?? 0) - (b.eliminatedAtPhase ?? 0));
  const survivors = game.players.filter((p) => p.alive);

  return (
    <div className="nf-card">
      <p className="nf-kicker">Crew {view.crewCode}</p>
      <h3>{game.winner === 'MAFIA' ? 'Mafia win' : game.winner === 'TOWN' ? 'Town wins' : 'Game ended'}</h3>

      <p className="nf-kicker">Every card</p>
      <ul className="nf-roster">
        {game.players.map((player) => (
          <li key={player.id} className="nf-row" data-dead={String(!player.alive)}>
            <span className="nf-name">{player.name}</span>
            <span className="tag tag-neutral">
              {player.role === null ? '-' : ROLE_LABEL[player.role]}
            </span>
            {player.id === view.you?.playerId ? <span className="tag tag-outline">you</span> : null}
          </li>
        ))}
      </ul>

      <p className="nf-kicker">How it went</p>
      <ul className="nf-roster">
        {timeline.length === 0 ? (
          <li className="nf-row nf-muted">Nobody died. That happens.</li>
        ) : (
          timeline.map((player) => (
            <li key={player.id} className="nf-row" data-dead="true">
              <SkullIcon size={12} />
              <span className="nf-name">{player.name}</span>
              <span className="nf-muted">
                {player.eliminatedBy === null ? '' : CAUSE_LABEL[player.eliminatedBy]}
                {player.eliminatedAtPhase === null
                  ? ''
                  : ` · night ${String(player.eliminatedAtPhase)}`}
              </span>
            </li>
          ))
        )}
      </ul>

      {survivors.length === 0 ? null : (
        <p className="nf-muted">
          Survived: {survivors.map((p) => p.name).join(', ')}
        </p>
      )}

      <p className="nf-kicker">Who moderates next</p>
      <p className="nf-muted">
        <CrownSimpleIcon size={14} />{' '}
        {view.members.find((m) => m.playerId === view.gmPlayerId)?.displayName ?? 'Someone'} narrated
        this one. Anyone can start the next.
      </p>

      {/* The same room, not a new code. Sending a crew to the landing page for
          a fresh link loses everybody who does not follow it, which on a group
          call is most of them. The moderator seat opens up with it, which is
          what makes the line above true. */}
      <button type="button" className="nf-advance btn btn-primary" onClick={onNewSession}>
        <ArrowClockwiseIcon size={18} />
        Play again
      </button>
      <p className="nf-muted">
        Same crew, same code. Everyone stays where they are and somebody new can
        take the console.
      </p>

      {/* Last, and only here: the game is over and there is something to keep. */}
      {claimAvailable ? <ClaimCard summary={summaryFor(view)} /> : null}
    </div>
  );
}
