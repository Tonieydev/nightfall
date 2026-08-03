import { describe, expect, it } from 'vitest';
import { advanceGame, forceKill } from './commands.js';
import { MIN_LOBBY_TO_START } from './keys.js';
import { joinLobby, startSession } from './lobby.js';
import { mafiaVote } from './night-actions.js';
import { projectRoom } from './project-room.js';
import { castVote } from './voting.js';
import type { Role } from '../game-core/index.js';
import type { RoomDocument } from './types.js';

const NOW = 1_700_000_000_000;
const GM = 'p1';

function started(seed = 4242): RoomDocument {
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
  return startSession(doc, GM, { seed, now: NOW });
}

function walkTo(doc: RoomDocument, phase: string): RoomDocument {
  let next = doc;
  for (let i = 0; i < 12; i += 1) {
    if (next.game?.phase === phase) return next;
    next = advanceGame(next, GM, NOW);
  }
  throw new Error(`never reached ${phase}`);
}

const holder = (doc: RoomDocument, role: Role): string => {
  const found = doc.game?.players.find((p) => p.role === role && p.alive);
  if (found === undefined) throw new Error(`no living ${role}`);
  return found.id;
};
const living = (doc: RoomDocument): string[] =>
  doc.game?.players.filter((p) => p.alive).map((p) => p.id) ?? [];

describe('win condition fires from every elimination path', () => {
  it('from a force-kill', () => {
    let doc = walkTo(started(), 'ROLE_REVEAL');
    for (const mafia of doc.game?.players.filter((p) => p.role === 'MAFIA') ?? []) {
      doc = forceKill(doc, GM, mafia.id);
    }

    expect(doc.game?.winner).toBe('TOWN');
    expect(doc.game?.phase).toBe('GAME_OVER');
  });

  it('from a day vote', () => {
    const vote = walkTo(started(), 'VOTE');
    const mafia = holder(vote, 'MAFIA');
    let doc = vote;
    for (const voter of living(vote).filter((id) => id !== mafia)) {
      doc = castVote(doc, voter, mafia);
    }

    const locked = advanceGame(doc, GM, NOW);

    expect(locked.game?.winner).toBe('TOWN');
    expect(locked.game?.phase).toBe('GAME_OVER');
  });

  it('from a mafia night kill reaching parity', () => {
    // Thin the town down with GM overrides until one more kill wins it.
    let doc = walkTo(started(), 'ROLE_REVEAL');
    const mafia = holder(doc, 'MAFIA');
    const town = doc.game?.players.filter((p) => p.role !== 'MAFIA').map((p) => p.id) ?? [];
    for (const victim of town.slice(0, 2)) doc = forceKill(doc, GM, victim);

    expect(doc.game?.winner, 'not decided yet').toBeNull();

    doc = walkTo(doc, 'NIGHT_MAFIA');
    const lastTownie = living(doc).filter((id) => id !== mafia)[0] ?? '';
    doc = mafiaVote(doc, mafia, lastTownie);
    while (doc.game?.phase !== 'GAME_OVER' && doc.game?.phase !== 'DAWN') {
      doc = advanceGame(doc, GM, NOW);
    }

    expect(doc.game?.players.find((p) => p.id === lastTownie)?.alive).toBe(false);
    expect(doc.game?.winner).toBe('MAFIA');
    expect(doc.game?.phase).toBe('GAME_OVER');
  });
});

describe('the outcome reaches everyone', () => {
  function finished(): RoomDocument {
    let doc = walkTo(started(), 'ROLE_REVEAL');
    for (const mafia of doc.game?.players.filter((p) => p.role === 'MAFIA') ?? []) {
      doc = forceKill(doc, GM, mafia.id);
    }
    return doc;
  }

  it('gives the GM and every player the winner', () => {
    const doc = finished();

    for (const member of doc.members) {
      const view = projectRoom(doc, member.playerId);

      expect(view.game?.winner, member.playerId).toBe('TOWN');
      expect(view.game?.phase, member.playerId).toBe('GAME_OVER');
    }
  });

  it('reveals every role at the debrief', () => {
    const doc = finished();

    for (const member of doc.members) {
      const view = projectRoom(doc, member.playerId);
      if (view.game === null) throw new Error('no game');

      expect(view.game.players.every((p) => p.role !== null), member.playerId).toBe(true);
    }
  });
});

describe('audio graph at GAME_OVER', () => {
  function withDead(): RoomDocument {
    let doc = walkTo(started(), 'VOTE');
    const victim = living(doc)[1] ?? '';
    for (const voter of living(doc).filter((id) => id !== victim)) {
      doc = castVote(doc, voter, victim);
    }
    return advanceGame(doc, GM, NOW);
  }

  it('silences the dead during DAY and gives them a voice at GAME_OVER', () => {
    const afterLynch = withDead();
    const dead = afterLynch.game?.players.find((p) => !p.alive)?.id ?? '';
    const day = walkTo(afterLynch, 'DAY');

    expect(projectRoom(day, dead).audio?.speaksTo).toEqual([]);

    const over: RoomDocument = {
      ...day,
      game: { ...day.game!, phase: 'GAME_OVER', winner: 'TOWN' },
    };

    // The post-game argument is the point; the dead are back in it.
    expect(projectRoom(over, dead).audio?.speaksTo.length).toBeGreaterThan(0);
  });

  it('still lets the dead hear the living during DAY', () => {
    const day = walkTo(withDead(), 'DAY');
    const dead = day.game?.players.find((p) => !p.alive)?.id ?? '';

    expect(projectRoom(day, dead).audio?.hears.length).toBeGreaterThan(0);
  });

  it('tells a viewer only their own row, never the whole graph', () => {
    const night = walkTo(started(), 'NIGHT_MAFIA');
    const villager = holder(night, 'VILLAGER');
    const view = projectRoom(night, villager);

    // A villager must not be able to read the mafia channel off their payload.
    // The Mafia's id is in the public roster; what must not leak is their
    // presence in any audio edge, or their role.
    const mafia = holder(night, 'MAFIA');
    expect(view.audio?.speaksTo).toEqual([]);
    expect(view.audio?.hears).toEqual([GM]);
    expect(JSON.stringify(view.audio)).not.toContain(mafia);
    expect(view.game?.players.find((p) => p.id === mafia)?.role).toBeNull();
  });
});

describe('the ballot is projected only while it is live', () => {
  it('shows the ballot during VOTE', () => {
    const vote = walkTo(started(), 'VOTE');
    const [a, b] = living(vote);
    const voted = castVote(vote, a ?? '', b ?? '');

    expect(projectRoom(voted, a ?? '').game?.dayVotes).toEqual({ [a ?? '']: b });
  });

  it('hides last round’s ballot once the vote is locked', () => {
    const vote = walkTo(started(), 'VOTE');
    const [a, b] = living(vote);
    const locked = advanceGame(castVote(vote, a ?? '', b ?? ''), GM, NOW);

    // Still in state — game-core clears on entry to VOTE — but not projected.
    expect(locked.game?.dayVotes).not.toEqual({});
    expect(projectRoom(locked, a ?? '').game?.dayVotes).toEqual({});
  });
});
