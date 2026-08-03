import { describe, expect, it } from 'vitest';
import { advanceGame } from './commands.js';
import { MIN_LOBBY_TO_START } from './keys.js';
import { joinLobby, startSession } from './lobby.js';
import { NotYourActionError, WrongPhaseError } from './night-actions.js';
import { projectRoom } from './project-room.js';
import { castVote, clearVote } from './voting.js';
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

/** Walks to VOTE using only ADVANCE; nobody votes at night, so nobody dies. */
function atVote(seed = 4242): RoomDocument {
  let doc = started(seed);
  for (let i = 0; i < 10; i += 1) {
    if (doc.game?.phase === 'VOTE') return doc;
    doc = advanceGame(doc, GM, NOW);
  }
  throw new Error('never reached VOTE');
}

const living = (doc: RoomDocument): string[] =>
  doc.game?.players.filter((p) => p.alive).map((p) => p.id) ?? [];
const holder = (doc: RoomDocument, role: Role): string => {
  const found = doc.game?.players.find((p) => p.role === role && p.alive);
  if (found === undefined) throw new Error(`no living ${role}`);
  return found.id;
};

describe('voting', () => {
  it('records a vote from a living player', () => {
    const doc = atVote();
    const [voter, target] = living(doc);

    const voted = castVote(doc, voter ?? '', target ?? '');

    expect(voted.game?.dayVotes).toEqual({ [voter ?? '']: target });
    expect(doc.game?.dayVotes, 'input untouched').toEqual({});
  });

  it('is public — every viewer sees every vote as it lands', () => {
    const doc = atVote();
    const [a, b, c] = living(doc);
    const voted = castVote(castVote(doc, a ?? '', c ?? ''), b ?? '', c ?? '');

    // Including the accused, and including the GM.
    for (const viewer of [...living(voted), GM]) {
      expect(projectRoom(voted, viewer).game?.dayVotes, viewer).toEqual({
        [a ?? '']: c,
        [b ?? '']: c,
      });
    }
  });

  it('lets a voter change their mind before the lock', () => {
    const doc = atVote();
    const [voter, first, second] = living(doc);

    const changed = castVote(castVote(doc, voter ?? '', first ?? ''), voter ?? '', second ?? '');

    expect(changed.game?.dayVotes).toEqual({ [voter ?? '']: second });
  });

  it('lets a voter pull their vote entirely', () => {
    const doc = atVote();
    const [voter, target] = living(doc);

    const pulled = clearVote(castVote(doc, voter ?? '', target ?? ''), voter ?? '');

    expect(pulled.game?.dayVotes).toEqual({});
  });

  it('refuses a vote from a dead player', () => {
    const doc = atVote();
    const [voter, target] = living(doc);
    const dead: RoomDocument = {
      ...doc,
      game: {
        ...doc.game!,
        players: doc.game!.players.map((p) => (p.id === voter ? { ...p, alive: false } : p)),
      },
    };

    expect(() => castVote(dead, voter ?? '', target ?? '')).toThrow(NotYourActionError);
  });

  it('refuses a vote cast at a dead player', () => {
    const doc = atVote();
    const [voter, target] = living(doc);
    const dead: RoomDocument = {
      ...doc,
      game: {
        ...doc.game!,
        players: doc.game!.players.map((p) => (p.id === target ? { ...p, alive: false } : p)),
      },
    };

    expect(() => castVote(dead, voter ?? '', target ?? '')).toThrow(/not a living player/i);
  });

  it('refuses a vote from the GM, who holds no role', () => {
    const doc = atVote();

    expect(() => castVote(doc, GM, living(doc)[0] ?? '')).toThrow(NotYourActionError);
    expect(() => castVote(doc, living(doc)[0] ?? '', GM)).toThrow(/not a living player/i);
  });

  it('refuses a vote outside VOTE', () => {
    const day = started();
    const [voter, target] = living(day);

    expect(() => castVote(day, voter ?? '', target ?? '')).toThrow(WrongPhaseError);
  });
});

describe('vote lock', () => {
  it('eliminates the plurality on ADVANCE', () => {
    const doc = atVote();
    const [a, b, c, d] = living(doc);
    let voted = castVote(doc, a ?? '', d ?? '');
    voted = castVote(voted, b ?? '', d ?? '');
    voted = castVote(voted, c ?? '', a ?? '');

    const locked = advanceGame(voted, GM, NOW);

    expect(locked.game?.players.find((p) => p.id === d)?.alive).toBe(false);
    expect(locked.game?.players.find((p) => p.id === d)?.eliminatedBy).toBe('VOTE');
    expect(locked.game?.players.find((p) => p.id === a)?.alive).toBe(true);
  });

  it('eliminates nobody on a tie', () => {
    const doc = atVote();
    const [a, b, c, d] = living(doc);
    let voted = castVote(doc, a ?? '', c ?? '');
    voted = castVote(voted, b ?? '', d ?? '');

    const locked = advanceGame(voted, GM, NOW);

    expect(locked.game?.players.every((p) => p.alive)).toBe(true);
  });

  it('eliminates nobody when nobody voted', () => {
    const locked = advanceGame(atVote(), GM, NOW);

    expect(locked.game?.players.every((p) => p.alive)).toBe(true);
  });

  it('opens the next round on a clean ballot', () => {
    const doc = atVote();
    const [a, b] = living(doc);
    let round = advanceGame(castVote(doc, a ?? '', b ?? ''), GM, NOW);

    // game-core clears dayVotes on entry to VOTE, not on exit, so last round's
    // ballot survives the night in state. What matters is that the next vote
    // starts empty — no carried-over tally.
    while (round.game?.phase !== 'VOTE' && round.game?.phase !== 'GAME_OVER') {
      round = advanceGame(round, GM, NOW);
    }

    expect(round.game?.phase).toBe('VOTE');
    expect(round.game?.dayVotes).toEqual({});
  });

  it('hands the win check to game-core when the vote ends the game', () => {
    const doc = atVote();
    const mafia = holder(doc, 'MAFIA');
    let voted = doc;
    for (const voter of living(doc).filter((id) => id !== mafia)) {
      voted = castVote(voted, voter, mafia);
    }

    const locked = advanceGame(voted, GM, NOW);

    expect(locked.game?.players.find((p) => p.id === mafia)?.alive).toBe(false);
    expect(locked.game?.winner).toBe('TOWN');
    expect(locked.game?.phase).toBe('GAME_OVER');
  });

  it('carries on to the next night when the game is not over', () => {
    const doc = atVote();
    const [a, b] = living(doc);
    const locked = advanceGame(castVote(doc, a ?? '', b ?? ''), GM, NOW);

    expect(locked.game?.phase).toBe('NIGHT_MAFIA');
    expect(locked.game?.winner).toBeNull();
  });
});
