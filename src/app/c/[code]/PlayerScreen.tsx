'use client';

import { CircleIcon, DetectiveIcon, MoonIcon, SkullIcon } from '@phosphor-icons/react';
import { Countdown } from './Countdown';
import { ElectionCard } from './ElectionCard';
import { MicRow } from './MicRow';
import type { VoiceStatus } from './useVoice';
import { ROLE_LABEL, actionFor } from './phase-labels';
import { ROLE_BLURB } from '@/narration/roles';
import { playerPhase } from '@/narration/player-phase';
import type { RoomView } from '@/room-store';

export interface PlayerActions {
  onNightTarget: (targetId: string) => void;
  onVote: (targetId: string) => void;
  onClearVote: () => void;
  onEnableVoice: () => void;
  onEnableAudio: () => void;
}

/**
 * Glanceable, not engaging. Persistent: role, phase, who is alive. Interactive
 * only when this player must act — the tiles are absent otherwise, not disabled.
 */
export function PlayerScreen({
  view,
  actions,
  voiceStatus,
  voiceReason,
  audioBlocked,
}: {
  view: RoomView;
  actions: PlayerActions;
  voiceStatus: VoiceStatus;
  voiceReason: string | null;
  audioBlocked: boolean;
}) {
  const game = view.game;
  if (game === null || view.you === null) return null;

  const me = game.players.find((p) => p.id === view.you?.playerId) ?? null;
  const alive = me?.alive ?? false;
  const prompt = actionFor(game.phase, me?.role ?? null, alive);
  const now = playerPhase(game.phase, me?.role ?? null, alive);

  const isNight = prompt !== null && game.phase !== 'VOTE';
  const myVote = view.you.playerId in game.dayVotes ? game.dayVotes[view.you.playerId] : null;

  const targets = game.players.filter((p) => p.alive && p.id !== view.you?.playerId);
  // Only ever the mafia this player is already projected, never a lookup.
  const mafiaWithYou = game.players.filter(
    (p) => p.role === 'MAFIA' && p.id !== view.you?.playerId,
  );
  // A living player at night with nothing to tap: the screen the comp holds for
  // the moon rather than a roster they can do nothing with.
  const idle = alive && prompt === null && game.phase.startsWith('NIGHT_');
  const votesFor = (id: string): number =>
    Object.values(game.dayVotes).filter((target) => target === id).length;

  return (
    <div className="nf-card">
      {/* The reveal is the card, and the comp gives it the whole screen: the
          name, and the job it actually asks of you. A player reading only
          "Villager" has been told what they are and not what to do with it. */}
      {game.phase === 'ROLE_REVEAL' && me !== null && me.role !== null ? (
        <>
          <section className="nf-card-reveal nf-reveal" data-mafia={String(me.role === 'MAFIA')}>
            <p className="nf-kicker">Your card</p>
            <p className="nf-card-role">{ROLE_LABEL[me.role]}</p>
            <p className="nf-card-blurb">{ROLE_BLURB[me.role]}</p>

            {me.role === 'MAFIA' && mafiaWithYou.length > 0 ? (
              <div className="nf-card-team">
                <p className="nf-kicker">With you</p>
                <div className="nf-card-team-names">
                  {mafiaWithYou.map((p) => (
                    <span key={p.id} className="tag">
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
          <p className="nf-card-secret">Nobody else can see this screen. Say nothing yet.</p>
        </>
      ) : idle ? (
        // The night, for somebody with nothing to tap. The comp holds the whole
        // screen for it rather than leaving a roster to stare at.
        <section className="nf-nightfall">
          <MoonIcon size={46} weight="fill" />
          <p className="nf-nightfall-title">{now.title === 'Night' ? 'The town sleeps.' : now.title}</p>
          <p className="nf-nightfall-sub">Your mic is held by the game master.</p>
        </section>
      ) : (
        <>
          <p className="nf-kicker">
            {me === null ? (
              'Watching'
            ) : (
              <span className="tag tag-neutral">{ROLE_LABEL[me.role ?? 'VILLAGER']}</span>
            )}
            {alive ? null : <span className="tag tag-neutral">eliminated</span>}
          </p>
          <h4>{now.title}</h4>
          <p className="nf-phase-sub" data-waiting={String(now.waiting)}>
            {now.line}
          </p>
        </>
      )}

      {/* Above the roster, for the same reason it is above it in the lobby. */}
      <MicRow
        view={view}
        status={voiceStatus}
        reason={voiceReason}
        audioBlocked={audioBlocked}
        onEnable={actions.onEnableVoice}
        onEnableAudio={actions.onEnableAudio}
      />

      <p className="nf-muted">
        {game.phaseEndsAt === null ? null : <Countdown endsAt={game.phaseEndsAt} />}
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
    </div>
  );
}
