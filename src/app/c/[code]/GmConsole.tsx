'use client';

import { ArrowRightIcon, CircleIcon, SkullIcon } from '@phosphor-icons/react';
import { Countdown } from './Countdown';
import { PHASE_LABEL, ROLE_LABEL } from './phase-labels';
import { StoryCard } from './StoryCard';
import type { RoomView } from '@/room-store';

export interface GmActions {
  onAdvance: () => void;
  onForceKill: (playerId: string) => void;
  onForceRevive: (playerId: string) => void;
  onRevertPhase: () => void;
  onEndGame: () => void;
}

/**
 * Operated one-handed while narrating aloud: one oversized Advance, the phase,
 * the clock, and the roster. Overrides are collapsed so a mis-tap cannot cost a
 * round.
 */
export function GmConsole({ view, actions }: { view: RoomView; actions: GmActions }) {
  const game = view.game;
  if (game === null) return null;

  const players = game.players;
  const livingCount = players.filter((p) => p.alive).length;
  const over = game.phase === 'GAME_OVER';

  return (
    <div className="nf-card">
      <p className="nf-kicker">Narrating · crew {view.crewCode}</p>
      <h3>{PHASE_LABEL[game.phase]}</h3>

      <p className="nf-muted">
        {game.phaseEndsAt === null ? null : <Countdown endsAt={game.phaseEndsAt} />}
        {/* Roster is role-holders only: the GM never draws a role, so five here
            plus the narrator is a full six-person room, not a missing player. */}
        <span>
          {livingCount} of {players.length} players alive · you narrate, you hold no role
        </span>
      </p>

      {/* Advisory only: it counts down and then says so. No phase moves. */}
      {view.dayEndsAt === null ? null : (
        <p className="nf-day-target">
          <span className="nf-kicker">Your day target</span>
          <Countdown endsAt={view.dayEndsAt} />
          <span className="nf-muted"> · you still press Advance</span>
        </p>
      )}

      {/* Keyed on the phase so the card re-enters with the ground shift instead
          of swapping its words under the GM mid-sentence. Null for anyone who
          is not the GM — the projection decides that, not this component. */}
      {view.narration === null ? null : (
        <StoryCard key={game.phase} card={view.narration} phase={game.phase} />
      )}

      {over ? (
        <div className="nf-result" role="alertdialog" aria-live="assertive">
          <h4>
            {game.winner === 'MAFIA' ? 'Mafia win' : game.winner === 'TOWN' ? 'Town wins' : 'Game ended'}
          </h4>
          <p className="nf-muted">Every card is revealed below.</p>
        </div>
      ) : (
        <button type="button" className="nf-advance btn btn-primary" onClick={actions.onAdvance}>
          <ArrowRightIcon size={20} />
          Advance
        </button>
      )}

      <ul className="nf-roster">
        {players.map((player) => (
          <li key={player.id} className="nf-row" data-dead={String(!player.alive)}>
            {player.alive ? <CircleIcon size={10} weight="fill" /> : <SkullIcon size={12} />}
            <span className="nf-name">{player.name}</span>
            <span className="tag tag-neutral">
              {player.role === null ? '—' : ROLE_LABEL[player.role]}
            </span>
            {player.eliminatedBy === null ? null : (
              <span className="tag tag-outline">{player.eliminatedBy}</span>
            )}
          </li>
        ))}
      </ul>

      <details className="nf-overrides">
        <summary className="nf-kicker">Overrides</summary>
        <div className="mt-2 flex flex-col gap-2">
          {players.map((player) => (
            <div key={player.id} className="nf-row">
              <span className="nf-name">{player.name}</span>
              {player.alive ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    actions.onForceKill(player.id);
                  }}
                >
                  Kill
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    actions.onForceRevive(player.id);
                  }}
                >
                  Revive
                </button>
              )}
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-block" onClick={actions.onRevertPhase}>
            Revert phase
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={actions.onEndGame}>
            End game
          </button>
        </div>
      </details>
    </div>
  );
}
