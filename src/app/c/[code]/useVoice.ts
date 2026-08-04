'use client';

import { useCallback, useRef, useState } from 'react';
import { Room, RoomEvent, type LocalAudioTrack } from 'livekit-client';

export type VoiceStatus = 'idle' | 'connecting' | 'live' | 'unavailable' | 'failed';

interface VoiceTokenResponse {
  voiceEnabled: boolean;
  token?: string;
  url?: string;
}

function parseToken(body: unknown): VoiceTokenResponse | null {
  if (typeof body !== 'object' || body === null) return null;
  const { voiceEnabled, token, url } = body as Record<string, unknown>;
  if (typeof voiceEnabled !== 'boolean') return null;
  if (!voiceEnabled) return { voiceEnabled: false };
  if (typeof token !== 'string' || typeof url !== 'string') return null;
  return { voiceEnabled: true, token, url };
}

/**
 * Voice is opened by one tap and never automatically, because iOS Safari
 * requires a user gesture for two separate things — capturing the microphone
 * and playing remote audio — and they must happen inside the same gesture.
 * Doing only the first is the classic failure: everyone connects, nobody hears
 * anything, and it looks like the product is broken.
 */
export function useVoice(crewCode: string, playerToken: string) {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const roomRef = useRef<Room | null>(null);

  const connect = useCallback(async (): Promise<void> => {
    if (roomRef.current !== null || status === 'connecting') return;
    setStatus('connecting');

    try {
      const response = await fetch(`/api/crew/${crewCode}/voice-token`, {
        method: 'POST',
        headers: { authorization: `Bearer ${playerToken}` },
      });
      const parsed = parseToken(await response.json());

      if (parsed === null || !response.ok) {
        setStatus('failed');
        return;
      }
      if (!parsed.voiceEnabled) {
        setStatus('unavailable');
        return;
      }

      const room = new Room({
        // Spec section 2: interruption is the game, so nothing may gate it.
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        publishDefaults: { dtx: false, red: true, audioPreset: { maxBitrate: 32_000 } },
      });
      roomRef.current = room;

      room.on(RoomEvent.Disconnected, () => {
        roomRef.current = null;
        setStatus('idle');
      });

      await room.connect(parsed.url ?? '', parsed.token ?? '');

      // Both halves of the gesture, in the order iOS needs them. The mic prompt
      // consumes the gesture, so playback is unlocked immediately after inside
      // the same call stack.
      await room.localParticipant.setMicrophoneEnabled(true);
      await room.startAudio();

      setStatus('live');
    } catch {
      roomRef.current = null;
      setStatus('failed');
    }
  }, [crewCode, playerToken, status]);

  const disconnect = useCallback(async (): Promise<void> => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room !== null) await room.disconnect();
    setStatus('idle');
  }, []);

  const setMuted = useCallback(async (muted: boolean): Promise<void> => {
    const room = roomRef.current;
    if (room === null) return;
    await room.localParticipant.setMicrophoneEnabled(!muted);
  }, []);

  return { status, connect, disconnect, setMuted };
}

export type { LocalAudioTrack };
