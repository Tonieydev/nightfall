import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
    reservedMinutes: 1080,
    game: null,
  };
  for (let i = 1; i <= MIN_LOBBY_TO_START; i += 1) {
    doc = joinLobby(doc, { playerId: `p${String(i)}`, displayName: `Player ${String(i)}`, now: NOW + i });
  }
  return startSession(doc, GM, { seed: 4242, now: NOW });
}

/** Every phase the room actually passes through, in order, GM-driven. */
function everyPhase(): { phase: Phase; doc: RoomDocument }[] {
  const walked: { phase: Phase; doc: RoomDocument }[] = [];
  let doc = seated();
  const seen = new Set<Phase>();

  for (let i = 0; i < 40; i += 1) {
    const phase = doc.game?.phase;
    if (phase === undefined) break;
    if (!seen.has(phase)) {
      seen.add(phase);
      walked.push({ phase, doc });
    }
    if (phase === 'GAME_OVER') break;
    doc = advanceGame(doc, GM, NOW + i * 1000);
  }
  return walked;
}

/** Everything the script could possibly leak, as raw strings. */
const EVERY_NARRATION_STRING = Object.values(NARRATION_SCRIPT).flatMap((card) => [
  // Every telling, not just this round's: a leak test that only checked the
  // variant in play would pass for three rounds and fail on the fourth.
  ...card.variants.flat(),
  ...(card.cue === null ? [] : [card.cue]),
]);

describe('narration reaches the GM and nobody else', () => {
  it('walks a real game through every phase', () => {
    const phases = everyPhase().map((w) => w.phase);

    // A leak test that only ever saw one phase would prove almost nothing.
    expect(phases).toContain('LOBBY');
    expect(phases).toContain('NIGHT_MAFIA');
    expect(phases).toContain('DAY');
    expect(phases.length).toBeGreaterThanOrEqual(7);
  });

  it('gives the GM the card for the phase they are in', () => {
    for (const { phase, doc } of everyPhase()) {
      const view = projectRoom(doc, GM);

      expect(view.narration, phase).toEqual(narrationFor(phase, doc.roundNumber ?? 1));
    }
  });

  it('puts no narration in any other player’s payload, at any phase', () => {
    for (const { phase, doc } of everyPhase()) {
      for (const member of doc.members) {
        if (member.playerId === GM) continue;

        const view = projectRoom(doc, member.playerId);
        expect(view.narration, `${phase} / ${member.playerId}`).toBeNull();
      }
    }
  });

  it('leaks not one line of it into a serialized non-GM payload', () => {
    // Asserted on the wire, not through the type: a field can be present in
    // JSON while the type says otherwise, and JSON is what the player receives.
    // Same discipline as roles.
    for (const { phase, doc } of everyPhase()) {
      for (const member of doc.members) {
        if (member.playerId === GM) continue;
        const wire = JSON.stringify(projectRoom(doc, member.playerId));

        for (const text of EVERY_NARRATION_STRING) {
          expect(wire, `${phase} / ${member.playerId} leaked: "${text}"`).not.toContain(text);
        }
      }
    }
  });

  it('carries the card on the wire for the GM, so the console can read it', () => {
    for (const { phase, doc } of everyPhase()) {
      const wire = JSON.stringify(projectRoom(doc, GM));
      const first = narrationFor(phase, doc.roundNumber ?? 1).lines[0] ?? '';

      expect(wire, phase).toContain(first.slice(0, 24));
    }
  });

  it('shows a dead player nothing, and the GM everything', () => {
    // The dead are still on the call and still receiving state.
    const { doc } = everyPhase().find((w) => w.phase === 'DAY') ?? everyPhase()[0]!;
    const someone = doc.game?.players.find((p) => p.id !== GM)?.id ?? '';

    expect(projectRoom(doc, someone).narration).toBeNull();
    expect(projectRoom(doc, GM).narration).not.toBeNull();
  });
});

describe('the card prompts, it never gates', () => {
  it('is read-only — projecting it changes nothing', () => {
    const doc = seated();
    const before = JSON.stringify(doc);

    projectRoom(doc, GM);
    projectRoom(doc, 'p2');

    expect(JSON.stringify(doc)).toBe(before);
  });

  it('gives the console no way to advance from the card itself', () => {
    const card = readFileSync(join('src', 'app', 'c', '[code]', 'StoryCard.tsx'), 'utf8');

    // Advancing is the GM's one oversized button. A card that could move the
    // phase — or that had to be dismissed — would hand pacing to the app.
    //
    // The card DOES carry one control: the script on/off toggle. That changes
    // what the GM reads, never where the room is, so it is checked by what it
    // can reach rather than by counting buttons — the first version banned all
    // of them and would have blocked the toggle.
    expect(card).not.toMatch(/onAdvance|advance\(/);
    expect(card).not.toMatch(/emit\(|socket/);
    expect(card).not.toMatch(/setTimeout|setInterval/);

    // Its only button is the toggle, and it only ever reports a boolean up.
    const buttons = card.match(/<button/g) ?? [];
    expect(buttons).toHaveLength(1);
    expect(card).toMatch(/aria-pressed/);
    expect(card).toMatch(/onToggle\(!on\)/);
  });

  it('leaves the phase alone no matter how often it is rendered', () => {
    // The script is keyed by phase and round and nothing else, so it cannot
    // depend on how long the GM has been looking at it. Value equality, not
    // identity: the card is composed per call now that a round picks a telling.
    const doc = seated();
    const phase = doc.game?.phase;
    if (phase === undefined) throw new Error('no game');

    expect(narrationFor(phase, 3)).toEqual(narrationFor(phase, 3));
    expect(narrationFor(phase, 3)).not.toEqual(narrationFor(phase, 2));
    expect(doc.game?.phase).toBe(phase);
  });
});
