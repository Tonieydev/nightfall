'use client';

import { MicrophoneIcon, MicrophoneSlashIcon, WifiSlashIcon } from '@phosphor-icons/react';
import { micState } from './mic-state';
import type { VoiceStatus } from './useVoice';
import type { RoomView } from '@/room-store';

/**
 * The indicator answers one question: can this player be heard right now. The
 * count is read off the server's projected audio row rather than off local
 * mute, because a player has to know with certainty rather than with hope.
 *
 * Which message to show is decided in mic-state.ts, where it can be tested. It
 * used to be a chain of early returns here, and the chain let a device whose
 * voice never opened fall through to "Heard by 6".
 */
export function MicRow({
  view,
  status,
  reason = null,
  onEnable,
}: {
  view: RoomView;
  status: VoiceStatus;
  /** Why voice is not working, when it is not. */
  reason?: string | null;
  onEnable: () => void;
}) {
  const state = micState(view, status, reason);

  switch (state.kind) {
    case 'budget':
      return (
        <p className="nf-mic-slot nf-muted">
          Voice is at capacity this month. The game plays without live audio.
        </p>
      );

    case 'failed':
      return (
        <div className="nf-mic-slot">
          <p className="nf-muted">
            <WifiSlashIcon size={14} />{' '}
            {state.reason ?? 'Voice could not connect on this device.'}
          </p>
          <button type="button" className="nf-tile btn btn-secondary" onClick={onEnable}>
            <MicrophoneIcon size={16} />
            Try again
          </button>
        </div>
      );

    case 'listening':
      return (
        <div className="nf-mic-slot">
          <p className="nf-muted">
            <MicrophoneSlashIcon size={14} /> You can hear the room. They cannot hear you.
          </p>
          {state.reason === null ? null : <p className="nf-muted">{state.reason}</p>}
          <button type="button" className="nf-tile btn btn-secondary" onClick={onEnable}>
            <MicrophoneIcon size={16} />
            Try the microphone again
          </button>
        </div>
      );

    case 'offer':
      return (
        <div className="nf-mic-slot">
          <button type="button" className="nf-tile btn btn-primary" onClick={onEnable}>
            <MicrophoneIcon size={16} />
            {state.connecting ? 'Connecting…' : 'Turn on voice'}
          </button>
        </div>
      );

    case 'heard':
      return (
        <p className="nf-mic-slot nf-muted">
          <MicrophoneIcon size={14} /> Heard by {state.count}
        </p>
      );

    case 'silenced':
      return (
        <p className="nf-mic-slot nf-muted">
          <MicrophoneSlashIcon size={14} /> Nobody is receiving you right now
        </p>
      );
  }
}
