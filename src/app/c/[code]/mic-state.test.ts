import { describe, expect, it } from 'vitest';
import { micState } from './mic-state.js';
import type { VoiceStatus } from './useVoice';
import type { RoomView } from '@/room-store';

const view = (speaksTo: string[], voiceEnabled = true): RoomView =>
  ({ voiceEnabled, audio: { speaksTo, hears: [] } }) as unknown as RoomView;

/**
 * This row is the only answer a player gets to "can anybody hear me". It has to
 * be right or it is worse than absent: a confident wrong answer stops them
 * troubleshooting a microphone that is genuinely off.
 */
describe('the mic row', () => {
  it('offers the tap when voice has not been opened', () => {
    expect(micState(view([]), 'idle').kind).toBe('offer');
    expect(micState(view([]), 'connecting').kind).toBe('offer');
  });

  it('reports being heard once voice is live', () => {
    const state = micState(view(['a', 'b', 'c']), 'live');

    expect(state).toEqual({ kind: 'heard', count: 3 });
  });

  it('says so when live but nobody is receiving', () => {
    // Correct and important: at NIGHT_DOCTOR almost everybody is silenced, and
    // that is the game working, not a fault.
    const state = micState(view([]), 'live');

    expect(state.kind).toBe('silenced');
  });

  it('never claims to be heard when voice never connected', () => {
    // The bug this exists to stop. 'unavailable' used to fall through to the
    // same branch as 'live', so a player whose voice never opened was told
    // "Heard by 6" off the server's audio graph, which describes what WOULD
    // happen if they were connected. They had no reason to suspect their mic.
    for (const status of ['unavailable', 'failed'] as VoiceStatus[]) {
      const state = micState(view(['a', 'b', 'c', 'd', 'e', 'f']), status);

      expect(state.kind, status).not.toBe('heard');
      expect(state.kind, status).not.toBe('silenced');
    }
  });

  it('keeps a device in the room when only its microphone was refused', () => {
    // Losing the mic and losing the room are different failures. Somebody whose
    // microphone is blocked can still hear every word, and dropping them out of
    // the call for it takes away the half that still worked.
    const state = micState(view(['a', 'b']), 'listening');

    expect(state.kind).toBe('listening');
  });

  it('carries the reason a connection failed, so it can be read', () => {
    expect(micState(view([]), 'failed', 'Permission denied')).toEqual({
      kind: 'failed',
      reason: 'Permission denied',
    });
  });

  it('separates a room with voice switched off from a device that failed', () => {
    // One is the whole crew playing silently on purpose; the other is this
    // phone. Telling a player the wrong one sends them to fix the wrong thing.
    expect(micState(view([], false), 'idle').kind).toBe('budget');
    expect(micState(view([]), 'unavailable').kind).toBe('budget');
    expect(micState(view([]), 'failed').kind).toBe('failed');
  });
});
