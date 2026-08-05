import { describe, expect, it } from 'vitest';
import { advanceGame } from './commands.js';
import { MAX_SEATS } from './keys.js';
import { joinLobby, startSession } from './lobby.js';
import { mafiaVote, doctorSave } from './night-actions.js';
import { projectRoom } from './project-room.js';
import type { GameConfig, Role } from '../game-core/index.js';
import type { RoomDocument } from './types.js';

const NOW = 1_700_000_000_000;
const GM = 'p1';

/**
 * A big room, because two kills a night is refused in a small one — and it has
 * to be a room the setting is actually legal in, or the test proves nothing.
 */
function started(config: Partial<GameConfig>, seats = 11): RoomDocument {
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
  for (let i = 1; i <= Math.min(seats, MAX_SEATS); i += 1) {
    doc = joinLobby(doc, { playerId: `p${String(i)}`, displayName: `Player ${String(i)}`, now: NOW });
  }
  return startSession(doc, GM, {
    seed: 4242,
    now: NOW,
    config: { mafiaCount: 2, doctor: true, detective: true, mafiaNightMs: 60_000, ...config },
  });
}

function at(doc: RoomDocument, phase: string): RoomDocument {
  let walked = doc;
  for (let i = 0; i < 8; i += 1) {
    if (walked.game?.phase === phase) return walked;
    walked = advanceGame(walked, GM, NOW);
  }
  throw new Error(`never reached ${phase}`);
}

const holders = (doc: RoomDocument, role: Role): string[] =>
  doc.game?.players.filter((p) => p.role === role && p.alive).map((p) => p.id) ?? [];

const townies = (doc: RoomDocument): string[] =>
  doc.game?.players.filter((p) => p.role === 'VILLAGER' && p.alive).map((p) => p.id) ?? [];

/** Walk from the mafia's night to dawn, resolving whatever they left behind. */
function toDawn(doc: RoomDocument): RoomDocument {
  let walked = doc;
  for (let i = 0; i < 8; i += 1) {
    if (walked.game?.phase === 'DAWN' || walked.game?.phase === 'GAME_OVER') return walked;
    walked = advanceGame(walked, GM, NOW);
  }
  throw new Error('never reached dawn');
}

describe('the kill count the GM set before the game', () => {
  it('takes one a night when they left it alone', () => {
    let doc = at(started({}), 'NIGHT_MAFIA');
    const [m1, m2] = holders(doc, 'MAFIA');
    const [v1, v2] = townies(doc);

    // Two mafia, two different names, one kill: a tie takes nobody.
    doc = mafiaVote(doc, m1 ?? '', v1 ?? '');
    doc = mafiaVote(doc, m2 ?? '', v2 ?? '');

    expect(toDawn(doc).game?.lastNight?.eliminatedIds).toEqual([]);
  });

  it('takes both when the GM allowed two and the mafia named two', () => {
    let doc = at(started({ nightKills: 2 }), 'NIGHT_MAFIA');
    const [m1, m2] = holders(doc, 'MAFIA');
    const [v1, v2] = townies(doc);

    doc = mafiaVote(doc, m1 ?? '', v1 ?? '');
    doc = mafiaVote(doc, m2 ?? '', v2 ?? '');

    const dawn = toDawn(doc);

    expect(dawn.game?.lastNight?.eliminatedIds.sort()).toEqual([v1, v2].sort());
    expect(dawn.game?.players.filter((p) => !p.alive)).toHaveLength(2);
  });

  it('lets the doctor pull exactly one of the two back', () => {
    let doc = at(started({ nightKills: 2 }), 'NIGHT_MAFIA');
    const [m1, m2] = holders(doc, 'MAFIA');
    const [v1, v2] = townies(doc);

    doc = mafiaVote(doc, m1 ?? '', v1 ?? '');
    doc = mafiaVote(doc, m2 ?? '', v2 ?? '');
    doc = at(doc, 'NIGHT_DOCTOR');
    doc = doctorSave(doc, holders(doc, 'DOCTOR')[0] ?? '', v1 ?? '');

    const dawn = toDawn(doc);

    expect(dawn.game?.lastNight?.savedId).toBe(v1);
    expect(dawn.game?.lastNight?.eliminatedIds).toEqual([v2]);
    expect(dawn.game?.players.find((p) => p.id === v1)?.alive).toBe(true);
  });

  it('still takes only who the mafia agreed on, never a name they did not cast', () => {
    let doc = at(started({ nightKills: 3 }), 'NIGHT_MAFIA');
    const [m1, m2] = holders(doc, 'MAFIA');
    const [v1] = townies(doc);

    doc = mafiaVote(doc, m1 ?? '', v1 ?? '');
    doc = mafiaVote(doc, m2 ?? '', v1 ?? '');

    // Three slots, one name. The count is a ceiling, not a quota.
    expect(toDawn(doc).game?.lastNight?.eliminatedIds).toEqual([v1]);
  });
});

describe('the count is the GM’s to see', () => {
  it('reaches the GM so the night panel can report against it', () => {
    const doc = at(started({ nightKills: 2 }), 'NIGHT_MAFIA');

    expect(projectRoom(doc, GM).nightKills).toBe(2);
  });

  it('reads as one when the GM never set it', () => {
    const doc = at(started({}), 'NIGHT_MAFIA');

    expect(projectRoom(doc, GM).nightKills).toBe(1);
  });

  it('never reaches a player, on the wire or otherwise', () => {
    // The room learns how many died by being told at dawn, not by reading the
    // setting off their own screen the night before.
    const doc = at(started({ nightKills: 2 }), 'NIGHT_MAFIA');

    for (const member of doc.members) {
      if (member.playerId === GM) continue;
      const view = projectRoom(doc, member.playerId);

      expect(view.nightKills, member.playerId).toBeNull();
      expect(JSON.stringify(view), member.playerId).not.toContain('"nightKills":2');
    }
  });
});
