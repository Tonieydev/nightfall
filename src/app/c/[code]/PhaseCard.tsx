'use client';

import { ArrowRightIcon } from '@phosphor-icons/react';
import { Countdown } from './Countdown';
import { PHASE_LABEL } from './phase-labels';
import type { RoomView } from '@/room-store';

/** What this phase is for, in one line, for the person running it. */
const PHASE_SUB: Record<string, string> = {
  LOBBY: 'Everyone is seated. Start when the room settles.',
  ROLE_REVEAL: 'Cards are on their screens. Give them a moment.',
  NIGHT_MAFIA: 'The mafia hear each other and nobody else. The town hears only you.',
  NIGHT_DOCTOR: 'The doctor points. Nobody speaks.',
  NIGHT_DETECTIVE: 'The detective points. Their answer lands on their own device.',
  DAWN: 'Read the night out, then open the day.',
  DAY: 'Theirs, not yours. Listen and keep time.',
  VOTE: 'Live and public. A tie eliminates nobody.',
  GAME_OVER: 'Every card is face up.',
};

/**
 * The spine of the console: where the room is, and the one control that moves
 * it. Deliberately the largest thing on the screen — it is read at a glance by
 * someone who is mid-sentence, not studying.
 */
export function PhaseCard({ view, onAdvance }: { view: RoomView; onAdvance: () => void }) {
  const game = view.game;
  if (game === null) return null;

  const over = game.phase === 'GAME_OVER';
  const alive = game.players.filter((p) => p.alive).length;

  return (
    <section className="nf-phase" data-lit={game.phase.startsWith('NIGHT_') ? 'night' : 'day'}>
      <div className="nf-phase-main">
        <p className="nf-phase-round">
          <span className="nf-pulse" aria-hidden="true" />
          Round {view.round} · {alive} of {game.players.length} alive
        </p>
        <h2 className="nf-phase-label">{PHASE_LABEL[game.phase]}</h2>
        <p className="nf-phase-sub">{PHASE_SUB[game.phase]}</p>
      </div>

      <div className="nf-phase-control">
        {over ? (
          <p className="nf-muted">
            {game.winner === 'MAFIA'
              ? 'Mafia win.'
              : game.winner === 'TOWN'
                ? 'Town wins.'
                : 'Game ended.'}
          </p>
        ) : (
          // Named for the next thing out of the GM's mouth, not for the next
          // phase — pressing it is the same gesture as saying it.
          <button type="button" className="nf-phase-advance btn btn-primary" onClick={onAdvance}>
            <ArrowRightIcon size={20} />
            {view.advanceLabel ?? 'Advance'}
          </button>
        )}

        {/* The authoritative clock — this one resolves the phase by itself. */}
        {game.phaseEndsAt === null ? null : (
          <p className="nf-phase-clock">
            <Countdown endsAt={game.phaseEndsAt} /> · resolves itself
          </p>
        )}

        {/* The GM's own target. Guides, never resolves. */}
        {view.dayEndsAt === null ? null : (
          <p className="nf-phase-clock" data-soft="true">
            <Countdown endsAt={view.dayEndsAt} /> · your target, you still advance
          </p>
        )}
      </div>
    </section>
  );
}
