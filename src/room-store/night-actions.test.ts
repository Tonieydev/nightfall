import { describe, expect, it } from 'vitest';
import { advanceGame } from './commands.js';
import { MIN_LOBBY_TO_START } from './keys.js';
import { joinLobby, startSession } from './lobby.js';
import { NotYourActionError, WrongPhaseError, detectiveCheck, doctorSave, mafiaVote } from './night-actions.js';
import { projectRoom } from './project-room.js';
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

/** Walks to the given phase using only ADVANCE, so legal order stays game-core's. */
function at(phase: string, seed = 4242): RoomDocument {
  let doc = started(seed);
  for (let i = 0; i < 8; i += 1) {
    if (doc.game?.phase === phase) return doc;
    doc = advanceGame(doc, GM, NOW);
  }
  throw new Error(`never reached ${phase}`);
}

const holder = (doc: RoomDocument, role: Role): string => {
  const found = doc.game?.players.find((p) => p.role === role && p.alive);
  if (found === undefined) throw new Error(`no living ${role}`);
  return found.id;
};

const townie = (doc: RoomDocument): string => holder(doc, 'VILLAGER');

describe('night actions', () => {
  it('records a Mafia target vote', () => {
    const doc = at('NIGHT_MAFIA');
    const mafia = holder(doc, 'MAFIA');
    const target = townie(doc);

    const voted = mafiaVote(doc, mafia, target);

    expect(voted.game?.night.mafiaVotes).toEqual({ [mafia]: target });
    expect(doc.game?.night.mafiaVotes, 'input untouched').toEqual({});
  });

  it('refuses a night vote from anyone who is not a living Mafia', () => {
    const doc = at('NIGHT_MAFIA');
    const mafia = holder(doc, 'MAFIA');
    const target = townie(doc);

    for (const actor of [townie(doc), holder(doc, 'DOCTOR'), holder(doc, 'DETECTIVE'), GM]) {
      expect(() => mafiaVote(doc, actor, target), actor).toThrow(NotYourActionError);
    }
    expect(() => mafiaVote(doc, mafia, target)).not.toThrow();
  });

  it('refuses the Doctor save from anyone but the living Doctor', () => {
    const doc = at('NIGHT_DOCTOR');
    const target = townie(doc);

    for (const actor of [holder(doc, 'MAFIA'), holder(doc, 'DETECTIVE'), GM]) {
      expect(() => doctorSave(doc, actor, target), actor).toThrow(NotYourActionError);
    }
    expect(doctorSave(doc, holder(doc, 'DOCTOR'), target).game?.night.doctorSave).toBe(target);
  });

  it('refuses the Detective check from anyone but the living Detective', () => {
    const doc = at('NIGHT_DETECTIVE');
    const target = holder(doc, 'MAFIA');

    for (const actor of [holder(doc, 'MAFIA'), holder(doc, 'DOCTOR'), GM]) {
      expect(() => detectiveCheck(doc, actor, target), actor).toThrow(NotYourActionError);
    }
    expect(detectiveCheck(doc, holder(doc, 'DETECTIVE'), target).game?.night.detectiveCheck).toBe(
      target,
    );
  });

  it('refuses an action taken in the wrong phase', () => {
    const day = at('NIGHT_DOCTOR');

    expect(() => mafiaVote(day, holder(day, 'MAFIA'), townie(day))).toThrow(WrongPhaseError);
  });

  it('refuses a target who is not a living player', () => {
    const doc = at('NIGHT_MAFIA');

    expect(() => mafiaVote(doc, holder(doc, 'MAFIA'), GM)).toThrow(/not a living player/i);
    expect(() => mafiaVote(doc, holder(doc, 'MAFIA'), 'nobody')).toThrow(/not a living player/i);
  });

  it('lets the Mafia change their mind before the phase ends', () => {
    const doc = at('NIGHT_MAFIA');
    const mafia = holder(doc, 'MAFIA');
    const [first, second] = doc.game?.players.filter((p) => p.role === 'VILLAGER') ?? [];

    const changed = mafiaVote(mafiaVote(doc, mafia, first?.id ?? ''), mafia, second?.id ?? '');

    expect(changed.game?.night.mafiaVotes).toEqual({ [mafia]: second?.id });
  });
});

