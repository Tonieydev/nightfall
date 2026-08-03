'use client';

import { CircleIcon, DetectiveIcon, SkullIcon } from '@phosphor-icons/react';
import { Countdown } from './Countdown';
import { PHASE_LABEL, ROLE_LABEL, actionFor } from './phase-labels';
import type { RoomView } from '@/room-store';

export interface PlayerActions {
  onNightTarget: (targetId: string) => void;
  onVote: (targetId: string) => void;
  onClearVote: () => void;
}

/**
 * Glanceable, not engaging. Persistent: role, phase, who is alive. Interactive
 * only when this player must act — the tiles are absent otherwise, not disabled.
 */
export function PlayerScreen({ view, actions }: { view: RoomView; actions: PlayerActions }) {
  const game = view.game;
  if (game === null || view.you === null) return null;

  const me = game.players.find((p) => p.id === view.you?.playerId) ?? null;
  const alive = me?.alive ?? false;
  const prompt = actionFor(game.phase, me?.role ?? null, alive);

  const isNight = prompt !== null && game.phase !== 'VOTE';
  const myVote = view.you.playerId in game.dayVotes ? game.dayVotes[view.you.playerId] : null;

  const targets = game.players.filter((p) => p.alive && p.id !== view.you?.playerId);
  const votesFor = (id: string): number =>
    Object.values(game.dayVotes).filter((target) => target === id).length;

  return (
    <div className="card">
      <p className="card-kicker">{PHASE_LABEL[game.phase]}</p>
      <h4 className="card-title">
        {me === null ? 'Watching' : ROLE_LABEL[me.role ?? 'VILLAGER']}
      </h4>

      <p className="card-meta">
        {game.phaseEndsAt === null ? null : <Countdown endsAt={game.phaseEndsAt} />}
        {alive ? null : <span className="tag tag-neutral">eliminated</span>}
        {/* Voice arrives in the LiveKit step; the row is held so the layout
            does not shift under players when the mic indicator lands. */}
        <span aria-hidden="true" />
      </p>

      {game.detectiveResult === null ? null : (
        <p className="card-body">
          <DetectiveIcon size={14} />{' '}
          {game.players.find((p) => p.id === game.detectiveResult?.targetId)?.name} is{' '}
          <strong>{game.detectiveResult.team === 'MAFIA' ? 'Mafia' : 'Town'}</strong>.
        </p>
      )}

      {game.winner === null ? null : (
        <h5>{game.winner === 'MAFIA' ? 'Mafia win' : 'Town wins'}</h5>
      )}

      <ul className="my-4 flex list-none flex-col gap-2 p-0">
        {game.players.map((player) => (
          <li key={player.id} className="flex items-center gap-2">
            {player.alive ? <CircleIcon size={10} weight="fill" /> : <SkullIcon size={12} />}
            <span className={player.alive ? undefined : 'text-muted'}>{player.name}</span>
            {player.role === null ? null : (
              <span className="tag tag-neutral">{ROLE_LABEL[player.role]}</span>
            )}
            {votesFor(player.id) === 0 ? null : (
              <span className="tag tag-accent">{votesFor(player.id)}</span>
            )}
          </li>
        ))}
      </ul>

      {prompt === null ? null : (
        <>
          <p className="card-kicker">{prompt}</p>
          <div className="flex flex-col gap-2">
            {targets.map((target) => (
              <button
                key={target.id}
                type="button"
                className={myVote === target.id ? 'btn btn-primary btn-block' : 'btn btn-secondary btn-block'}
                onClick={() => {
                  if (isNight) actions.onNightTarget(target.id);
                  else actions.onVote(target.id);
                }}
              >
                {target.name}
              </button>
            ))}
            {game.phase === 'VOTE' && myVote !== null ? (
              <button type="button" className="btn btn-ghost btn-block" onClick={actions.onClearVote}>
                Pull my vote
              </button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
