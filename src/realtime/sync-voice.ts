import { computeAudioGraph } from '../game-core/index.js';
import type { RoomDocument } from '../room-store/index.js';

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
export async function syncRoomVoice(doc: RoomDocument, voice: VoiceSync | undefined): Promise<void> {
  if (voice === undefined) return;
  if (doc.game === null) return;

  // The room is over: free the LiveKit room rather than let it bleed minutes
  // until the 90-minute kill catches it.
  if (doc.game.phase === 'GAME_OVER') {
    await voice.destroyRoom(doc.crewCode, doc.voiceEnabled);
    return;
  }

  await voice.applyGraph(doc.crewCode, computeAudioGraph(doc.game), doc.voiceEnabled);
}
