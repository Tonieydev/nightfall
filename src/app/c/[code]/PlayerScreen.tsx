'use client';

import { CircleIcon, DetectiveIcon, SkullIcon } from '@phosphor-icons/react';
import { Countdown } from './Countdown';
import { ElectionCard } from './ElectionCard';
import { MicRow } from './MicRow';
import type { VoiceStatus } from './useVoice';
import { PHASE_LABEL, ROLE_LABEL, actionFor } from './phase-labels';
import type { RoomView } from '@/room-store';

export interface PlayerActions {
  onNightTarget: (targetId: string) => void;
  onVote: (targetId: string) => void;
  onClearVote: () => void;
  onEnableVoice: () => void;
}

/**
 * Glanceable, not engaging. Persistent: role, phase, who is alive. Interactive
 * only when this player must act — the tiles are absent otherwise, not disabled.
 */
export function PlayerScreen({
  view,
  actions,
  voiceStatus,
}: {
  view: RoomView;
  actions: PlayerActions;
  voiceStatus: VoiceStatus;
}) {
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
    <div className="nf-card">
      <p className="nf-kicker">{PHASE_LABEL[game.phase]}</p>
      <h4 className={game.phase === 'ROLE_REVEAL' ? 'nf-reveal' : undefined}>
        {me === null ? 'Watching' : ROLE_LABEL[me.role ?? 'VILLAGER']}
      </h4>

      <p className="nf-muted">
        {game.phaseEndsAt === null ? null : <Countdown endsAt={game.phaseEndsAt} />}
        {alive ? null : <span className="tag tag-neutral">eliminated</span>}
      </p>

      {/* The eliminated see this too: it is the room's result, not the living
          players' result. Keyed on the round so it plays once per verdict. */}
      <ElectionCard key={`election-${String(game.phaseNumber)}`} view={view} />

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

      <ul className="nf-roster">
        {game.players.map((player) => (
          <li
            key={player.id}
            className="nf-row"
            data-dead={String(!player.alive)}
            data-accused={String(votesFor(player.id) > 0)}
          >
            {player.alive ? <CircleIcon size={10} weight="fill" /> : <SkullIcon size={12} />}
            <span className="nf-name">{player.name}</span>
            {player.role === null ? null : (
              <span className="tag tag-neutral">{ROLE_LABEL[player.role]}</span>
            )}
            {votesFor(player.id) === 0 ? null : (
              <span className="nf-weight">{'•'.repeat(votesFor(player.id))}</span>
            )}
          </li>
        ))}
      </ul>

      {prompt === null ? null : (
        <>
          <p className="nf-kicker">{prompt}</p>
          <div className="nf-tiles">
            {targets.map((target) => (
              <button
                key={target.id}
                type="button"
                className={`nf-tile btn ${myVote === target.id ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => {
                  if (isNight) actions.onNightTarget(target.id);
                  else actions.onVote(target.id);
                }}
              >
                {target.name}
              </button>
            ))}
            {game.phase === 'VOTE' && myVote !== null ? (
              <button type="button" className="nf-tile btn btn-ghost" onClick={actions.onClearVote}>
                Pull my vote
              </button>
            ) : null}
          </div>
        </>
      )}
      <MicRow view={view} status={voiceStatus} onEnable={actions.onEnableVoice} />
    </div>
  );
}
