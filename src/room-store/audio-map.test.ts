import { describe, expect, it } from 'vitest';
import { computeAudioGraph } from '../game-core/index.js';
import { advanceGame } from './commands.js';
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
    doc = joinLobby(doc, { playerId: `p${String(i)}`, displayName: `Player ${String(i)}`, now: NOW + i });
  }
  return startSession(doc, GM, { seed: 4242, now: NOW });
}

function everyPhase(): RoomDocument[] {
  const walked: RoomDocument[] = [];
  let doc = seated();
  for (let i = 0; i < 14; i += 1) {
    walked.push(doc);
    if (doc.game?.phase === 'GAME_OVER') break;
    doc = advanceGame(doc, GM, NOW + i * 1000);
  }
  return walked;
}

describe('the GM can see who hears whom', () => {
  it('gets the whole graph, matching what the engine computed', () => {
    for (const doc of everyPhase()) {
      const game = doc.game;
      if (game === null) continue;
      const expected = computeAudioGraph(game);

      const projected = projectRoom(doc, GM).audioGraph;
      expect(projected, game.phase).not.toBeNull();

      for (const [speaker, listeners] of expected) {
        expect(projected?.[speaker]?.slice().sort(), `${game.phase} / ${speaker}`).toEqual(
          [...listeners].sort(),
        );
      }
    }
  });
});

describe('no player ever receives it', () => {
  it('is null for every non-GM, at every phase', () => {
    for (const doc of everyPhase()) {
      for (const member of doc.members) {
        if (member.playerId === GM) continue;

        expect(
          projectRoom(doc, member.playerId).audioGraph,
          `${String(doc.game?.phase)} / ${member.playerId}`,
        ).toBeNull();
      }
    }
  });

  it('would hand a villager the mafia roster if it leaked — so it must not', () => {
    let doc = seated();
    while (doc.game?.phase !== 'NIGHT_MAFIA') doc = advanceGame(doc, GM, NOW);

    const game = doc.game;
    const mafia = game.players.filter((p) => p.role === 'MAFIA').map((p) => p.id);
    const villager = game.players.find((p) => p.role === 'VILLAGER')?.id ?? '';
    expect(mafia.length).toBeGreaterThan(0);

    // At NIGHT_MAFIA the graph IS the mafia roster: whoever hears a mafia
    // speaker is mafia. This is the single most damaging thing to project.
    const wire = JSON.stringify(projectRoom(doc, villager));
    for (const id of mafia) {
      expect(wire, `${villager} must not learn ${id}`).not.toContain(`"${id}":[`);
    }
    expect(projectRoom(doc, villager).audioGraph).toBeNull();
  });

  it('still gives each player only their own row', () => {
    let doc = seated();
    while (doc.game?.phase !== 'NIGHT_MAFIA') doc = advanceGame(doc, GM, NOW);

    for (const member of doc.members) {
      const view = projectRoom(doc, member.playerId);
      // The per-viewer row is unchanged: this adds a GM surface, it does not
      // widen anybody else's.
      expect(view.audio, member.playerId).not.toBeNull();
    }
  });
});

describe('the round counter', () => {
  it('starts at one and counts night cycles, not phases', () => {
    let doc = seated();
    expect(doc.roundNumber).toBe(1);

    const seen = new Set<number>();
    for (let i = 0; i < 14; i += 1) {
      seen.add(doc.roundNumber ?? 0);
      if (doc.game?.phase === 'GAME_OVER') break;
      doc = advanceGame(doc, GM, NOW + i * 1000);
    }

    // A round is a night cycle. Nine phases in one round must not read as nine.
    expect(Math.max(...seen)).toBeLessThan(4);
    expect(projectRoom(doc, GM).round).toBe(doc.roundNumber);
  });

  it('advances when the night comes round again', () => {
    let doc = seated();
    while (doc.game?.phase !== 'NIGHT_MAFIA') doc = advanceGame(doc, GM, NOW);
    const first = doc.roundNumber ?? 0;

    doc = advanceGame(doc, GM, NOW);
    while (doc.game?.phase !== 'NIGHT_MAFIA' && doc.game?.phase !== 'GAME_OVER') {
      doc = advanceGame(doc, GM, NOW);
    }

    if (doc.game?.phase === 'NIGHT_MAFIA') expect(doc.roundNumber).toBe(first + 1);
  });

  it('is not a secret — every player sees the same round', () => {
    const doc = seated();

    for (const member of doc.members) {
      expect(projectRoom(doc, member.playerId).round).toBe(doc.roundNumber);
    }
  });
});
