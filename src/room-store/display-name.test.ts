import { describe, expect, it } from 'vitest';
import { parseDisplayName } from './display-name.js';
import { joinLobby } from './lobby.js';
import type { RoomDocument } from './types.js';

const NOW = 1_700_000_000_000;
const CREW = 'UYD7GF';

const room = (): RoomDocument => ({
  version: 1,
  crewCode: CREW,
  createdAt: NOW,
  expiresAt: NOW + 90 * 60 * 1000,
  gmPlayerId: null,
  members: [],
  seed: null,
  voiceEnabled: true,
  reservedMinutes: 0,
  game: null,
});

describe('display names', () => {
  it('keeps what the player typed, and never the crew code', () => {
    const typed = parseDisplayName('Toniey', CREW);
    const doc = joinLobby(room(), { playerId: 'p1', displayName: typed ?? '', now: NOW });

    expect(typed).toBe('Toniey');
    expect(doc.members[0]?.displayName).toBe('Toniey');
    expect(doc.members[0]?.displayName).not.toBe(CREW);
  });

  it('rejects the crew code as a name, however it got into the field', () => {
    expect(parseDisplayName(CREW, CREW)).toBeNull();
    expect(parseDisplayName(CREW.toLowerCase(), CREW)).toBeNull();
    expect(parseDisplayName(`  ${CREW}  `, CREW)).toBeNull();
  });

  it('rejects an absent or empty name rather than substituting one', () => {
    expect(parseDisplayName('', CREW)).toBeNull();
    expect(parseDisplayName('   ', CREW)).toBeNull();
    expect(parseDisplayName(undefined, CREW)).toBeNull();
    expect(parseDisplayName(null, CREW)).toBeNull();
    expect(parseDisplayName(42, CREW)).toBeNull();
  });

  it('trims and caps what it accepts', () => {
    expect(parseDisplayName('  Ada  ', CREW)).toBe('Ada');
    expect(parseDisplayName('x'.repeat(50), CREW)).toHaveLength(24);
  });

  it('still allows a name that merely contains the code', () => {
    expect(parseDisplayName(`${CREW} fan`, CREW)).toBe(`${CREW} fan`);
  });
});
