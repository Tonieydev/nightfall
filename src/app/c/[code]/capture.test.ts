import { describe, expect, it } from 'vitest';
import { CAPTURE_DEFAULTS, PUBLISH_DEFAULTS, RECONNECT, isolationConstraint } from './capture';

describe('what the microphone is asked for', () => {
  it('turns on every cleanup the browser offers for free', () => {
    expect(CAPTURE_DEFAULTS.echoCancellation).toBe(true);
    expect(CAPTURE_DEFAULTS.noiseSuppression).toBe(true);
    expect(CAPTURE_DEFAULTS.autoGainControl).toBe(true);
  });

  it('captures one channel, because a voice is one channel', () => {
    // Stereo doubles the uplink for a mono source. On a congested mobile link
    // that is bandwidth spent on nothing.
    expect(CAPTURE_DEFAULTS.channelCount).toBe(1);
  });

  it('asks for voice isolation as an optional constraint, never a required one', () => {
    const constraint = isolationConstraint();

    // `ideal`, not `exact`: a device without OS-level isolation must still get
    // a microphone. A required constraint would fail getUserMedia outright and
    // the player would join to silence — the exact failure iOS already courts.
    expect(constraint).toEqual({ ideal: true });
    expect(JSON.stringify(constraint)).not.toContain('exact');
  });
});

describe('what gets published', () => {
  it('sends nothing while nobody is speaking', () => {
    // DTX is transmission-level, not VAD gating: the mic is never closed and an
    // interruption is never blocked, so spec section 2 still holds. What it
    // saves is constant uplink during silence, which on a weak connection is
    // the difference between clean audio and loss for the whole room.
    expect(PUBLISH_DEFAULTS.dtx).toBe(true);
  });

  it('keeps redundant encoding on for lossy links', () => {
    // RED carries a copy of the previous packet in the next one. It costs
    // bandwidth and buys back dropped syllables — the right trade on a network
    // that drops packets rather than one that is merely slow.
    expect(PUBLISH_DEFAULTS.red).toBe(true);
  });

  it('stays inside a bitrate a bad connection can carry', () => {
    const max = PUBLISH_DEFAULTS.audioPreset?.maxBitrate ?? 0;

    // Opus is transparent for speech well below this. Spending more would buy
    // inaudible quality and cost the players who can least afford it.
    expect(max).toBeGreaterThanOrEqual(24_000);
    expect(max).toBeLessThanOrEqual(40_000);
  });
});

describe('coming back from a bad network', () => {
  it('keeps trying long enough to survive a tunnel or a lift', () => {
    const total = RECONNECT.maxRetries * (RECONNECT.maxDelayMs / 1000);

    expect(RECONNECT.maxRetries).toBeGreaterThanOrEqual(10);
    // Long enough to outlast a genuine dropout, and bounded so a dead room
    // does not hold a socket open for the rest of the session.
    expect(total).toBeGreaterThanOrEqual(60);
  });

  it('backs off instead of hammering a network that is already struggling', () => {
    const first = RECONNECT.delayFor(0);
    const later = RECONNECT.delayFor(5);

    expect(first).toBeLessThan(later);
    expect(later).toBeLessThanOrEqual(RECONNECT.maxDelayMs);
  });

  it('retries immediately the first time, because most drops are momentary', () => {
    expect(RECONNECT.delayFor(0)).toBeLessThanOrEqual(1000);
  });
});
