import { describe, expect, it } from 'vitest';
import { computeAudioGraph } from '../game-core/index.js';
import { MAX_CHAT_CHARS, chatFor, postChat, systemRecord } from './chat.js';
import { advanceGame, forceKill } from './commands.js';
import { MIN_LOBBY_TO_START } from './keys.js';
import { joinLobby, startSession } from './lobby.js';
import type { Phase, Role } from '../game-core/index.js';
import type { RoomDocument } from './types.js';

const NOW = 1_700_000_000_000;
const GM = 'p1';

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
    doc = joinLobby(doc, {
      playerId: `p${String(i)}`,
      displayName: `Player ${String(i)}`,
      now: NOW + i,
    });
  }
  return advanceGame(startSession(doc, GM, { seed: 4242, now: NOW }), GM, NOW);
}

/** Walks the phase machine to the requested phase, GM-driven as in a real game. */
function at(phase: Phase): RoomDocument {
  let doc = started();
  for (let i = 0; i < 12 && doc.game?.phase !== phase; i += 1) {
    doc = advanceGame(doc, GM, NOW + i * 1000);
  }
  if (doc.game?.phase !== phase) throw new Error(`could not reach ${phase}`);
  return doc;
}

const holderOf = (doc: RoomDocument, role: Role): string =>
  doc.game?.players.find((p) => p.role === role && p.alive)?.id ?? '';

const recipients = (doc: RoomDocument, senderId: string): string[] =>
  doc.members
    .map((m) => m.playerId)
    .filter((viewerId) => chatFor(doc, viewerId).some((m) => m.senderId === senderId));

describe('chat routes through the audio graph and nowhere else', () => {
  it('delivers to exactly whom the graph says can hear the sender', () => {
    for (const phase of ['NIGHT_MAFIA', 'DAY', 'VOTE'] as Phase[]) {
      const doc = at(phase);
      const game = doc.game;
      if (game === null) throw new Error('no game');
      const graph = computeAudioGraph(game);

      for (const sender of doc.members.map((m) => m.playerId)) {
        const audible = [...(graph.get(sender) ?? [])].sort();
        if (audible.length === 0) continue;

        const posted = postChat(doc, sender, 'hello', NOW);
        // Everyone except the sender is exactly the audio audience — identical
        // sets, not merely overlapping. One routing rule, two transports. The
        // sender's own echo is the only difference, and it discloses nothing.
        const others = recipients(posted, sender)
          .filter((id) => id !== sender)
          .sort();
        expect(others, `${phase} / ${sender}`).toEqual(audible.filter((id) => id !== sender));
      }
    }
  });

  it('keeps a mafia night message inside the mafia channel', () => {
    const doc = at('NIGHT_MAFIA');
    const mafia = holderOf(doc, 'MAFIA');

    const heard = recipients(postChat(doc, mafia, 'taking the doctor', NOW), mafia);

    expect(heard).toContain(mafia);
    expect(heard).toContain(GM);
    expect(heard).not.toContain(holderOf(doc, 'DOCTOR'));
    expect(heard).not.toContain(holderOf(doc, 'DETECTIVE'));
  });

  it('gives the doctor and detective nobody to talk to at night', () => {
    const doc = at('NIGHT_MAFIA');

    for (const role of ['DOCTOR', 'DETECTIVE'] as Role[]) {
      expect(() => postChat(doc, holderOf(doc, role), 'anyone there', NOW), role).toThrow();
    }
  });

  it('opens the day to every living player', () => {
    const doc = at('DAY');
    const speaker = doc.game?.players.find((p) => p.alive)?.id ?? '';

    const heard = recipients(postChat(doc, speaker, 'mic dead, voting Musa', NOW), speaker);

    for (const player of doc.game?.players.filter((p) => p.alive) ?? []) {
      expect(heard, player.id).toContain(player.id);
    }
    expect(heard).toContain(GM);
  });

  it('never lets the dead speak to the living', () => {
    let doc = at('DAY');
    const victim = doc.game?.players.find((p) => p.alive && p.id !== GM)?.id ?? '';
    doc = forceKill(doc, GM, victim);

    // The graph gives a dead player no audience, so there is nobody to deliver to.
    expect(() => postChat(doc, victim, 'it was Ada', NOW)).toThrow();
  });

  it('lets the GM reach the room in every phase', () => {
    for (const phase of ['NIGHT_MAFIA', 'DAY', 'VOTE'] as Phase[]) {
      const doc = at(phase);
      const heard = recipients(postChat(doc, GM, 'thirty seconds', NOW), GM);

      // The GM is audible to everyone, always — chat inherits that unchanged.
      for (const member of doc.members) expect(heard, `${phase} / ${member.playerId}`).toContain(member.playerId);
    }
  });

  it('shows the GM every channel, including the mafia’s', () => {
    const doc = at('NIGHT_MAFIA');
    const mafia = holderOf(doc, 'MAFIA');

    const posted = postChat(doc, mafia, 'taking the doctor', NOW);

    expect(chatFor(posted, GM).map((m) => m.text)).toContain('taking the doctor');
  });
});

