'use client';

import { useState } from 'react';
import { GearSixIcon, PlayIcon } from '@phosphor-icons/react';
// The leaf module, not the '@/room-store' barrel: the barrel re-exports
// server-only code that reaches node:crypto, which a client component cannot
// bundle. game-config.ts is pure data and arithmetic and runs anywhere.
import {
  DAY_TARGET_CHOICES,
  MAFIA_NIGHT_CHOICES,
  NIGHT_KILL_CHOICES,
  configProblems,
  mafiaCountFor,
} from '@/room-store/game-config';
import type { SessionSetup } from '@/realtime/events';

const seconds = (ms: number): string => `${String(Math.round(ms / 1000))}s`;
const minutes = (ms: number): string => `${String(Math.round(ms / 60_000))} min`;

/**
 * Set before Start, never during. Everything here already existed as config the
 * engine consumes — this only puts it in front of the person who should be
 * choosing it, and says what is wrong before they commit rather than throwing
 * after.
 */
export function SetupPanel({
  playerCount,
  canStart,
  onStart,
}: {
  /** Players, not seats: the GM narrates and draws no role. */
  playerCount: number;
  canStart: boolean;
  onStart: (setup: SessionSetup) => void;
}) {
  const [mafiaCount, setMafiaCount] = useState<number | null>(null);
  const [doctor, setDoctor] = useState(true);
  const [detective, setDetective] = useState(true);
  const [mafiaNightMs, setMafiaNightMs] = useState(60_000);
  const [nightKills, setNightKills] = useState(1);
  const [dayTargetMs, setDayTargetMs] = useState<number | null>(null);

  const setup: SessionSetup = {
    mafiaCount,
    doctor,
    detective,
    mafiaNightMs,
    nightKills,
    dayTargetMs,
  };
  const problems = configProblems(
    { mafiaCount, doctor, detective, mafiaNightMs, nightKills },
    playerCount,
    dayTargetMs,
  );
  const derived = mafiaCountFor(playerCount, mafiaCount);

  return (
    <div className="nf-setup">
      <p className="nf-kicker">
        <GearSixIcon size={12} /> Before you start
      </p>

      <div className="nf-setup-row">
        <span className="nf-setup-label">Mafia</span>
        <div className="nf-choices">
          <button
            type="button"
            className="btn btn-secondary"
            data-on={String(mafiaCount === null)}
            onClick={() => setMafiaCount(null)}
          >
            Auto ({String(derived)})
          </button>
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              type="button"
              className="btn btn-secondary"
              data-on={String(mafiaCount === n)}
              onClick={() => setMafiaCount(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="nf-setup-row">
        <span className="nf-setup-label">Roles</span>
        <div className="nf-choices">
          <button
            type="button"
            className="btn btn-secondary"
            data-on={String(doctor)}
            onClick={() => setDoctor(!doctor)}
          >
            Doctor
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            data-on={String(detective)}
            onClick={() => setDetective(!detective)}
          >
            Detective
          </button>
        </div>
      </div>

      <div className="nf-setup-row">
        <span className="nf-setup-label">Kills a night</span>
        <div className="nf-choices">
          {NIGHT_KILL_CHOICES.map((n) => (
            <button
              key={n}
              type="button"
              className="btn btn-secondary"
              data-on={String(nightKills === n)}
              onClick={() => setNightKills(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <p className="nf-setup-note">
        A ceiling on the ballot, not a quota. The mafia still have to agree on
        every name, and a tie for the last one takes nobody.
      </p>

      <div className="nf-setup-row">
        <span className="nf-setup-label">Mafia night</span>
        <div className="nf-choices">
          {MAFIA_NIGHT_CHOICES.map((ms) => (
            <button
              key={ms}
              type="button"
              className="btn btn-secondary"
              data-on={String(mafiaNightMs === ms)}
              onClick={() => setMafiaNightMs(ms)}
            >
              {seconds(ms)}
            </button>
          ))}
        </div>
      </div>

      <div className="nf-setup-row">
        <span className="nf-setup-label">Day target</span>
        <div className="nf-choices">
          {DAY_TARGET_CHOICES.map((ms) => (
            <button
              key={String(ms)}
              type="button"
              className="btn btn-secondary"
              data-on={String(dayTargetMs === ms)}
              onClick={() => setDayTargetMs(ms)}
            >
              {ms === null ? 'None' : minutes(ms)}
            </button>
          ))}
        </div>
      </div>
      <p className="nf-setup-note">
        A guide for you only — players never see it, and it never ends the day.
        You still press Advance.
      </p>

      {problems.length === 0 ? null : (
        <ul className="nf-problems" role="alert">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="nf-advance btn btn-primary"
        disabled={!canStart || problems.length > 0}
        onClick={() => onStart(setup)}
      >
        <PlayIcon size={18} />
        Start — you moderate
      </button>
    </div>
  );
}
