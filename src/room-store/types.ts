import type { GameState } from '../game-core/index.js';

export interface LobbyMember {
  playerId: string;
  displayName: string;
  connected: boolean;
  joinedAt: number;
}

/**
 * One JSON document per room. `game` is null for the whole of the lobby: a
 * GameState cannot exist before Start because every Player carries a Role, and
 * in the lobby nobody has one. Start is the moment it becomes non-null.
 */
export interface RoomDocument {
  version: number;
  crewCode: string;
  createdAt: number;
  /** 90-minute hard lifetime, enforced server-side as well as by the Redis TTL. */
  expiresAt: number;
  gmPlayerId: string | null;
  members: LobbyMember[];
  /** Persisted so a finished game can be replayed for dispute resolution. */
  seed: number | null;
  /**
   * False when the month's participant-minute budget could not fund this room.
   * The game is fully playable without voice — every decision is a tap — so a
   * spent budget degrades the night rather than closing the pinned crew link.
   */
  voiceEnabled: boolean;
  /** Minutes held for this room, and the figure close() hands back. Zero when voiceless. */
  reservedMinutes: number;
  game: GameState | null;
  /** One level of undo for the GM's REVERT_PHASE. Snapshot, never recomputed. */
  previousGame?: GameState | null;
}
