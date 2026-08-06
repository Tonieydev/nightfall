import { describe, expect, it } from 'vitest';
import { micState } from './mic-state.js';
import type { VoiceStatus } from './useVoice';
import type { RoomView } from '@/room-store';

const view = (speaksTo: string[], voiceEnabled = true): RoomView =>
  ({ voiceEnabled, audio: { speaksTo, hears: [] } }) as unknown as RoomView;

const at = (
  speaksTo: string[],
  status: VoiceStatus,
  extra: {
    reason?: string | null;
    audioBlocked?: boolean;
    micOn?: boolean;
    micReason?: string | null;
    voiceEnabled?: boolean;
  } = {},
) =>
  micState({
    view: view(speaksTo, extra.voiceEnabled ?? true),
    status,
    reason: extra.reason ?? null,
    audioBlocked: extra.audioBlocked ?? false,
    micOn: extra.micOn ?? false,
    micReason: extra.micReason ?? null,
  });

/**
 * Hearing and speaking are two different permissions and were being asked for
 * as one. A player who only wanted to listen had to hand over their microphone
 * first, and anyone who refused heard nothing at all.
 */
describe('joining the room does not require a microphone', () => {
  it('offers to join before anything is connected', () => {
    expect(at([], 'idle').kind).toBe('offer');
    expect(at([], 'connecting').kind).toBe('offer');
  });

  it('reports a joined player with their mic off as muted, not broken', () => {
    // The normal way to be in the room: hearing everything, saying nothing.
    const state = at(['a', 'b'], 'live', { micOn: false });

    expect(state.kind).toBe('muted');
  });

  it('only talks about channels once the mic is actually on', () => {
    expect(at(['a', 'b'], 'live', { micOn: true })).toEqual({ kind: 'heard', count: 2 });
  });

  it('says so when the mic is on and routed to nobody', () => {
    // Correct at night, and not a fault.
    expect(at([], 'live', { micOn: true }).kind).toBe('silenced');
  });

  it('carries why a microphone was refused without dropping the room', () => {
    const state = at(['a'], 'live', { micOn: false, micReason: 'Permission denied' });

    expect(state).toEqual({ kind: 'muted', reason: 'Permission denied' });
  });

  it('leads with blocked playback, because it is why they cannot hear', () => {
    expect(at(['a'], 'live', { audioBlocked: true, micOn: true }).kind).toBe('deaf');
    expect(at(['a'], 'live', { audioBlocked: true, micOn: false }).kind).toBe('deaf');
  });

  it('ignores blocked playback on a device that never joined', () => {
    expect(at([], 'idle', { audioBlocked: true }).kind).toBe('offer');
    expect(at([], 'failed', { audioBlocked: true }).kind).toBe('failed');
  });

  it('never claims to be heard when the room was never joined', () => {
    for (const status of ['unavailable', 'failed'] as VoiceStatus[]) {
      const state = at(['a', 'b', 'c'], status, { micOn: true });

      expect(state.kind, status).not.toBe('heard');
      expect(state.kind, status).not.toBe('silenced');
    }
  });

  it('separates a room with voice switched off from a device that failed', () => {
    expect(at([], 'idle', { voiceEnabled: false }).kind).toBe('budget');
    expect(at([], 'unavailable').kind).toBe('budget');
    expect(at([], 'failed', { reason: 'nope' })).toEqual({ kind: 'failed', reason: 'nope' });
  });
});
