'use client';

import { useState } from 'react';

import { AudioMap } from './AudioMap';
import { ElectionCard } from './ElectionCard';
import { MicRow } from './MicRow';
import { NightActions } from './NightActions';
import { PhaseCard } from './PhaseCard';
import { Roster } from './Roster';
import { StoryCard } from './StoryCard';
import { Verdict } from './Verdict';
import { VoteTally } from './VoteTally';
import type { VoiceStatus } from './useVoice';
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
export function GmConsole({
  view,
  actions,
  voiceStatus,
  onEnableVoice,
}: {
  view: RoomView;
  actions: GmActions;
  voiceStatus: VoiceStatus;
  onEnableVoice: () => void;
}) {
  // Above the early return: hooks cannot sit behind a conditional.
  const [script, setScript] = useState(true);

  const game = view.game;
  if (game === null) return null;

  const players = game.players;

  return (
    <div className="nf-console">
      {/* The spine: where the room is, and the one control that moves it. */}
      <div className="nf-console-main">
        {game.winner === null ? null : (
          <div className="nf-winner" role="alertdialog" aria-live="assertive">
            <div>
              <p className="nf-kicker">Win condition met</p>
              <p className="nf-winner-text">
                {game.winner === 'MAFIA' ? 'Mafia win' : 'Town wins'}
              </p>
            </div>
            <p className="nf-muted">Every card is revealed below.</p>
          </div>
        )}

        {/* The GM is audible to every player in every phase and had no control
            to turn their own microphone on, so they were the one person in the
            room guaranteed to be silent. */}
        <MicRow view={view} status={voiceStatus} onEnable={onEnableVoice} />

        <PhaseCard view={view} onAdvance={actions.onAdvance} />

        {/* Keyed on the phase so the words re-enter with the ground shift
            rather than swapping under the GM mid-sentence. */}
        {view.narration === null ? null : (
          <StoryCard
            key={game.phase}
            card={view.narration}
            phase={game.phase}
            on={script}
            onToggle={setScript}
          />
        )}

        {/* Keyed on the round so it plays its rise once per verdict, and again
            next round rather than sitting still for the rest of the game. */}
        <ElectionCard key={`election-${String(game.phaseNumber)}`} view={view} />
        <Verdict view={view} />
        <NightActions view={view} />
        <VoteTally view={view} />
        <AudioMap view={view} />
      </div>

      <aside className="nf-console-side">
        <Roster view={view} />

        {view.chat.length === 0 ? null : (
          <section className="nf-panel" aria-label="Room chat">
            <div className="nf-panel-head">
              <h4>Room chat</h4>
              <span className="nf-panel-note">Every channel, cleared at the next phase.</span>
            </div>
            <ul className="nf-roster">
              {view.chat.map((message) => (
                <li key={message.id} className="nf-row">
                  <span className="nf-name">{message.senderName}</span>
                  <span className="nf-muted">{message.text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

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
      </aside>
    </div>
  );
}
