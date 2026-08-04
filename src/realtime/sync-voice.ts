import { computeAudioGraph } from '../game-core/index.js';
import type { RoomDocument } from '../room-store/index.js';

export interface DurableSync {
  /** Resolves false when nothing was recorded. Never throws. */
  recordFinishedGame: (doc: RoomDocument, endedAt: number) => Promise<boolean>;
}

export interface VoiceSync {
  applyGraph: (roomCode: string, graph: ReturnType<typeof computeAudioGraph>, voiceEnabled: boolean) => Promise<void>;
  destroyRoom: (roomCode: string, voiceEnabled: boolean) => Promise<void>;
}

/**
 * Called after the state is written and the projection broadcast, so audio
 * follows the visual transition rather than leading it.
 *
 * game-core computes the graph; this hands it to the translation layer. No rule
 * about who hears whom is expressed here or in voice/.
 */
export async function syncRoomVoice(
  doc: RoomDocument,
  voice: VoiceSync | undefined,
  durable?: DurableSync,
): Promise<void> {
  if (doc.game === null) return;

  if (doc.game.phase === 'GAME_OVER') {
    // The durable write happens here and only here: once, at game end, off the
    // critical path. It cannot block the debrief, which renders from the state
    // already broadcast above.
    await durable?.recordFinishedGame(doc, Date.now());

    // The room is over: free the LiveKit room rather than let it bleed minutes
    // until the 90-minute kill catches it.
    await voice?.destroyRoom(doc.crewCode, doc.voiceEnabled);
    return;
  }

  await voice?.applyGraph(doc.crewCode, computeAudioGraph(doc.game), doc.voiceEnabled);
}
