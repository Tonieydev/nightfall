import type { AudioGraph } from '../game-core/index.js';
import type { VoiceRoomService } from './room-service.js';

/**
 * Translates game-core's audio graph into LiveKit subscriptions. There is no
 * audio rule in this file: it reads who-hears-whom out of the graph and issues
 * the calls. If a phase sounds wrong, computeAudioGraph is what to look at.
 *
 * The graph is speaker -> listeners; LiveKit subscribes listener -> tracks. The
 * inversion below is the whole of the translation.
 */
export async function applyAudioGraph(
  service: VoiceRoomService,
  roomCode: string,
  graph: AudioGraph,
): Promise<void> {
  const participants = await service.listParticipants(roomCode);
  const present = new Set(participants.map((p) => p.identity));

  // Every track in the room, by the identity publishing it.
  const tracksOf = new Map<string, string[]>(
    participants.map((p) => [p.identity, p.tracks.map((t) => t.sid)]),
  );

  for (const listener of participants) {
    const allowed: string[] = [];
    for (const [speaker, listeners] of graph) {
      // A graph node who has not joined the room yet has nothing to subscribe
      // to; they get their edges when they connect and the graph is reapplied.
      if (!present.has(speaker) || speaker === listener.identity) continue;
      if (listeners.has(listener.identity)) allowed.push(...(tracksOf.get(speaker) ?? []));
    }

    const forbidden: string[] = [];
    for (const [speaker, sids] of tracksOf) {
      if (speaker === listener.identity) continue;
      for (const sid of sids) if (!allowed.includes(sid)) forbidden.push(sid);
    }

    // Stated in full every time rather than diffed against current state, so a
    // reconnect or a redeploy converges on the same answer.
    if (allowed.length > 0) {
      await service.updateSubscriptions(roomCode, listener.identity, allowed, true);
    }
    if (forbidden.length > 0) {
      await service.updateSubscriptions(roomCode, listener.identity, forbidden, false);
    }
  }
}
