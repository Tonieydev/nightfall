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
 * "That room is not there" is an answer, not a failure. LiveKit rooms exist
 * only while somebody is in them, so a lobby nobody has opened a microphone in
 * has no room behind it, and a finished one may already be gone.
 */
function isMissingRoom(error: unknown): boolean {
  const status = (error as { status?: unknown }).status;
  const code = (error as { code?: unknown }).code;
  return status === 404 || code === 'not_found';
}

/**
 * Voice is a projection of the game and never a dependency of it, so nothing in
 * here may throw into the caller.
 *
 * It used to. destroyRoom ran at GAME_OVER inside broadcastRoom, called from a
 * socket disconnect handler whose try/catch covered only the Redis write, so a
 * 404 from LiveKit escaped as an unhandled rejection and took the process down
 * with it. Every socket in every room dropped, and the room that had merely
 * finished took the ones still playing with it.
 *
 * The durable write already follows this rule. Voice is the same shape of
 * dependency and gets the same treatment.
 */
async function tolerate(what: string, operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (isMissingRoom(error)) return;
    console.warn(`voice ${what} failed:`, error instanceof Error ? error.message : error);
  }
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
  // Logged because who can hear whom is otherwise invisible from outside a
  // browser: a room where nobody was ever subscribed looks exactly like a
  // working one from the server, and looked exactly like one for a whole game.
  await tolerate(`applyGraph ${roomCode}`, () =>
    applyAudioGraph(service, roomCode, graph, (line) => {
      console.log(line);
    }),
  );
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
  await tolerate(`destroyRoom ${roomCode}`, () => service.deleteRoom(roomCode));
}
