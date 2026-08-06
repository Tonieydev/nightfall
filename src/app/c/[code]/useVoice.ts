'use client';

import { useCallback, useRef, useState } from 'react';
import { Room, RoomEvent, Track, type LocalAudioTrack, type RemoteTrack } from 'livekit-client';
import { CAPTURE_DEFAULTS, PUBLISH_DEFAULTS, RECONNECT } from './capture';

/**
 * Whether this device is in the voice room. Nothing about the microphone: that
 * is a separate permission and a separate decision, and bundling them meant a
 * player who would not hand over their mic could not hear the game either.
 */
export type VoiceStatus = 'idle' | 'connecting' | 'live' | 'unavailable' | 'failed';

/**
 * Why voice is not working, in words a player can act on. A bare catch used to
 * discard this, so "could not connect" covered a denied permission, a missing
 * microphone and an unreachable server alike, and nobody could tell which of
 * their problems they had.
 */
function reasonFor(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);

  if (name === 'NotAllowedError' || /permission|denied/i.test(message)) {
    return 'Your browser blocked the microphone. Allow it for this site and try again.';
  }
  if (name === 'NotFoundError' || /no.*(device|microphone)/i.test(message)) {
    return 'No microphone was found on this device.';
  }
  if (name === 'NotReadableError' || /in use|busy/i.test(message)) {
    return 'Another app is holding the microphone. Close it and try again.';
  }
  return message === '' ? 'The voice server could not be reached.' : message;
}

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
 * Joining is one tap and takes no microphone with it. Everyone in the lobby can
 * hear each other from the moment they arrive; speaking is a second, separate
 * decision that asks for the microphone when it is actually wanted.
 *
 * Never automatic, because iOS Safari requires a user gesture to play remote
 * audio at all. The join tap spends that gesture on playback, which is the half
 * that everybody needs.
 */
