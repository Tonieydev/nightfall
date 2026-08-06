'use client';

import {
  MicrophoneIcon,
  MicrophoneSlashIcon,
  SpeakerHighIcon,
  WifiSlashIcon,
} from '@phosphor-icons/react';
import { HEARS_LABEL, MIC_LABEL, channelFor } from './audio-state';
import { micState } from './mic-state';
import type { VoiceStatus } from './useVoice';
import type { RoomView } from '@/room-store';

/**
 * Everything this player needs to know about their voice, and the one control
 * that changes it.
 *
 * Joining and speaking are separate: the first tap puts them in the room with
 * no microphone at all, and the microphone is its own toggle after that. Being
 * muted is an ordinary state here, not a fault, because most of a game is spent
 * listening.
 */
export function MicRow({
  view,
  status,
  reason = null,
  audioBlocked = false,
  micOn = false,
  micReason = null,
  onJoin,
  onEnableAudio,
  onToggleMic,
}: {
  view: RoomView;
  status: VoiceStatus;
  reason?: string | null;
  audioBlocked?: boolean;
  micOn?: boolean;
  micReason?: string | null;
  onJoin: () => void;
  onEnableAudio: () => void;
  onToggleMic: () => void;
}) {
  const state = micState({ view, status, reason, audioBlocked, micOn, micReason });

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
            <WifiSlashIcon size={14} /> {state.reason ?? 'Could not join the room on this device.'}
          </p>
          <button type="button" className="nf-tile btn btn-secondary" onClick={onJoin}>
            Try again
          </button>
        </div>
      );

    case 'offer':
      return (
        <div className="nf-mic-slot">
          <button type="button" className="nf-tile btn btn-primary" onClick={onJoin}>
            <SpeakerHighIcon size={16} />
            {state.connecting ? 'Joining…' : 'Join the room'}
          </button>
          <p className="nf-muted">You will hear everyone. Your mic stays off until you turn it on.</p>
        </div>
      );

    case 'deaf':
      return (
        <div className="nf-mic-slot">
          <button type="button" className="nf-tile btn btn-primary" onClick={onEnableAudio}>
            <SpeakerHighIcon size={16} />
            Tap to hear the room
          </button>
          <p className="nf-muted">Your browser is holding the sound until you allow it.</p>
        </div>
      );

    // In the room, saying nothing. Most of a game looks like this.
    case 'muted':
      return (
        <div className="nf-mic-slot">
          <div className="nf-mic-bar" data-channel="silenced">
            <MicrophoneSlashIcon size={17} />
            <span className="nf-mic-lines">
              <span className="nf-mic-label">Your mic is off</span>
              <span className="nf-mic-hears">You can hear the room</span>
            </span>
            <button type="button" className="btn btn-secondary" onClick={onToggleMic}>
              <MicrophoneIcon size={16} />
              Turn on mic
            </button>
          </div>
          {state.reason === null ? null : <p className="nf-muted">{state.reason}</p>}
        </div>
      );

    // Mic on. The channel and who it reaches, as the comp states them.
    case 'heard':
    case 'silenced': {
      const channel = view.you === null ? 'silenced' : channelFor(view, view.you.playerId);
      const open = channel !== 'silenced';

      return (
        <div className="nf-mic-bar" data-channel={channel}>
          {open ? <MicrophoneIcon size={17} /> : <MicrophoneSlashIcon size={17} />}
          <span className="nf-mic-lines">
            <span className="nf-mic-label">{MIC_LABEL[channel]}</span>
            <span className="nf-mic-hears">{HEARS_LABEL[channel]}</span>
          </span>
          <button type="button" className="btn btn-secondary" onClick={onToggleMic}>
            <MicrophoneSlashIcon size={16} />
            Mute
          </button>
        </div>
      );
    }
  }
}
