import { describe, expect, it } from 'vitest';
import { advanceGame } from '../room-store/commands.js';
import { MIN_LOBBY_TO_START } from '../room-store/keys.js';
import { joinLobby, startSession } from '../room-store/lobby.js';
import { projectRoom } from '../room-store/project-room.js';
import { NARRATION_SCRIPT, narrationFor } from './script.js';
import type { Phase } from '../game-core/index.js';
import type { RoomDocument } from '../room-store/types.js';

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

describe('the script names every move', () => {
  it('gives each phase the instruction that opens it', () => {
    for (const phase of Object.keys(NARRATION_SCRIPT) as Phase[]) {
      const label = narrationFor(phase).advanceLabel;

      expect(label, phase).toMatch(/[a-z]/);
      // Short enough to sit on a button and be read at a glance mid-sentence.
      expect(label.length, `${phase}: "${label}"`).toBeLessThanOrEqual(20);
    }
  });

  it('says what the GM is about to say, not where the app is going', () => {
    // The comp's button reads "Mafia sleep" while the room is at NIGHT_MAFIA —
    // it names the next thing out of the GM's mouth, not the next phase name.
    expect(narrationFor('NIGHT_DOCTOR').advanceLabel).toBe('Mafia sleep');
    expect(narrationFor('NIGHT_DETECTIVE').advanceLabel).toBe('Doctor sleep');
    expect(narrationFor('NIGHT_MAFIA').advanceLabel).toBe('Everyone sleep');
  });

  it('matches the line the GM actually reads on arrival', () => {
    // "Mafia sleep" on the button, then "Mafia, sleep." on the card. If these
    // ever disagree the button is lying about what happens next.
    for (const phase of ['NIGHT_DOCTOR', 'NIGHT_DETECTIVE'] as Phase[]) {
      const card = narrationFor(phase);
      const spoken = card.lines.join(' ').toLowerCase().replace(/[^a-z ]/g, '');

      expect(spoken, phase).toContain(card.advanceLabel.toLowerCase());
    }
  });
});

describe('the button is labelled for the phase it is about to open', () => {
  it('reads "Everyone sleep" in the lobby, because night comes next', () => {
    const doc = seated();

    expect(doc.game?.phase).toBe('LOBBY');
    expect(projectRoom(doc, GM).advanceLabel).toBe(narrationFor('ROLE_REVEAL').advanceLabel);
  });

  it('reads the NEXT phase’s instruction at every step of a real game', () => {
    let doc = seated();

    for (let i = 0; i < 12; i += 1) {
      const current = doc.game?.phase;
      if (current === undefined || current === 'GAME_OVER') break;

      const label = projectRoom(doc, GM).advanceLabel;
      const after = advanceGame(doc, GM, NOW + i * 1000);
      const landed = after.game?.phase;
      if (landed === undefined) break;

      // The label promised on the button is the instruction that opens the
      // phase the room actually lands in — including when advancePhase skips
      // a night role nobody holds.
      expect(label, `${current} -> ${landed}`).toBe(narrationFor(landed).advanceLabel);
      doc = after;
    }
  });

  it('offers nothing to advance to once the game is over', async () => {
    // Advancing alone never ends a game: nobody dies unless somebody is
    // eliminated, so the phase loop runs forever. The win condition needs a
    // reason to fire.
    const { forceKill } = await import('../room-store/commands.js');
    let doc = advanceGame(seated(), GM, NOW);
    for (const mafia of doc.game?.players.filter((p) => p.role === 'MAFIA') ?? []) {
      doc = forceKill(doc, GM, mafia.id);
    }

    expect(doc.game?.phase).toBe('GAME_OVER');
    expect(projectRoom(doc, GM).advanceLabel).toBeNull();
  });

  it('is GM-only, like everything else the console reads', () => {
    const doc = seated();

    for (const member of doc.members) {
      if (member.playerId === GM) continue;
      expect(projectRoom(doc, member.playerId).advanceLabel, member.playerId).toBeNull();
    }
  });
});
