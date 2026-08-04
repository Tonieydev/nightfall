import { describe, expect, it } from 'vitest';
import { advanceGame, forceKill } from '../room-store/commands.js';
import { MIN_LOBBY_TO_START } from '../room-store/keys.js';
import { joinLobby, startSession } from '../room-store/lobby.js';
import { sessionIdFor, toSessionRecord } from './record.js';
import type { RoomDocument } from '../room-store/index.js';

const NOW = 1_700_000_000_000;
const ENDED = NOW + 40 * 60 * 1000;
const GM = 'p1';

function started(): RoomDocument {
  let doc: RoomDocument = {
    version: 1,
    crewCode: 'ABC234',
    createdAt: NOW,
    expiresAt: NOW + 90 * 60 * 1000,
    gmPlayerId: null,
    members: [],
    seed: null,
    voiceEnabled: true,
    reservedMinutes: 1080,
    game: null,
  };
  for (let i = 1; i <= MIN_LOBBY_TO_START; i += 1) {
    doc = joinLobby(doc, { playerId: `p${i}`, displayName: `Player ${i}`, now: NOW });
  }
  return startSession(doc, GM, { seed: 4242, now: NOW });
}

/** Kills every Mafia, which is a TOWN win, and lands the room on GAME_OVER. */
function finished(): RoomDocument {
  let doc = advanceGame(started(), GM, NOW);
  for (const mafia of doc.game?.players.filter((p) => p.role === 'MAFIA') ?? []) {
    doc = forceKill(doc, GM, mafia.id);
  }
  return doc;
}

describe('the durable record', () => {
  it('writes nothing for a game that never finished', () => {
    expect(toSessionRecord(started(), ENDED), 'still in LOBBY').toBeNull();
    expect(toSessionRecord(advanceGame(started(), GM, NOW), ENDED), 'mid-game').toBeNull();
  });

  it('writes nothing for a room that never started', () => {
    const lobby: RoomDocument = { ...started(), game: null, gmPlayerId: null, seed: null };

    expect(toSessionRecord(lobby, ENDED)).toBeNull();
  });

  it('records one session for a finished game', () => {
    const record = toSessionRecord(finished(), ENDED);

    expect(record).not.toBeNull();
    expect(record?.crewCode).toBe('ABC234');
    expect(record?.gmPlayerId).toBe(GM);
    expect(record?.winner).toBe('TOWN');
    expect(record?.seed).toBe(4242n);
    expect(record?.startedAt).toEqual(new Date(NOW));
    expect(record?.endedAt).toEqual(new Date(ENDED));
  });

  it('records one row per role-holder, and none for the GM', () => {
    const record = toSessionRecord(finished(), ENDED);

    // Six in the room, five with roles: the GM narrates.
    expect(record?.seatCount).toBe(6);
    expect(record?.players).toHaveLength(5);
    expect(record?.players.map((p) => p.playerId)).not.toContain(GM);
    expect(record?.members).toHaveLength(6);
  });

  it('marks the winning side, from the side that actually won', () => {
    const record = toSessionRecord(finished(), ENDED);
    const players = record?.players ?? [];

    for (const player of players) {
      const isTown = player.role !== 'MAFIA';
      expect(player.wasWinner, `${player.role} on a TOWN win`).toBe(isTown);
    }
    expect(players.filter((p) => p.wasWinner).length).toBeGreaterThan(0);
  });

  it('carries how each player left, including a GM override', () => {
    const record = toSessionRecord(finished(), ENDED);
    const killed = record?.players.filter((p) => !p.survived) ?? [];

    expect(killed.length).toBeGreaterThan(0);
    for (const player of killed) {
      expect(player.eliminatedBy, 'a GM override is not recorded as a lynch').toBe('GM');
      expect(player.eliminatedAtPhase).not.toBeNull();
    }
    expect(record?.players.filter((p) => p.survived).every((p) => p.eliminatedBy === null)).toBe(
      true,
    );
  });

  it('derives the same session id every time, so a retry cannot double-insert', () => {
    const doc = finished();

    expect(sessionIdFor(doc)).toBe(sessionIdFor(doc));
    expect(toSessionRecord(doc, ENDED)?.sessionId).toBe(sessionIdFor(doc));
    // A different night in the same crew is a different session.
    expect(sessionIdFor({ ...doc, createdAt: NOW + 1 })).not.toBe(sessionIdFor(doc));
  });
});
