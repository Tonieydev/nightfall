import type { VoiceStatus } from './useVoice';
import type { RoomView } from '@/room-store';

export type MicState =
  /** Voice has not been opened on this device. One tap does it. */
  | { kind: 'offer'; connecting: boolean }
  /** In the room, but the browser is refusing to play what it receives. */
  | { kind: 'deaf' }
  /** Live, and the server is routing this player to somebody. */
  | { kind: 'heard'; count: number }
  /** Live, and routed to nobody. Correct during the night, not a fault. */
  | { kind: 'silenced' }
  /** In the room and hearing it, but this device's microphone was refused. */
  | { kind: 'listening'; reason: string | null }
  /** The crew is playing without live audio this month. */
  | { kind: 'budget' }
  /** This device could not join at all. Everyone else may be fine. */
  | { kind: 'failed'; reason: string | null };

export interface MicInputs {
  view: RoomView;
  status: VoiceStatus;
  /** Why voice is not working, when it is not. */
  reason: string | null;
  /** The browser is refusing to play remote audio until a gesture allows it. */
  audioBlocked: boolean;
}

/**
 * What to tell this player about their microphone.
 *
 * Order matters. Blocked playback comes before anything about being heard,
 * because it is the fault a player cannot guess at: the microphone works, the
 * indicators all look healthy, and they hear silence. Every browser can refuse
 * to play remote audio until a gesture allows it, and refusing quietly is the
 * normal behaviour, not the exception.
 *
 * The count comes from the server's audio graph, which describes who WOULD
 * receive them. That is only a true answer once this device is actually
 * connected, and conflating the two is how a player ends up reading "Heard by
 * 6" with their microphone closed.
 */
export function micState({ view, status, reason, audioBlocked }: MicInputs): MicState {
  if (!view.voiceEnabled || status === 'unavailable') return { kind: 'budget' };
  if (status === 'failed') return { kind: 'failed', reason };
  if (status === 'idle' || status === 'connecting') {
    return { kind: 'offer', connecting: status === 'connecting' };
  }

  // In the room from here on, so there is something to play.
  if (audioBlocked) return { kind: 'deaf' };
  if (status === 'listening') return { kind: 'listening', reason };

  const count = view.audio?.speaksTo.length ?? 0;
  return count > 0 ? { kind: 'heard', count } : { kind: 'silenced' };
}
