import { describe, expect, it } from 'vitest';
import { computeAudioGraph } from '../game-core/index.js';
import { advanceGame } from './commands.js';
import { MIN_LOBBY_TO_START } from './keys.js';
import { joinLobby, setConnected, startSession } from './lobby.js';
import { projectRoom } from './project-room.js';
import type { Phase } from '../game-core/index.js';
import type { RoomDocument } from './types.js';

const NOW = 1_700_000_000_000;
const GM = 'p1';

const PHASES: Phase[] = [
  'ROLE_REVEAL',
  'NIGHT_MAFIA',
  'NIGHT_DOCTOR',
  'NIGHT_DETECTIVE',
  'DAWN',
  'DAY',
  'VOTE',
];

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
    doc = joinLobby(doc, { playerId: `p${String(i)}`, displayName: `Player ${String(i)}`, now: NOW + i });
  }
  return advanceGame(startSession(doc, GM, { seed: 4242, now: NOW }), GM, NOW);
}

function at(phase: Phase): RoomDocument {
  let doc = started();
  for (let i = 0; i < 12 && doc.game?.phase !== phase; i += 1) doc = advanceGame(doc, GM, NOW + i * 1000);
  if (doc.game?.phase !== phase) throw new Error(`could not reach ${phase}`);
  return doc;
}

/** Drop and come back, as a locked phone or a lost signal would. */
function cycle(doc: RoomDocument, playerId: string): RoomDocument {
  return setConnected(setConnected(doc, playerId, false, NOW + 1000), playerId, true, NOW + 2000);
}

describe('a dropped player keeps their seat', () => {
  it('is never removed from the room, at any phase', () => {
    for (const phase of PHASES) {
      const before = at(phase);
      const after = setConnected(before, 'p3', false, NOW + 1000);

      expect(after.members.map((m) => m.playerId), phase).toEqual(
        before.members.map((m) => m.playerId),
      );
    }
  });

  it('keeps their role and their place in the game', () => {
    for (const phase of PHASES) {
      const before = at(phase);
      const after = cycle(before, 'p3');

      expect(after.game?.players, phase).toEqual(before.game?.players);
    }
  });

  it('is marked away while gone, and present again on return', () => {
    const away = setConnected(at('DAY'), 'p3', false, NOW + 1000);
    expect(projectRoom(away, GM).members.find((m) => m.playerId === 'p3')?.connected).toBe(false);

    const back = setConnected(away, 'p3', true, NOW + 2000);
    expect(projectRoom(back, GM).members.find((m) => m.playerId === 'p3')?.connected).toBe(true);
  });
});

describe('what a returning player is given', () => {
  it('gets the phase they came back to, never the one they left', () => {
    let doc = at('NIGHT_MAFIA');
    const leftDuring = doc.game?.phase;
    doc = setConnected(doc, 'p3', false, NOW + 1000);

    // The room moved on while they were away.
    doc = advanceGame(doc, GM, NOW + 2000);
    doc = setConnected(doc, 'p3', true, NOW + 3000);

    const view = projectRoom(doc, 'p3');
    expect(view.game?.phase).not.toBe(leftDuring);
    expect(view.game?.phase).toBe(doc.game?.phase);
  });

  it('is projected identically to a player who never dropped', () => {
    // Reapplication, not restoration: the projection is a function of state and
    // viewer, so a gap in the socket cannot leave anything stale behind.
    for (const phase of PHASES) {
      const steady = at(phase);
      const dropped = cycle(steady, 'p3');

      for (const member of steady.members) {
        const id = member.playerId;
        expect(
          { ...projectRoom(dropped, id), members: [] },
          `${phase} / ${id}`,
        ).toEqual({ ...projectRoom(steady, id), members: [] });
      }
    }
  });

  it('gets exactly the audio row their role and phase allow', () => {
    for (const phase of PHASES) {
      const doc = cycle(at(phase), 'p3');
      const game = doc.game;
      if (game === null) throw new Error('no game');
      const graph = computeAudioGraph(game);

      for (const member of doc.members) {
        const view = projectRoom(doc, member.playerId);
        const hears = [...graph]
          .filter(([, listeners]) => listeners.has(member.playerId))
          .map(([speaker]) => speaker)
          .sort();

        expect(view.audio?.hears.slice().sort(), `${phase} / ${member.playerId}`).toEqual(hears);
        expect(view.audio?.speaksTo.slice().sort(), `${phase} / ${member.playerId}`).toEqual(
          [...(graph.get(member.playerId) ?? [])].sort(),
        );
      }
    }
  });

  it('learns nothing from the gap — a villager back in NIGHT_MAFIA still sees no roles', () => {
    const doc = cycle(at('NIGHT_MAFIA'), 'p3');
    const villager = doc.game?.players.find((p) => p.role === 'VILLAGER')?.id ?? '';

    const wire = JSON.stringify(projectRoom(doc, villager));
    const mafia = doc.game?.players.filter((p) => p.role === 'MAFIA') ?? [];

    for (const p of mafia) {
      if (p.id === villager) continue;
      expect(wire, `${villager} must not learn ${p.id}`).not.toContain(`"${p.id}","role":"MAFIA"`);
    }
    expect(projectRoom(doc, villager).game?.players.filter((p) => p.role !== null)).toHaveLength(1);
  });

  it('hears nothing of the mafia channel if they are not in it', () => {
    const doc = cycle(at('NIGHT_MAFIA'), 'p3');
    const game = doc.game;
    if (game === null) throw new Error('no game');
    const outsider = game.players.find((p) => p.role === 'DOCTOR')?.id ?? '';
    const mafiaIds = game.players.filter((p) => p.role === 'MAFIA').map((p) => p.id);

    const view = projectRoom(doc, outsider);

    for (const id of mafiaIds) expect(view.audio?.hears, id).not.toContain(id);
  });

  it('carries no chat from before the drop into a new phase', () => {
    const doc = cycle(at('DAY'), 'p3');

    expect(projectRoom(doc, 'p3').chat).toEqual([]);
  });
});
