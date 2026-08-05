import type { AudioCaptureOptions, TrackPublishDefaults } from 'livekit-client';

/**
 * Voice isolation, asked for the only way it is safe to ask.
 *
 * Chromium 126+ and recent Safari expose OS-level ML voice isolation through
 * this constraint — the same processing a phone uses on a call, which lifts a
 * voice out of fan noise, traffic and a room full of other people far better
 * than the WebRTC noise suppressor alone.
 *
 * `ideal`, never `exact`. A required constraint fails getUserMedia outright on
 * a device that does not have it, and the player joins to silence — the exact
 * failure mode the whole voice path is built to avoid. Where it is missing the
 * browser simply ignores it and the standard cleanup below still applies.
 */
export function isolationConstraint(): { ideal: true } {
  return { ideal: true };
}

/**
 * Every cleanup the browser gives away, all of it on. The spec's "noise
 * suppression light" is about not gating the microphone — none of these close
 * it or delay an interruption; they clean the signal that is already flowing.
 */
export const CAPTURE_DEFAULTS: AudioCaptureOptions = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  // A voice is one channel. Stereo would double the uplink for nothing.
  channelCount: 1,
  // Not in the published typings on every version, but passed through to
  // getUserMedia, which is what actually reads it.
  ...({ voiceIsolation: isolationConstraint() } as Record<string, unknown>),
};

export const PUBLISH_DEFAULTS: TrackPublishDefaults = {
  /**
   * On. DTX is transmission-level and not VAD gating — the microphone stays
   * open and an interruption is never blocked, so spec section 2 holds. What it
   * stops is paying for uplink while nobody is talking, and on a congested
   * mobile link that headroom is what keeps the people who ARE talking audible.
   */
  dtx: true,
  /** Redundant encoding: the next packet carries a copy of the last one. */
  red: true,
  audioPreset: { maxBitrate: 32_000 },
};

/**
 * A game night happens on the move: a lift, a tunnel, a walk between rooms.
 * The seat is held server-side for the whole session, so the client's job is
 * simply to keep trying long enough to come back to it.
 */
export const RECONNECT = {
  maxRetries: 12,
  maxDelayMs: 8_000,
  /** Immediate first, then backing off — most drops are momentary, and
   *  hammering a network that is already struggling only makes it worse. */
  delayFor(attempt: number): number {
    return Math.min(300 * 2 ** attempt, 8_000);
  },
} as const;
