import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { advanceGame } from '../room-store/commands.js';
import { MIN_LOBBY_TO_START } from '../room-store/keys.js';
import { joinLobby, startSession } from '../room-store/lobby.js';
import { projectRoom } from '../room-store/project-room.js';
import type { RoomDocument } from '../room-store/types.js';

const NOW = 1_700_000_000_000;

function playedGame(): RoomDocument {
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
    doc = joinLobby(doc, { playerId: `p${String(i)}`, displayName: `Player ${String(i)}`, now: NOW });
  }
  return advanceGame(startSession(doc, 'p1', { seed: 4242, now: NOW }), 'p1', NOW);
}

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) found.push(path);
  }
  return found;
}

describe('an address never reaches another player', () => {
  it('is absent from every projection of a live game', () => {
    const doc = playedGame();

    for (const member of doc.members) {
      // Serialized, not typed access: a field can be present on the wire while
      // the type says otherwise, and the wire is what the other player receives.
      const wire = JSON.stringify(projectRoom(doc, member.playerId));

      expect(wire, member.playerId).not.toContain('@');
      expect(wire.toLowerCase(), member.playerId).not.toContain('email');
    }
  });

  it('is absent from the room document the projection is built from', () => {
    // If it were never stored in live state it cannot leak from it. Postgres is
    // the only place an address lives.
    expect(JSON.stringify(playedGame()).toLowerCase()).not.toContain('email');
  });
});

describe('claim is never a gate', () => {
  const JOIN_PATH = join('src', 'app', 'api', 'crew', '[code]', 'join', 'route.ts');

  it('the join route knows nothing about addresses or codes', () => {
    const source = readFileSync(JOIN_PATH, 'utf8');

    // Crew link, name, mic, play. An import from the OTP module here would be
    // the first step towards an email field in the join path.
    expect(source).not.toMatch(/@\/otp|from '.*\/otp/);
    expect(source.toLowerCase()).not.toContain('email');
  });

  it('nothing in the join or lobby path imports the OTP module', () => {
    const gated = ['src/room-store', 'src/realtime', 'src/game-core', 'src/voice'];
    const offenders: string[] = [];

    for (const dir of gated) {
      for (const file of sourceFiles(dir)) {
        if (file.endsWith('.test.ts')) continue;
        if (/from '.*otp/.test(readFileSync(file, 'utf8'))) offenders.push(file);
      }
    }

    // Playing a game must not depend on the claim being configured at all.
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('the claim UI lives only on the debrief, after the game is over', () => {
    const offenders = sourceFiles(join('src', 'app'))
      .filter((f) => !f.endsWith('.test.ts') && !f.includes('api'))
      .filter((f) => /ClaimCard|request-code|identity\/claim/.test(readFileSync(f, 'utf8')))
      .filter((f) => !/Debrief|ClaimCard/.test(f));

    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
