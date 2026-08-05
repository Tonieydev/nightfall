import { describe, expect, it, vi } from 'vitest';
import { computeAudioGraph, computeLobbyGraph } from '../game-core/index.js';
import { MIN_LOBBY_TO_START } from '../room-store/keys.js';
import { joinLobby, startSession } from '../room-store/lobby.js';
import { advanceGame } from '../room-store/commands.js';
import { syncRoomVoice, type VoiceSync } from './sync-voice.js';
import type { RoomDocument } from '../room-store/index.js';

const NOW = 1_700_000_000_000;
const GM = 'p1';

function lobby(voiceEnabled = true): RoomDocument {
  let doc: RoomDocument = {
    version: 1,
    crewCode: 'ABC234',
    createdAt: NOW,
    expiresAt: NOW + 90 * 60 * 1000,
    gmPlayerId: null,
    members: [],
    seed: null,
    voiceEnabled,
    reservedMinutes: voiceEnabled ? 1080 : 0,
    game: null,
  };
  for (let i = 1; i <= MIN_LOBBY_TO_START; i += 1) {
    doc = joinLobby(doc, { playerId: `p${i}`, displayName: `Player ${i}`, now: NOW });
  }
  return doc;
}

const started = (voiceEnabled = true): RoomDocument =>
  startSession(lobby(voiceEnabled), GM, { seed: 4242, now: NOW });

function spy(): VoiceSync & { applyGraph: ReturnType<typeof vi.fn>; destroyRoom: ReturnType<typeof vi.fn> } {
  return {
    applyGraph: vi.fn(() => Promise.resolve()),
    destroyRoom: vi.fn(() => Promise.resolve()),
  };
}

describe('voice follows the phase', () => {
  it('applies the graph game-core computed for the current phase', async () => {
    const doc = advanceGame(started(), GM, NOW);
    const voice = spy();

    await syncRoomVoice(doc, voice);

    expect(voice.applyGraph).toHaveBeenCalledOnce();
    const [room, graph, enabled] = voice.applyGraph.mock.calls[0] ?? [];
    expect(room).toBe('ABC234');
    expect(enabled).toBe(true);
    // The exact graph, not a rebuilt approximation of it.
    expect(graph).toEqual(computeAudioGraph(doc.game!));
  });

  it('passes voiceEnabled through so an unfunded room stays silent', async () => {
    const voice = spy();

    await syncRoomVoice(advanceGame(started(false), GM, NOW), voice);

    expect(voice.applyGraph.mock.calls[0]?.[2]).toBe(false);
  });

  it('opens the lobby to everyone in it, before a game exists', async () => {
    // This used to do nothing, and the lobby was audible only because LiveKit
    // subscribes a joiner to every track by default. That default is off now,
    // so silence is what "nothing" would mean: people gather, turn on their
    // microphones and hear no one until somebody presses Start.
    const doc = lobby();
    const voice = spy();

    await syncRoomVoice(doc, voice);

    expect(voice.applyGraph).toHaveBeenCalledWith(
      doc.crewCode,
      computeLobbyGraph(doc.members.map((m) => m.playerId)),
      true,
    );
    expect(voice.destroyRoom).not.toHaveBeenCalled();
  });

  it('leaves a voiceless lobby voiceless', async () => {
    const voice = spy();

    await syncRoomVoice(lobby(false), voice);

    expect(voice.applyGraph).toHaveBeenCalledWith(expect.anything(), expect.anything(), false);
  });

  it('frees the LiveKit room at GAME_OVER instead of reapplying a graph', async () => {
    const doc = started();
    const over: RoomDocument = { ...doc, game: { ...doc.game!, phase: 'GAME_OVER' } };
    const voice = spy();

    await syncRoomVoice(over, voice);

    expect(voice.destroyRoom).toHaveBeenCalledWith('ABC234', true);
    expect(voice.applyGraph, 'nothing left to subscribe').not.toHaveBeenCalled();
  });

  it('reapplies on every phase, so reconnect is reapplication not restoration', async () => {
    const voice = spy();
    let doc = started();

    for (let i = 0; i < 4; i += 1) {
      doc = advanceGame(doc, GM, NOW);
      await syncRoomVoice(doc, voice);
    }

    expect(voice.applyGraph).toHaveBeenCalledTimes(4);
  });
});
