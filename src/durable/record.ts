import type { RoomDocument } from '../room-store/index.js';

export interface SessionPlayerRow {
  playerId: string;
  role: string;
  survived: boolean;
  eliminatedAtPhase: number | null;
  eliminatedBy: string | null;
  wasWinner: boolean;
}

export interface SessionRecord {
  sessionId: string;
  crewCode: string;
  gmPlayerId: string;
  seed: bigint;
  startedAt: Date;
  endedAt: Date;
  seatCount: number;
  winner: string | null;
  config: unknown;
  members: { playerId: string; displayName: string }[];
  players: SessionPlayerRow[];
}

/**
 * Deterministic, so a retry or a double-advance upserts the same row rather
 * than inserting a second record of one game.
 */
export function sessionIdFor(doc: RoomDocument): string {
  return `${doc.crewCode}:${String(doc.createdAt)}`;
}

/**
 * Turns a finished room into the rows that outlive it. Pure: no client, no
 * clock, no I/O — so the shape of the record is testable without a database.
 *
 * Returns null for any room that did not finish. An abandoned game is not a
 * record, and writing a partial one would corrupt every stat derived from it.
 */
export function toSessionRecord(doc: RoomDocument, endedAt: number): SessionRecord | null {
  const game = doc.game;
  if (game === null || game.phase !== 'GAME_OVER') return null;
  if (doc.gmPlayerId === null || doc.seed === null) return null;

  return {
    sessionId: sessionIdFor(doc),
    crewCode: doc.crewCode,
    gmPlayerId: doc.gmPlayerId,
    seed: BigInt(doc.seed),
    startedAt: new Date(doc.createdAt),
    endedAt: new Date(endedAt),
    // Everyone in the room, GM included — what the night actually cost.
    seatCount: doc.members.length,
    winner: game.winner,
    config: game.config,
    members: doc.members.map((m) => ({ playerId: m.playerId, displayName: m.displayName })),
    // Role-holders only. The GM narrated and drew no card, so they have no row.
    players: game.players.map((p) => ({
      playerId: p.id,
      role: p.role,
      survived: p.alive,
      eliminatedAtPhase: p.eliminatedAtPhase,
      eliminatedBy: p.eliminatedBy,
      wasWinner: game.winner !== null && teamOf(p.role) === game.winner,
    })),
  };
}

function teamOf(role: string): string {
  return role === 'MAFIA' ? 'MAFIA' : 'TOWN';
}
