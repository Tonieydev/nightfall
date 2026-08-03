'use client';

import { useEffect, useState } from 'react';
import { TimerIcon } from '@phosphor-icons/react';

/**
 * Renders the clock the server already decided. It never resolves anything —
 * reaching zero here means nothing; the server's reconciliation ends the phase.
 */
export function Countdown({ endsAt }: { endsAt: number }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, endsAt - Date.now()));

  useEffect(() => {
    setRemaining(Math.max(0, endsAt - Date.now()));
    const tick = setInterval(() => {
      setRemaining(Math.max(0, endsAt - Date.now()));
    }, 250);
    return () => {
      clearInterval(tick);
    };
  }, [endsAt]);

  const seconds = Math.ceil(remaining / 1000);

  return (
    <span className="tag tag-outline" aria-live="off">
      <TimerIcon size={12} />
      {seconds}s
    </span>
  );
}
