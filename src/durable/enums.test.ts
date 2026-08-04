import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Cause, Role, Team } from '../game-core/index.js';

/**
 * game-core is pure TypeScript and knows nothing about Postgres, so nothing
 * makes these two definitions agree at compile time. A drift would surface as a
 * failed INSERT at game end — the one moment the record matters and the one
 * place there is no retry. So the schema is read and compared as text.
 */
const SCHEMA = readFileSync('prisma/schema.prisma', 'utf8');

function enumValues(name: string): string[] {
  const block = new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(SCHEMA);
  if (block?.[1] === undefined) throw new Error(`no enum ${name} in schema.prisma`);
  return block[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('//'));
}

// Written out longhand rather than derived, so a change to game-core's unions
// has to be made here too — deliberately, not silently.
const GAME_CORE_ROLES: Role[] = ['VILLAGER', 'MAFIA', 'DOCTOR', 'DETECTIVE'];
const GAME_CORE_TEAMS: Team[] = ['TOWN', 'MAFIA'];
const GAME_CORE_CAUSES: Cause[] = ['VOTE', 'MAFIA', 'GM'];

describe('the durable enums match game-core exactly', () => {
  it('Role', () => {
    expect(enumValues('Role').sort()).toEqual([...GAME_CORE_ROLES].sort());
  });

  it('Team, which is what winner is written as', () => {
    expect(enumValues('Team').sort()).toEqual([...GAME_CORE_TEAMS].sort());
  });

  it('Cause, including the GM override added in step 5', () => {
    expect(enumValues('Cause').sort()).toEqual([...GAME_CORE_CAUSES].sort());
    expect(enumValues('Cause'), 'a GM correction is not a lynch').toContain('GM');
  });

  it('records the seed, so a finished game can be replayed', () => {
    expect(SCHEMA).toMatch(/seed\s+BigInt/);
  });

  it('keeps the GM out of SessionPlayer and on the Session', () => {
    const sessionPlayer = /model SessionPlayer \{([^}]*)\}/.exec(SCHEMA)?.[1] ?? '';

    expect(SCHEMA).toMatch(/gmPlayerId\s+String/);
    expect(sessionPlayer, 'the GM holds no role, so has no row here').not.toContain('gmPlayerId');
  });
});
