import { describe, expect, it } from 'vitest';
import {
  GameNotStartedError,
  NotGmError,
  advanceGame,
  endGame,
  forceKill,
  forceRevive,
  revertPhase,
} from './commands.js';
import { joinLobby, startSession } from './lobby.js';
import { MIN_LOBBY_TO_START } from './keys.js';
import type { RoomDocument } from './types.js';

const NOW = 1_700_000_000_000;
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
    game: null,
  };
  for (let i = 1; i <= MIN_LOBBY_TO_START; i += 1) {
    doc = joinLobby(doc, { playerId: `p${i}`, displayName: `Player ${i}`, now: NOW });
  }
  return startSession(doc, GM, { seed: 4242, now: NOW });
}

const playerIds = (doc: RoomDocument): string[] => doc.game?.players.map((p) => p.id) ?? [];
const aliveOf = (doc: RoomDocument, id: string): boolean | undefined =>
  doc.game?.players.find((p) => p.id === id)?.alive;

describe('GM commands', () => {
  it('advances through game-core, GM never naming the phase', () => {
    const doc = started();

    const next = advanceGame(doc, GM, NOW);

    expect(doc.game?.phase).toBe('LOBBY');
    expect(next.game?.phase).toBe('ROLE_REVEAL');
    expect(next.game?.version).toBe((doc.game?.version ?? 0) + 1);
  });

  it('refuses every command from a player who is not the GM', () => {
    const doc = advanceGame(started(), GM, NOW);
    const target = playerIds(doc)[0] ?? '';

    for (const [name, run] of [
      ['ADVANCE', () => advanceGame(doc, 'p2', NOW)],
      ['FORCE_KILL', () => forceKill(doc, 'p2', target)],
      ['FORCE_REVIVE', () => forceRevive(doc, 'p2', target)],
      ['REVERT_PHASE', () => revertPhase(doc, 'p2')],
      ['END_GAME', () => endGame(doc, 'p2')],
    ] as const) {
      expect(run, name).toThrow(NotGmError);
    }
  });

  it('refuses commands from a stranger who is in no lobby at all', () => {
    const doc = started();

    expect(() => advanceGame(doc, 'nobody', NOW)).toThrow(NotGmError);
    expect(() => endGame(doc, '')).toThrow(NotGmError);
  });

  it('refuses commands before the game exists', () => {
    const lobby: RoomDocument = { ...started(), game: null, gmPlayerId: GM };

    expect(() => advanceGame(lobby, GM, NOW)).toThrow(GameNotStartedError);
    expect(() => forceKill(lobby, GM, 'p2')).toThrow(GameNotStartedError);
  });

  it('force-kills a player and stamps the cause', () => {
    const doc = advanceGame(started(), GM, NOW);
    const target = playerIds(doc)[0] ?? '';

    const killed = forceKill(doc, GM, target);

    expect(aliveOf(killed, target)).toBe(false);
    // A GM override must be distinguishable from a lynch in the durable record.
    expect(killed.game?.players.find((p) => p.id === target)?.eliminatedBy).toBe('GM');
    expect(aliveOf(doc, target), 'input untouched').toBe(true);
  });

  it('force-revives a player it previously killed', () => {
    const doc = advanceGame(started(), GM, NOW);
    const target = playerIds(doc)[0] ?? '';

    const revived = forceRevive(forceKill(doc, GM, target), GM, target);

    expect(aliveOf(revived, target)).toBe(true);
    expect(revived.game?.players.find((p) => p.id === target)?.eliminatedAtPhase).toBeNull();
  });

  it('refuses to kill someone who holds no role, including the GM', () => {
    const doc = advanceGame(started(), GM, NOW);

    expect(() => forceKill(doc, GM, GM)).toThrow(/not a player/i);
    expect(() => forceKill(doc, GM, 'nobody')).toThrow(/not a player/i);
  });

  it('runs the win check through game-core after a force-kill', () => {
    let doc = advanceGame(started(), GM, NOW);
    // Killing every Mafia is a Town win, and game-core decides that, not us.
    for (const player of doc.game?.players.filter((p) => p.role === 'MAFIA') ?? []) {
      doc = forceKill(doc, GM, player.id);
    }

    expect(doc.game?.winner).toBe('TOWN');
    expect(doc.game?.phase).toBe('GAME_OVER');
  });

  it('reverts one phase by restoring the snapshot, not by computing backwards', () => {
    const lobby = started();
    const reveal = advanceGame(lobby, GM, NOW);
    const night = advanceGame(reveal, GM, NOW);

    const back = revertPhase(night, GM);

    expect(night.game?.phase).toBe('NIGHT_MAFIA');
    expect(back.game?.phase).toBe('ROLE_REVEAL');
    expect(back.game?.players).toEqual(reveal.game?.players);
  });

  it('has nothing to revert to before the first advance', () => {
    expect(() => revertPhase(started(), GM)).toThrow(/nothing to revert/i);
  });

  it('ends the game outright, with no winner invented', () => {
    const doc = advanceGame(started(), GM, NOW);

    const ended = endGame(doc, GM);

    expect(ended.game?.phase).toBe('GAME_OVER');
    expect(ended.game?.winner).toBeNull();
  });

  it('never mutates the document it was given', () => {
    const doc = advanceGame(started(), GM, NOW);
    const before = structuredClone(doc);
    const target = playerIds(doc)[0] ?? '';

    advanceGame(doc, GM, NOW);
    forceKill(doc, GM, target);
    forceRevive(doc, GM, target);
    revertPhase(doc, GM);
    endGame(doc, GM);

    expect(doc).toEqual(before);
  });
});
