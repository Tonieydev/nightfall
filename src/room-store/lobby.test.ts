import { describe, expect, it } from 'vitest';
import { MAX_SEATS, MIN_LOBBY_TO_START, MIN_PLAYERS_TO_START } from './keys.js';
import { joinLobby, setConnected, startSession } from './lobby.js';
import type { RoomDocument } from './types.js';

const NOW = 1_700_000_000_000;

function room(overrides: Partial<RoomDocument> = {}): RoomDocument {
  return {
    version: 1,
    crewCode: 'ABC234',
    createdAt: NOW,
    expiresAt: NOW + 90 * 60 * 1000,
    gmPlayerId: null,
    members: [],
    seed: null,
    voiceEnabled: true,
    reservedMinutes: 0,
    game: null,
    ...overrides,
  };
}

function withMembers(count: number, overrides: Partial<RoomDocument> = {}): RoomDocument {
  let doc = room(overrides);
  for (let i = 1; i <= count; i += 1) {
    doc = joinLobby(doc, { playerId: `p${i}`, displayName: `Player ${i}`, now: NOW });
  }
  return doc;
}

describe('lobby', () => {
  it('adds a joining player', () => {
    const doc = joinLobby(room(), { playerId: 'p1', displayName: 'Toniey', now: NOW });

    expect(doc.members).toEqual([
      { playerId: 'p1', displayName: 'Toniey', connected: true, joinedAt: NOW, connectedAt: NOW },
    ]);
  });

  it('rejects the thirteenth player', () => {
    const full = withMembers(MAX_SEATS);

    expect(full.members).toHaveLength(12);
    expect(() =>
      joinLobby(full, { playerId: 'p13', displayName: 'Thirteen', now: NOW }),
    ).toThrow(/full/i);
  });

  it('lets a returning player rejoin without taking a second seat', () => {
    const doc = withMembers(3);
    const dropped = setConnected(doc, 'p2', false, NOW);

    const back = joinLobby(dropped, { playerId: 'p2', displayName: 'Player 2', now: NOW + 500 });

    expect(back.members).toHaveLength(3);
    expect(back.members.find((m) => m.playerId === 'p2')).toMatchObject({
      connected: true,
      joinedAt: NOW,
    });
  });

  it('marks a member disconnected without removing them', () => {
    const doc = setConnected(withMembers(3), 'p2', false, NOW);

    expect(doc.members).toHaveLength(3);
    expect(doc.members.find((m) => m.playerId === 'p2')?.connected).toBe(false);
  });

  it('refuses to start below a GM plus five players', () => {
    for (let present = 1; present < MIN_LOBBY_TO_START; present += 1) {
      const doc = withMembers(present);

      expect(() => startSession(doc, 'p1', { seed: 1, now: NOW }), `${present} present`).toThrow(/need 6 in the lobby/);
    }
  });

  it('starts at six and makes the tapping player the GM', () => {
    const doc = withMembers(MIN_LOBBY_TO_START);

    const started = startSession(doc, 'p3', { seed: 1, now: NOW });

    expect(started.gmPlayerId).toBe('p3');
    expect(started.members).toHaveLength(6);
    // The GM does not play, so five players remain — assignRoles' floor.
    expect(started.members.filter((m) => m.playerId !== started.gmPlayerId)).toHaveLength(
      MIN_PLAYERS_TO_START,
    );
  });

  it('refuses a second start', () => {
    const started = startSession(withMembers(MIN_LOBBY_TO_START), 'p1', { seed: 1, now: NOW });

    expect(() => startSession(started, 'p2', { seed: 1, now: NOW })).toThrow(/already has a session/);
  });

  it('refuses to make a non-member the GM', () => {
    const doc = withMembers(MIN_LOBBY_TO_START);

    expect(() => startSession(doc, 'stranger', { seed: 1, now: NOW })).toThrow(/not in this lobby/);
  });

  it('refuses a new player once the session has started', () => {
    const started = startSession(withMembers(MIN_LOBBY_TO_START), 'p1', { seed: 1, now: NOW });

    expect(() =>
      joinLobby(started, { playerId: 'late', displayName: 'Late', now: NOW }),
    ).toThrow(/already has a session/);
  });

  it('still lets an existing member reconnect after the session has started', () => {
    const started = startSession(withMembers(MIN_LOBBY_TO_START), 'p1', { seed: 1, now: NOW });
    const dropped = setConnected(started, 'p4', false, NOW);

    const back = joinLobby(dropped, { playerId: 'p4', displayName: 'Player 4', now: NOW });

    expect(back.members.find((m) => m.playerId === 'p4')?.connected).toBe(true);
  });

  it('builds the game from the seed, with the GM holding no role', () => {
    const doc = withMembers(MIN_LOBBY_TO_START);

    const started = startSession(doc, 'p3', { seed: 4242, now: NOW });
    const game = started.game;

    expect(started.seed).toBe(4242);
    expect(game).not.toBeNull();
    expect(game?.gmPlayerId).toBe('p3');
    // members is everyone in the room; players is everyone with a role.
    expect(started.members).toHaveLength(6);
    expect(game?.players).toHaveLength(MIN_PLAYERS_TO_START);
    expect(game?.players.map((p) => p.id)).not.toContain('p3');
    expect(game?.players.every((p) => p.alive)).toBe(true);
    expect(game?.phase).toBe('LOBBY');
    expect(game?.winner).toBeNull();
  });

  it('assigns a legal role spread for five players', () => {
    const started = startSession(withMembers(MIN_LOBBY_TO_START), 'p1', { seed: 7, now: NOW });
    const roles = started.game?.players.map((p) => p.role) ?? [];

    expect(roles.filter((r) => r === 'MAFIA')).toHaveLength(1);
    expect(roles.filter((r) => r === 'DOCTOR')).toHaveLength(1);
    expect(roles.filter((r) => r === 'DETECTIVE')).toHaveLength(1);
    expect(roles.filter((r) => r === 'VILLAGER')).toHaveLength(2);
  });

  it('replays the same assignment from the same seed', () => {
    const doc = withMembers(MIN_LOBBY_TO_START);

    const first = startSession(doc, 'p1', { seed: 999, now: NOW });
    const second = startSession(doc, 'p1', { seed: 999, now: NOW });
    const other = startSession(doc, 'p1', { seed: 1000, now: NOW });

    const rolesOf = (d: typeof first) =>
      Object.fromEntries(d.game?.players.map((p) => [p.id, p.role]) ?? []);

    expect(rolesOf(second)).toEqual(rolesOf(first));
    expect(rolesOf(other)).not.toEqual(rolesOf(first));
  });

  it('survives a reload: the stored seed reproduces the assignment', () => {
    const started = startSession(withMembers(MIN_LOBBY_TO_START), 'p2', { seed: 31337, now: NOW });

    // What Redis actually hands back after a restart.
    const reloaded = JSON.parse(JSON.stringify(started)) as typeof started;
    const rebuilt = startSession(withMembers(MIN_LOBBY_TO_START), 'p2', {
      seed: reloaded.seed ?? 0,
      now: NOW,
    });

    expect(reloaded.game?.players).toEqual(started.game?.players);
    expect(rebuilt.game?.players).toEqual(started.game?.players);
  });

  it('carries the players a five-player game needs, and no GM slot', () => {
    const started = startSession(withMembers(MIN_LOBBY_TO_START), 'p6', { seed: 11, now: NOW });

    expect(started.game?.config.mafiaNightMs).toBe(60_000);
    expect(started.game?.players.find((p) => p.id === 'p6')).toBeUndefined();
    expect(started.members.find((m) => m.playerId === 'p6')).toBeDefined();
  });

  it('never mutates the document it was given', () => {
    const doc = withMembers(3);
    const before = structuredClone(doc);

    joinLobby(doc, { playerId: 'p9', displayName: 'Nine', now: NOW });
    setConnected(doc, 'p1', false, NOW);

    expect(doc).toEqual(before);
  });
});
