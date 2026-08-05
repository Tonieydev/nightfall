import { describe, expect, it, vi } from 'vitest';

/**
 * The audio graph is rebuilt from scratch on every call. Projecting a room used
 * to build one per chat message per recipient, on a path that runs on every
 * vote, every night action and every message — so the cost grew with the square
 * of how busy the room was.
 *
 * These count the constructions rather than timing anything, so the assertion
 * is about the algorithm and not about how fast the machine happened to be.
 */
const built = { count: 0 };

vi.mock('../game-core/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../game-core/index.js')>();
  return {
    ...actual,
    computeAudioGraph: (state: Parameters<typeof actual.computeAudioGraph>[0]) => {
      built.count += 1;
      return actual.computeAudioGraph(state);
    },
  };
});

const { advanceGame } = await import('./commands.js');
const { postChat } = await import('./chat.js');
const { MIN_LOBBY_TO_START } = await import('./keys.js');
const { joinLobby, startSession } = await import('./lobby.js');
const { projectRoom, projectRoomFor } = await import('./project-room.js');
type RoomDocument = import('./types.js').RoomDocument;

const NOW = 1_700_000_000_000;
const GM = 'p1';

function busyRoom(messages: number): RoomDocument {
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
    doc = joinLobby(doc, { playerId: `p${String(i)}`, displayName: `Player ${String(i)}`, now: NOW + i });
  }
  doc = advanceGame(startSession(doc, GM, { seed: 4242, now: NOW }), GM, NOW);
  while (doc.game?.phase !== 'DAY') doc = advanceGame(doc, GM, NOW);

  const speakers = doc.game.players.filter((p) => p.alive).map((p) => p.id);
  for (let i = 0; i < messages; i += 1) {
    doc = postChat(doc, speakers[i % speakers.length] ?? GM, `message ${String(i)}`, NOW + i);
  }
  return doc;
}

describe('projecting a room does not rebuild the audio graph per message', () => {
  it('builds it once for one viewer, however much has been said', () => {
    const doc = busyRoom(20);

    built.count = 0;
    projectRoom(doc, GM);

    // Was 21: one per message, plus one for the viewer's own audio row.
    expect(built.count).toBe(1);
  });

  it('does not grow as the room gets busier', () => {
    const quiet = busyRoom(1);
    const loud = busyRoom(40);

    built.count = 0;
    projectRoom(quiet, GM);
    const forQuiet = built.count;

    built.count = 0;
    projectRoom(loud, GM);

    expect(built.count).toBe(forQuiet);
  });

  it('builds it once for a whole broadcast, not once per socket', () => {
    const doc = busyRoom(20);
    const everyone = doc.members.map((m) => m.playerId);

    built.count = 0;
    const views = projectRoomFor(doc, everyone);

    // One broadcast, one graph — the room is the same for all of them.
    expect(built.count).toBe(1);
    expect(views).toHaveLength(everyone.length);
  });

  it('gives every viewer exactly what projecting them one at a time would', () => {
    const doc = busyRoom(12);
    const everyone = doc.members.map((m) => m.playerId);

    const batched = projectRoomFor(doc, everyone);

    // The optimisation must be invisible: same payload, per recipient, or it
    // has changed who can see what — which is the one thing it must not do.
    everyone.forEach((viewerId, i) => {
      expect(batched[i], viewerId).toEqual(projectRoom(doc, viewerId));
    });
  });

  it('still isolates the mafia channel when projected in a batch', () => {
    let doc = busyRoom(0);
    while (doc.game?.phase !== 'NIGHT_MAFIA') doc = advanceGame(doc, GM, NOW);
    const mafia = doc.game.players.find((p) => p.role === 'MAFIA' && p.alive)?.id ?? '';
    doc = postChat(doc, mafia, 'taking the doctor', NOW);

    const everyone = doc.members.map((m) => m.playerId);
    const views = projectRoomFor(doc, everyone);

    everyone.forEach((viewerId, i) => {
      const sees = (views[i]?.chat ?? []).some((m) => m.text === 'taking the doctor');
      const allowed = viewerId === mafia || viewerId === GM;
      expect(sees, `${viewerId} should ${allowed ? '' : 'not '}see it`).toBe(allowed);
    });
  });
});
