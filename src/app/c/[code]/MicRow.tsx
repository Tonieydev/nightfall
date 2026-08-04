'use client';

import { MicrophoneIcon, MicrophoneSlashIcon, WifiSlashIcon } from '@phosphor-icons/react';
import type { VoiceStatus } from './useVoice';
import type { RoomView } from '@/room-store';

/**
 * The indicator answers one question: can this player be heard right now. It is
 * read off the server's projected audio row, never off local mute, because a
 * player has to know with certainty rather than with hope.
 */
export function MicRow({
  view,
  status,
  onEnable,
}: {
  view: RoomView;
  status: VoiceStatus;
  onEnable: () => void;
}) {
  if (!view.voiceEnabled) {
    return (
      <p className="nf-mic-slot nf-muted">
        Voice is at capacity this month — the game plays without live audio.
      </p>
    );
  }

  if (status === 'idle' || status === 'connecting') {
    return (
      <div className="nf-mic-slot">
        <button type="button" className="nf-tile btn btn-primary" onClick={onEnable}>
          <MicrophoneIcon size={16} />
          {status === 'connecting' ? 'Connecting…' : 'Turn on voice'}
        </button>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <p className="nf-mic-slot nf-muted">
        <WifiSlashIcon size={14} /> Voice could not connect. The game continues.
      </p>
    );
  }

  // Server truth: an empty speaksTo means nobody is receiving this player.
  const heardBy = view.audio?.speaksTo.length ?? 0;

  return (
    <p className="nf-mic-slot nf-muted">
      {heardBy > 0 ? <MicrophoneIcon size={14} /> : <MicrophoneSlashIcon size={14} />}
      {heardBy > 0 ? ` Heard by ${String(heardBy)}` : ' Not heard by anyone right now'}
    </p>
  );
}
