import type { VoiceStatus } from './useVoice';
import type { RoomView } from '@/room-store';

export type MicState =
  /** Not in the voice room yet. One tap joins, and asks for no microphone. */
  | { kind: 'offer'; connecting: boolean }
  /** In the room, but the browser is refusing to play what it receives. */
  | { kind: 'deaf' }
  /** In the room and hearing it, saying nothing. The ordinary way to be here. */
  | { kind: 'muted'; reason: string | null }
  /** Mic on, and the server is routing this player to somebody. */
  | { kind: 'heard'; count: number }
  /** Mic on, routed to nobody. Correct during the night, not a fault. */
  | { kind: 'silenced' }
  /** The crew is playing without live audio this month. */
  | { kind: 'budget' }
  /** This device could not join at all. Everyone else may be fine. */
  | { kind: 'failed'; reason: string | null };

export interface MicInputs {
  view: RoomView;
  status: VoiceStatus;
  /** Why the room could not be joined, when it could not. */
  reason: string | null;
  /** The browser is refusing to play remote audio until a gesture allows it. */
  audioBlocked: boolean;
  /** Whether this device is publishing. Off is a normal state, not a failure. */
  micOn: boolean;
  /** Why the microphone is off, when it was refused rather than chosen. */
  micReason: string | null;
}

/**
 * What to tell this player about their voice.
 *
 * Hearing and speaking are separate permissions and used to be asked for as
 * one: joining took the microphone with it, so anyone who refused heard nothing
 * at all. Joining now asks for nothing, and the microphone is its own decision.
 *
 * Order matters. Blocked playback comes before anything about being heard,
 * because it is the fault a player cannot guess at: everything looks healthy
 * and they hear silence. Channels are only mentioned once the mic is actually
 * on, since "Heard by 2" from a device publishing nothing is a lie.
 */
export function micState({
  view,
  status,
  reason,
  audioBlocked,
  micOn,
  micReason,
}: MicInputs): MicState {
  if (!view.voiceEnabled || status === 'unavailable') return { kind: 'budget' };
  if (status === 'failed') return { kind: 'failed', reason };
  if (status === 'idle' || status === 'connecting') {
    return { kind: 'offer', connecting: status === 'connecting' };
  }

  // In the room from here on, so there is something to play and someone to hear.
  if (audioBlocked) return { kind: 'deaf' };
  if (!micOn) return { kind: 'muted', reason: micReason };

  const count = view.audio?.speaksTo.length ?? 0;
  return count > 0 ? { kind: 'heard', count } : { kind: 'silenced' };
}
