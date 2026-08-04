import { forceKill, requireGm } from './commands.js';
import { NotAMemberError } from './lobby.js';
import type { LobbyMember, RoomDocument } from './types.js';

/**
 * How long the room waits before giving the console away. Long enough to cover
 * a tunnel or a locked phone, short enough that a dead battery does not end the
 * night — which is the whole reason handoff exists.
 */
export const GM_GRACE_MS = 60_000;

/** True once the GM has been gone longer than the room is willing to wait. */
export function isGmAbandoned(doc: RoomDocument, now: number): boolean {
  const since = doc.gmDisconnectedAt;
  if (since === null || since === undefined) return false;
  return now - since >= GM_GRACE_MS;
}

/**
 * Who should take the console, or null if nobody can.
 *
 * Players already out of the game come first, longest-connected among them. A
 * dead player is free: promoting them costs the game nothing, whereas promoting
 * someone still holding a secret role would hand them every other role too.
 */
export function successorToGm(doc: RoomDocument, now: number): LobbyMember | null {
  if (!isGmAbandoned(doc, now)) return null;

  const available = doc.members.filter(
    (m) => m.playerId !== doc.gmPlayerId && m.connected && m.connectedAt !== null,
  );
  if (available.length === 0) return null;

  const isOut = (m: LobbyMember): boolean =>
    doc.game?.players.find((p) => p.id === m.playerId)?.alive === false;

  // Longest-connected first, and among equals the one who has been out of the
  // game longest — both comparisons are on stamps, so this is deterministic.
  const ranked = [...available].sort((a, b) => {
    if (isOut(a) !== isOut(b)) return isOut(a) ? -1 : 1;
    return (a.connectedAt ?? 0) - (b.connectedAt ?? 0);
  });

  return ranked[0] ?? null;
}

/**
 * A reassignment of `gmPlayerId` and nothing else — the console is a projection
 * of who the GM is, so moving the role moves the screen. No game logic is
 * involved, which is the section-1 architecture paying for itself.
 */
export function handOffGm(
  doc: RoomDocument,
  actorId: string,
  targetId: string,
  now: number,
): RoomDocument {
  requireGm(doc, actorId);

  const target = doc.members.find((m) => m.playerId === targetId);
  if (target === undefined) throw new NotAMemberError(targetId);

  return withGm(doc, targetId, now);
}

/**
 * The automatic path: the GM's phone died and the grace period has run out.
 * Returns null when there is nothing to do, so a caller can run this on every
 * read without checking first.
 *
 * A living successor is eliminated before being promoted. The GM does not play,
 * and someone who could see every role while still holding one of their own
 * would be a cheat the server handed out. Elimination goes through the existing
 * game-core path with Cause 'GM', so the win condition re-checks itself.
 */
export function reclaimGm(doc: RoomDocument, now: number): RoomDocument | null {
  const heir = successorToGm(doc, now);
  if (heir === null) return null;

  const stillPlaying =
    doc.game?.players.find((p) => p.id === heir.playerId)?.alive === true;

  const departed = stillPlaying
    ? forceKill(doc, doc.gmPlayerId ?? heir.playerId, heir.playerId)
    : doc;

  return withGm(departed, heir.playerId, now);
}

function withGm(doc: RoomDocument, gmPlayerId: string, now: number): RoomDocument {
  return {
    ...doc,
    gmPlayerId,
    // The name has to move in the game state too: projectState and
    // computeAudioGraph both read GameState.gmPlayerId to decide who sees every
    // role and who is audible in every phase. This is a field reassignment, not
    // a rule — no game logic moves with it, which is why it does not belong in
    // game-core.
    game: doc.game === null ? null : { ...doc.game, gmPlayerId },
    // The new GM is present by definition, so the clock stops.
    gmDisconnectedAt: null,
    members: doc.members.map((m) =>
      m.playerId === gmPlayerId ? { ...m, connected: true, connectedAt: m.connectedAt ?? now } : m,
    ),
  };
}