export function useVoice(crewCode: string, playerToken: string) {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [reason, setReason] = useState<string | null>(null);
  /**
   * The browser is holding remote audio until a gesture releases it. Every
   * browser may do this and doing it quietly is the normal behaviour, so a
   * player whose microphone works perfectly sits in silence with nothing on
   * screen suggesting why. It has to be watched, not assumed away by calling
   * startAudio once and hoping.
   */
  const [audioBlocked, setAudioBlocked] = useState(false);
  /** Publishing or not. Off is the state everybody starts in. */
  const [micOn, setMicOn] = useState(false);
  const [micReason, setMicReason] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  /**
   * Where remote audio actually plays.
   *
   * livekit-client hands a subscribed track to the application and stops there:
   * it does not put audio on the page by itself, and startAudio() only resumes
   * elements that are already attached. Nothing here attached any, so there was
   * nothing to resume. Publishing worked, the server's subscriptions worked,
   * and not one person ever heard another.
   */
  const sinkRef = useRef<HTMLDivElement | null>(null);

  const connect = useCallback(async (): Promise<void> => {
    if (status === 'connecting' || roomRef.current !== null) return;

    setStatus('connecting');
    setReason(null);

    try {
      const response = await fetch(`/api/crew/${crewCode}/voice-token`, {
        method: 'POST',
        headers: { authorization: `Bearer ${playerToken}` },
      });
      const parsed = parseToken(await response.json());

      if (parsed === null || !response.ok) {
        setReason(
          response.status === 404
            ? 'That room is no longer open.'
            : `The voice server refused this device (${String(response.status)}).`,
        );
        setStatus('failed');
        return;
      }
      if (!parsed.voiceEnabled) {
        setStatus('unavailable');
        return;
      }

      // Spec section 2: interruption is the game, so nothing may gate the
      // microphone. Everything in capture.ts cleans the signal or bounds the
      // uplink — none of it closes the mic or delays a first syllable.
      const room = new Room({
        audioCaptureDefaults: CAPTURE_DEFAULTS,
        publishDefaults: PUBLISH_DEFAULTS,
        reconnectPolicy: {
          nextRetryDelayInMs: ({ retryCount }) =>
            retryCount >= RECONNECT.maxRetries ? null : RECONNECT.delayFor(retryCount),
        },
      });
      roomRef.current = room;

      // A hidden sink for the audio elements. Off-document they do not play.
      const sink = document.createElement('div');
      sink.dataset['nfVoice'] = 'sink';
      sink.style.display = 'none';
      document.body.appendChild(sink);
      sinkRef.current = sink;

      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio) return;

        // attach() mints a NEW element every call, and the server re-issues
        // subscribe on every graph pass, so this fires again for a track that
        // is already playing. Two elements on one stream a few milliseconds
        // apart is reverb; three is an echo. attachedElements is the SDK's own
        // bookkeeping and the same array startAudio() reads, so asking it is
        // both the cheapest check and the one that cannot disagree.
        if (track.attachedElements.length > 0) return;

        const element = track.attach();
        element.autoplay = true;
        sinkRef.current?.appendChild(element);
      });

      // The server revokes subscriptions at every phase change. An element left
      // playing would be a channel the graph has already closed.
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        for (const element of track.detach()) element.remove();
      });

      room.on(RoomEvent.Disconnected, () => {
        roomRef.current = null;
        sinkRef.current?.remove();
        sinkRef.current = null;
        setAudioBlocked(false);
        setMicOn(false);
        setStatus('idle');
      });

      // Playback can be revoked later, not only refused at the start: a tab
      // going to the background is enough on some browsers.
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        setAudioBlocked(!room.canPlaybackAudio);
      });

      // autoSubscribe off, so the SFU hands this device nothing it was not
      // explicitly granted. LiveKit's default subscribes a joiner to every
      // published track, which would let somebody opening their mic during
      // NIGHT_MAFIA hear the mafia until the server's next pass pruned it.
      // The audio graph is the only thing that may decide who hears whom, and
      // the rule everywhere else applies here too: filter before the send.
      await room.connect(parsed.url ?? '', parsed.token ?? '', { autoSubscribe: false });

      // Playback only. No getUserMedia, so no permission prompt: joining the
      // room is not a thing a player should have to hand their microphone over
      // for. The gesture that got us here is spent unlocking remote audio,
      // which is the half everybody needs.
      await room.startAudio();
      setAudioBlocked(!room.canPlaybackAudio);
      setStatus('live');
    } catch (error) {
      // The room may have connected before something later threw. Leaving it
      // attached would leak a participant and make a retry the second one.
      const room = roomRef.current;
      roomRef.current = null;
      sinkRef.current?.remove();
      sinkRef.current = null;
      if (room !== null) await room.disconnect().catch(() => undefined);
      setReason(reasonFor(error));
      setStatus('failed');
    }
  }, [crewCode, playerToken, status]);

  /** Release the browser's hold on playback. Must be called from a gesture. */
  const enableAudio = useCallback(async (): Promise<void> => {
    const room = roomRef.current;
    if (room === null) return;
    await room.startAudio().catch(() => undefined);
    setAudioBlocked(!room.canPlaybackAudio);
  }, []);

  const disconnect = useCallback(async (): Promise<void> => {
    const room = roomRef.current;
    roomRef.current = null;
    sinkRef.current?.remove();
    sinkRef.current = null;
    if (room !== null) await room.disconnect();
    setReason(null);
    setMicOn(false);
    setMicReason(null);
    setStatus('idle');
  }, []);

  /**
   * Turn the microphone on or off. The first `true` is where the browser asks
   * for permission, which is the moment the player has actually asked to speak.
   * A refusal leaves them in the room and hearing everything.
   */
  const setMic = useCallback(async (on: boolean): Promise<boolean> => {
    const room = roomRef.current;
    if (room === null) return false;

    try {
      await room.localParticipant.setMicrophoneEnabled(on);
      setMicReason(null);
      setMicOn(on);
      return on;
    } catch (error) {
      setMicReason(reasonFor(error));
      setMicOn(false);
      return false;
    }
  }, []);

  return {
    status,
    reason,
    audioBlocked,
    micOn,
    micReason,
    connect,
    enableAudio,
    setMic,
    disconnect,
  };
}

export type { LocalAudioTrack };