describe('chat is scoped to the phase it was sent in', () => {
  it('is gone the moment the phase changes', () => {
    let doc = at('DAY');
    const speaker = doc.game?.players.find((p) => p.alive)?.id ?? '';
    doc = postChat(doc, speaker, 'mic dead', NOW);
    expect(chatFor(doc, speaker)).toHaveLength(1);

    doc = advanceGame(doc, GM, NOW + 1000);

    expect(chatFor(doc, speaker)).toHaveLength(0);
  });

  it('does not come back when the phase comes round again', () => {
    let doc = at('DAY');
    const speaker = doc.game?.players.find((p) => p.alive)?.id ?? '';
    doc = postChat(doc, speaker, 'first day', NOW);

    // All the way round to the next DAY.
    for (let i = 0; i < 12 && !(doc.game?.phase === 'DAY' && chatFor(doc, speaker).length === 0); i += 1) {
      doc = advanceGame(doc, GM, NOW + (i + 1) * 1000);
    }

    expect(chatFor(doc, speaker).map((m) => m.text)).not.toContain('first day');
  });
});

describe('the message itself', () => {
  it('refuses more than 140 characters', () => {
    const doc = at('DAY');
    const speaker = doc.game?.players.find((p) => p.alive)?.id ?? '';

    expect(MAX_CHAT_CHARS).toBe(140);
    expect(() => postChat(doc, speaker, 'x'.repeat(MAX_CHAT_CHARS + 1), NOW)).toThrow();
    expect(() => postChat(doc, speaker, 'x'.repeat(MAX_CHAT_CHARS), NOW)).not.toThrow();
  });

  it('refuses an empty message', () => {
    const doc = at('DAY');
    const speaker = doc.game?.players.find((p) => p.alive)?.id ?? '';

    expect(() => postChat(doc, speaker, '   ', NOW)).toThrow();
  });

  it('refuses chat before there is a game to scope it to', () => {
    const lobbyOnly: RoomDocument = { ...started(), game: null };

    // One routing rule or none: without a graph there is nothing to route by.
    expect(() => postChat(lobbyOnly, 'p2', 'hello', NOW)).toThrow();
  });

  it('carries the sender’s crew name, never their role', () => {
    const doc = at('NIGHT_MAFIA');
    const mafia = holderOf(doc, 'MAFIA');

    const [message] = chatFor(postChat(doc, mafia, 'go', NOW), GM);
    if (message === undefined) throw new Error('no message');

    expect(message.senderName).toMatch(/^Player /);
    // The phase is legitimately called NIGHT_MAFIA, so the check is on what the
    // message carries about its sender, not on the substring anywhere in it.
    const { phase: _phase, ...carried } = message;
    for (const role of ['MAFIA', 'DOCTOR', 'DETECTIVE', 'VILLAGER']) {
      expect(JSON.stringify(carried), role).not.toContain(role);
    }
  });
});

describe('the durable strip', () => {
  it('records deaths with how they happened, and survives the phase', () => {
    let doc = at('DAY');
    const victim = doc.game?.players.find((p) => p.alive && p.id !== GM)?.id ?? '';
    doc = forceKill(doc, GM, victim);

    const before = systemRecord(doc);
    doc = advanceGame(doc, GM, NOW + 1000);

    expect(before.some((e) => e.text.includes('Player') && e.text.includes('removed'))).toBe(true);
    // Chat clears at the transition; the record is the thing that does not.
    expect(systemRecord(doc).length).toBeGreaterThanOrEqual(before.length);
  });

  it('is factual only — never a role, never a claim', () => {
    let doc = at('DAY');
    const victim = doc.game?.players.find((p) => p.alive && p.id !== GM)?.id ?? '';
    doc = forceKill(doc, GM, victim);

    const wire = JSON.stringify(systemRecord(doc));

    for (const role of ['MAFIA', 'DOCTOR', 'DETECTIVE', 'VILLAGER']) {
      expect(wire, role).not.toContain(role);
    }
  });
});
