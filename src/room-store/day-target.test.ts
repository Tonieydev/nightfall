import { describe, expect, it } from 'vitest';
import { advanceGame, reconcilePhase } from './commands.js';
import { MIN_LOBBY_TO_START } from './keys.js';
import { joinLobby, startSession } from './lobby.js';
import { projectRoom } from './project-room.js';
import type { RoomDocument } from './types.js';

const NOW = 1_700_000_000_000;
const GM = 'p1';
const TARGET = 5 * 60_000;

function room(dayTargetMs: number | null): RoomDocument {
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
  return startSession(doc, GM, { seed: 4242, now: NOW, dayTargetMs });
}

function walkTo(doc: RoomDocument, phase: string, at = NOW): RoomDocument {
  let walked = doc;
  for (let i = 0; i < 12 && walked.game?.phase !== phase; i += 1) {
    walked = advanceGame(walked, GM, at + i);
  }
  return walked;
}

describe('the day target is the GM’s alone', () => {
  it('reaches the GM during the day', () => {
    const doc = walkTo(room(TARGET), 'DAY');

    const view = projectRoom(doc, GM);
    expect(view.dayEndsAt).not.toBeNull();
  });

  it('never reaches a player, at any phase', () => {
    let doc = room(TARGET);

    for (let i = 0; i < 12; i += 1) {
      for (const member of doc.members) {
        if (member.playerId === GM) continue;
        const view = projectRoom(doc, member.playerId);

        // A pacing aid for the person running the night, not a game clock.
        // A player who could see it would play the clock, not the room.
        expect(view.dayEndsAt, `${String(doc.game?.phase)} / ${member.playerId}`).toBeNull();
      }
      doc = advanceGame(doc, GM, NOW + i);
    }
  });

  it('is absent from a player’s serialized payload', () => {
    const doc = walkTo(room(TARGET), 'DAY');
    const endsAt = projectRoom(doc, GM).dayEndsAt;

    for (const member of doc.members) {
      if (member.playerId === GM) continue;
      const wire = JSON.stringify(projectRoom(doc, member.playerId));

      expect(wire).not.toContain(String(endsAt));
    }
  });

  it('is null outside the day, even for the GM', () => {
    const doc = walkTo(room(TARGET), 'NIGHT_MAFIA');

    // It measures the discussion. There is nothing to pace at night.
    expect(projectRoom(doc, GM).dayEndsAt).toBeNull();
  });

  it('is null when the GM did not set one', () => {
    const doc = walkTo(room(null), 'DAY');

    expect(projectRoom(doc, GM).dayEndsAt).toBeNull();
  });
});

describe('the day target drives nothing', () => {
  it('does not end the day when it runs out', () => {
    const doc = walkTo(room(TARGET), 'DAY');
    const wayPast = NOW + TARGET * 10;

    // The soft model in one assertion: the clock guides, the human decides.
    expect(reconcilePhase(doc, wayPast)).toBeNull();
    expect(doc.game?.phase).toBe('DAY');
  });

  it('leaves the phase alone however long the day runs', () => {
    let doc = walkTo(room(TARGET), 'DAY');
    const before = doc.game?.phaseNumber;

    for (let i = 1; i <= 20; i += 1) {
      const settled = reconcilePhase(doc, NOW + TARGET * i);
      if (settled !== null) doc = settled;
    }

    expect(doc.game?.phase).toBe('DAY');
    expect(doc.game?.phaseNumber).toBe(before);
  });

  it('never becomes the authoritative phase clock', () => {
    const doc = walkTo(room(TARGET), 'DAY');

    // phaseEndsAt is what the server resolves on. The day target is deliberately
    // not it — conflating them would make the soft timer hard.
    expect(doc.game?.phaseEndsAt).toBeNull();
    expect(projectRoom(doc, GM).dayEndsAt).not.toBe(doc.game?.phaseEndsAt);
  });

  it('still lets the mafia night resolve itself, which IS authoritative', () => {
    const doc = walkTo(room(TARGET), 'NIGHT_MAFIA');

    // The contrast that matters: this one has a server deadline and does end.
    expect(doc.game?.phaseEndsAt).not.toBeNull();
    expect(reconcilePhase(doc, (doc.game?.phaseEndsAt ?? 0) + 1)).not.toBeNull();
  });
});
