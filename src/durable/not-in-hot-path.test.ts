import { describe, expect, it, vi } from 'vitest';
import { advanceGame, forceKill } from '../room-store/commands.js';
import { MIN_LOBBY_TO_START } from '../room-store/keys.js';
import { joinLobby, startSession } from '../room-store/lobby.js';
import { projectRoom } from '../room-store/project-room.js';
import { syncRoomVoice } from '../realtime/sync-voice.js';
import { recordFinishedGame } from './index.js';
import type { DurableClient } from './write-session.js';
import type { RoomDocument } from '../room-store/index.js';

const NOW = 1_700_000_000_000;
const GM = 'p1';

function finished(): RoomDocument {
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
  doc = advanceGame(startSession(doc, GM, { seed: 4242, now: NOW }), GM, NOW);
  for (const mafia of doc.game?.players.filter((p) => p.role === 'MAFIA') ?? []) {
    doc = forceKill(doc, GM, mafia.id);
  }
  return doc;
}

const noop = () => ({});
const exploding: DurableClient = {
  $transaction: () => Promise.reject(new Error('neon is down')),
  player: { createMany: noop },
  crew: { upsert: noop },
  session: { upsert: noop },
};

describe('Postgres is never in the hot path', () => {
  it('swallows a failed write rather than throwing at the room', async () => {
    const doc = finished();

    await expect(recordFinishedGame(doc, NOW, exploding)).resolves.toBe(false);
  });

  it('still renders the whole debrief when the write is down', async () => {
    const doc = finished();
    await recordFinishedGame(doc, NOW, exploding);

    // The debrief reads the final state, which is Redis — untouched by Postgres.
    for (const member of doc.members) {
      const view = projectRoom(doc, member.playerId);

      expect(view.game?.winner, member.playerId).toBe('TOWN');
      expect(view.game?.phase, member.playerId).toBe('GAME_OVER');
      expect(view.game?.players.every((p) => p.role !== null), member.playerId).toBe(true);
    }
  });

  it('does not let a failed write break the phase-change path', async () => {
    const durable = { recordFinishedGame: () => Promise.resolve(false) };
    const voice = {
      applyGraph: vi.fn(() => Promise.resolve()),
      destroyRoom: vi.fn(() => Promise.resolve()),
    };

    await expect(syncRoomVoice(finished(), voice, durable)).resolves.toBeUndefined();
    // The LiveKit room is still freed even though nothing was recorded.
    expect(voice.destroyRoom).toHaveBeenCalledOnce();
  });

  it('records once at GAME_OVER and at no other phase', async () => {
    const durable = { recordFinishedGame: vi.fn(() => Promise.resolve(true)) };
    const voice = {
      applyGraph: vi.fn(() => Promise.resolve()),
      destroyRoom: vi.fn(() => Promise.resolve()),
    };

    let doc: RoomDocument = {
      ...finished(),
      game: { ...finished().game!, phase: 'DAY', winner: null },
    };
    await syncRoomVoice(doc, voice, durable);
    expect(durable.recordFinishedGame, 'mid-game').not.toHaveBeenCalled();

    doc = finished();
    await syncRoomVoice(doc, voice, durable);
    expect(durable.recordFinishedGame).toHaveBeenCalledOnce();
  });
});
