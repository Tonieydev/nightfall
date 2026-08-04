import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { loadServerConfig } from '../config.js';
import { applyAudioGraph } from './apply-audio-graph.js';
import type { AudioGraph } from '../game-core/index.js';
import type { VoiceRoomService } from './room-service.js';

export { applyAudioGraph } from './apply-audio-graph.js';
export { issueVoiceToken } from './authorize.js';
export type { VoiceTokenDeps, VoiceTokenResult } from './authorize.js';
export type { VoiceParticipant, VoiceRoomService } from './room-service.js';

/** Shorter than the 90-minute room, so a leaked token dies before the game does. */
const TOKEN_TTL = '2h';

let client: RoomServiceClient | null = null;

function roomService(): VoiceRoomService {
  if (client === null) {
    const config = loadServerConfig();
    client = new RoomServiceClient(
      config.livekitUrl,
      config.livekitApiKey,
      config.livekitApiSecret,
    );
  }
  return client as unknown as VoiceRoomService;
}

/**
 * The API secret never leaves the server. Participant identity is the playerId,
 * which is why the audio graph's ids map onto LiveKit identities with no
 * translation table in between.
 */
export async function mintToken(roomCode: string, playerId: string): Promise<string> {
  const config = loadServerConfig();
  const token = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
    identity: playerId,
    ttl: TOKEN_TTL,
  });

  // Both grants are given at join; who actually hears whom is enforced by
  // updating subscriptions per phase, not by withholding the join grant.
  token.addGrant({
    roomJoin: true,
    room: roomCode,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
  });

  return await token.toJwt();
}

/**
 * Called after every phase change, once the state is written and broadcast.
 * A voiceless room has no LiveKit room behind it, so there is nothing to
 * subscribe and this does nothing.
 */
export async function applyGraphToRoom(
  roomCode: string,
  graph: AudioGraph,
  voiceEnabled: boolean,
  service: VoiceRoomService = roomService(),
): Promise<void> {
  if (!voiceEnabled) return;
  await applyAudioGraph(service, roomCode, graph);
}

/**
 * Participant-minutes accrue for as long as the room exists, so the 90-minute
 * kill has to reach LiveKit and not just Redis — a leaked room bleeds budget.
 */
export async function destroyRoom(
  roomCode: string,
  voiceEnabled: boolean,
  service: VoiceRoomService = roomService(),
): Promise<void> {
  if (!voiceEnabled) return;
  await service.deleteRoom(roomCode);
}
