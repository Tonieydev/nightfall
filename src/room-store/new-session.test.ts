import { describe, expect, it } from 'vitest';
import { advanceGame, endGame, forceKill, newSession } from './commands.js';
import { GameNotStartedError } from './commands.js';
import { MIN_LOBBY_TO_START } from './keys.js';
import { joinLobby, startSession } from './lobby.js';
import { projectRoom } from './project-room.js';
import type { RoomDocument } from './types.js';

const NOW = 1_700_000_000_000;
const GM = 'p1';

function seated(): RoomDocument {
  let doc: RoomDocument = {
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
  };
  for (let i = 1; i <= MIN_LOBBY_TO_START; i += 1) {
    doc = joinLobby(doc, { playerId: `p${String(i)}`, displayName: `Player ${String(i)}`, now: NOW });
  }
  return doc;
}

const finished = (): RoomDocument =>
  endGame(startSession(seated(), GM, { seed: 4242, now: NOW }), GM);

/**
 * A crew that has just finished wants to play again, and the room they are
 * already standing in is the room they want to play in. Sending them back to
 * the landing page for a new code loses everybody who does not follow the new
 * link, which on a group call is most of them.
 */
describe('playing again', () => {
  it('puts the same room back into a lobby', () => {
    const again = newSession(finished(), NOW);

    expect(again.game).toBeNull();
    expect(again.crewCode).toBe('ABC234');
    expect(again.members.map((m) => m.playerId)).toEqual(seated().members.map((m) => m.playerId));
  });

  it('frees the moderator seat instead of keeping it', () => {
    // The spec's debrief asks who moderates next, so the next game is not
    // silently handed back to whoever ran the last one.
    const again = newSession(finished(), NOW);

    expect(again.gmPlayerId).toBeNull();
    expect(projectRoom(again, GM).you?.isGm).toBe(false);
  });

  it('deals a different game, not the same one again', () => {
    // The seed is what assignRoles replays from, so carrying it over would
    // deal every player the same card twice running.
    const again = newSession(finished(), NOW);

    expect(again.seed).toBeNull();
  });

  it('starts the round count over', () => {
    const again = newSession(finished(), NOW);

    expect(again.roundNumber ?? 1).toBe(1);
    expect(projectRoom(again, GM).round).toBe(1);
  });

  it('can be started again straight away', () => {
    const again = newSession(finished(), NOW);
    const next = startSession(again, 'p2', { seed: 99, now: NOW });

    expect(next.gmPlayerId).toBe('p2');
    expect(next.game?.players).toHaveLength(MIN_LOBBY_TO_START - 1);
  });

  it('refuses while a game is still being played', () => {
    // Otherwise it is a reset button beside a live game, and the eliminated
    // have every reason to press it.
    const running = advanceGame(startSession(seated(), GM, { seed: 4242, now: NOW }), GM, NOW);

    expect(() => newSession(running, NOW)).toThrow(GameNotStartedError);
  });

  it('refuses in a lobby that never started', () => {
    expect(() => newSession(seated(), NOW)).toThrow(GameNotStartedError);
  });

  it('works after a game that ended on its own, not only a forced one', () => {
    let doc = advanceGame(startSession(seated(), GM, { seed: 4242, now: NOW }), GM, NOW);
    for (const mafia of doc.game?.players.filter((p) => p.role === 'MAFIA') ?? []) {
      doc = forceKill(doc, GM, mafia.id);
    }

    expect(doc.game?.phase).toBe('GAME_OVER');
    expect(newSession(doc, NOW).game).toBeNull();
  });

  it('never mutates the document it was given', () => {
    const doc = finished();
    const before = structuredClone(doc);

    newSession(doc, NOW);

    expect(doc).toEqual(before);
  });
});