describe('night resolution', () => {
  it('kills the Mafia target on the way into DAWN', () => {
    const night = at('NIGHT_MAFIA');
    const target = townie(night);
    let doc = mafiaVote(night, holder(night, 'MAFIA'), target);

    while (doc.game?.phase !== 'DAWN' && doc.game?.phase !== 'GAME_OVER') {
      doc = advanceGame(doc, GM, NOW);
    }

    expect(doc.game?.players.find((p) => p.id === target)?.alive).toBe(false);
    expect(doc.game?.players.find((p) => p.id === target)?.eliminatedBy).toBe('MAFIA');
  });

  it('kills nobody when the Doctor saves the target', () => {
    const night = at('NIGHT_MAFIA');
    const target = townie(night);
    let doc = mafiaVote(night, holder(night, 'MAFIA'), target);
    doc = advanceGame(doc, GM, NOW);
    doc = doctorSave(doc, holder(doc, 'DOCTOR'), target);

    while (doc.game?.phase !== 'DAWN' && doc.game?.phase !== 'GAME_OVER') {
      doc = advanceGame(doc, GM, NOW);
    }

    expect(doc.game?.players.every((p) => p.alive)).toBe(true);
    expect(doc.game?.lastNight?.saved).toBe(true);
  });

  it('kills nobody when no Mafia voted — no fallback', () => {
    let doc = at('NIGHT_MAFIA');

    while (doc.game?.phase !== 'DAWN' && doc.game?.phase !== 'GAME_OVER') {
      doc = advanceGame(doc, GM, NOW);
    }

    expect(doc.game?.players.every((p) => p.alive)).toBe(true);
    expect(doc.game?.lastNight?.eliminatedId).toBeNull();
  });
});

describe('detective result isolation', () => {
  it('reaches the Detective and the GM, and nobody else', () => {
    const night = at('NIGHT_DETECTIVE');
    const detective = holder(night, 'DETECTIVE');
    const mafia = holder(night, 'MAFIA');
    let doc = detectiveCheck(night, detective, mafia);

    while (doc.game?.phase !== 'DAWN' && doc.game?.phase !== 'GAME_OVER') {
      doc = advanceGame(doc, GM, NOW);
    }

    expect(projectRoom(doc, detective).game?.detectiveResult).toEqual({
      targetId: mafia,
      team: 'MAFIA',
    });
    expect(projectRoom(doc, GM).game?.detectiveResult).toEqual({ targetId: mafia, team: 'MAFIA' });

    // Everyone else: absent from the bytes on the wire, not merely null.
    for (const member of doc.members) {
      if (member.playerId === detective || member.playerId === GM) continue;
      const json = JSON.stringify(projectRoom(doc, member.playerId));

      expect(json, member.playerId).not.toContain('"team"');
      expect(json, member.playerId).not.toContain('detectiveCheck');
      expect(projectRoom(doc, member.playerId).game?.detectiveResult, member.playerId).toBeNull();
    }
  });

  it('reports the team, never the exact role', () => {
    const night = at('NIGHT_DETECTIVE');
    const detective = holder(night, 'DETECTIVE');
    const doctor = holder(night, 'DOCTOR');
    let doc = detectiveCheck(night, detective, doctor);

    while (doc.game?.phase !== 'DAWN' && doc.game?.phase !== 'GAME_OVER') {
      doc = advanceGame(doc, GM, NOW);
    }

    const result = projectRoom(doc, detective).game?.detectiveResult;

    expect(result?.team).toBe('TOWN');
    expect(JSON.stringify(result)).not.toContain('DOCTOR');
  });
});
