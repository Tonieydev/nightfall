import { describe, expect, it } from 'vitest';
import { advanceGame } from '../room-store/commands.js';
import { MIN_LOBBY_TO_START } from '../room-store/keys.js';
import { joinLobby, startSession } from '../room-store/lobby.js';
import { projectRoom } from '../room-store/project-room.js';
import { NARRATION_SCRIPT, advanceBeats, advanceLabelFor, narrationFor } from './script.js';
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
    // The button names the next thing out of the GM's mouth, not the next phase
    // name. Each night phase opens by waking somebody.
    expect(narrationFor('NIGHT_MAFIA').advanceLabel).toBe('Mafia wake up');
    expect(narrationFor('NIGHT_DOCTOR').advanceLabel).toBe('Doctor wake up');
    expect(narrationFor('NIGHT_DETECTIVE').advanceLabel).toBe('Detective wake up');
    expect(narrationFor('DAWN').advanceLabel).toBe('Everyone wake up');
  });

  it('puts the previous role to sleep in the same breath', () => {
    // One tap is two sentences at the table: "Mafia, sleep. Doctor, wake up."
    // Labelling it with only the second half leaves the mafia awake all night,
    // which is what the console did before.
    expect(advanceLabelFor('ROLE_REVEAL', 'NIGHT_MAFIA')).toBe('Everyone sleep · Mafia wake up');
    expect(advanceLabelFor('NIGHT_MAFIA', 'NIGHT_DOCTOR')).toBe('Mafia sleep · Doctor wake up');
    expect(advanceLabelFor('NIGHT_DOCTOR', 'NIGHT_DETECTIVE')).toBe(
      'Doctor sleep · Detective wake up',
    );
    expect(advanceLabelFor('NIGHT_DETECTIVE', 'DAWN')).toBe('Detective sleep · Everyone wake up');
  });

  it('sends the room back to sleep after a vote, not just the mafia', () => {
    // The second night is entered from VOTE, not from ROLE_REVEAL, and the GM
    // still has to put everybody down before the mafia open their eyes.
    expect(advanceLabelFor('VOTE', 'NIGHT_MAFIA')).toBe('Everyone sleep · Mafia wake up');
  });

  it('never wakes a role nobody is holding', () => {
    // advancePhase skips a night role when nobody alive holds it. The label has
    // to skip it too — "Doctor sleep" in a game with no doctor is the console
    // telling the GM to say something false.
    expect(advanceLabelFor('NIGHT_MAFIA', 'NIGHT_DETECTIVE')).toBe(
      'Mafia sleep · Detective wake up',
    );
    expect(advanceLabelFor('NIGHT_MAFIA', 'DAWN')).toBe('Mafia sleep · Everyone wake up');
  });

  it('says nothing about sleep when the day is what comes next', () => {
    // A sleep beat only belongs on a transition into the night.
    expect(advanceLabelFor('DAWN', 'DAY')).toBe('Open the day');
    expect(advanceLabelFor('DAY', 'VOTE')).toBe('Call the vote');
    expect(advanceLabelFor('VOTE', 'GAME_OVER')).toBe('End the game');
  });

  it('hands the button its beats whole, so neither breaks mid-phrase', () => {
    // On a phone "Detective sleep · Everyone wake up" is wider than the button.
    // It has to wrap between the two sentences, never inside one of them, so
    // the console never shows the GM the words "Everyone wake" on a line.
    expect(advanceBeats('Detective sleep · Everyone wake up')).toEqual([
      'Detective sleep',
      'Everyone wake up',
    ]);
    expect(advanceBeats('Open the day')).toEqual(['Open the day']);
  });

  it('matches the line the GM actually reads on arrival', () => {
    // "Mafia sleep · Doctor wake up" on the button, then "Mafia, sleep." and
    // "Doctor, wake up." on the card. If these disagree the button is lying
    // about what happens next.
    const pairs: [Phase, Phase][] = [
      ['ROLE_REVEAL', 'NIGHT_MAFIA'],
      ['NIGHT_MAFIA', 'NIGHT_DOCTOR'],
      ['NIGHT_DOCTOR', 'NIGHT_DETECTIVE'],
      ['NIGHT_DETECTIVE', 'DAWN'],
    ];

    for (const [from, to] of pairs) {
      const spoken = narrationFor(to).lines.join(' ').toLowerCase().replace(/[^a-z ]/g, ' ');

      for (const beat of advanceLabelFor(from, to).split(' · ')) {
        expect(spoken.replace(/\s+/g, ' '), `${from} -> ${to}`).toContain(beat.toLowerCase());
      }
    }
  });
});

describe('the button is labelled for the phase it is about to open', () => {
  it('reads "Deal the cards" in the lobby, because the reveal comes next', () => {
    const doc = seated();

    expect(doc.game?.phase).toBe('LOBBY');
    expect(projectRoom(doc, GM).advanceLabel).toBe(advanceLabelFor('LOBBY', 'ROLE_REVEAL'));
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

      // The label promised on the button is the instruction that closes the
      // phase the GM is in and opens the one the room actually lands in —
      // including when advancePhase skips a night role nobody holds.
      expect(label, `${current} -> ${landed}`).toBe(advanceLabelFor(current, landed));
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
