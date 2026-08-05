import type { VoiceStatus } from './useVoice';
import type { RoomView } from '@/room-store';

export type MicState =
  /** Voice has not been opened on this device. One tap does it. */
  | { kind: 'offer'; connecting: boolean }
  /** Live, and the server is routing this player to somebody. */
  | { kind: 'heard'; count: number }
  /** Live, and routed to nobody. Correct during the night, not a fault. */
  | { kind: 'silenced' }
  /** The crew is playing without live audio this month. */
  | { kind: 'budget' }
  /** This device could not connect. Everyone else may be fine. */
  | { kind: 'failed' };

/**
 * What to tell this player about their microphone.
 *
 * The count comes from the server's audio graph, which describes who WOULD
 * receive them. That is only a true answer once this device is actually
 * connected, and conflating the two is how a player ends up reading "Heard by
 * 6" with their microphone closed: 'unavailable' used to fall through to the
 * same branch as 'live', and a confident wrong answer stops somebody
 * troubleshooting a mic that is genuinely off.
 */
export function micState(view: RoomView, status: VoiceStatus): MicState {
  if (!view.voiceEnabled || status === 'unavailable') return { kind: 'budget' };
  if (status === 'failed') return { kind: 'failed' };
  if (status === 'idle' || status === 'connecting') {
    return { kind: 'offer', connecting: status === 'connecting' };
  }

  const count = view.audio?.speaksTo.length ?? 0;
  return count > 0 ? { kind: 'heard', count } : { kind: 'silenced' };
}
