import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { domainErrorCode } from './errors.js';

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, found);
    else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) found.push(path);
  }
  return found;
}

/**
 * Next bundles the route handlers through webpack while the custom server loads
 * the same files through tsx. One process, two module registries, so each has
 * its own copy of every error class. `vi.resetModules()` reproduces exactly
 * that: a second import of the same file yields a second, unrelated class.
 */
async function twoRegistries(): Promise<[typeof import('./index.js'), typeof import('./index.js')]> {
  vi.resetModules();
  const server = await import('./index.js');
  vi.resetModules();
  const bundled = await import('./index.js');
  return [server, bundled];
}

describe('domain errors across the module boundary', () => {
  it('really does produce two unrelated copies of the same class', async () => {
    const [server, bundled] = await twoRegistries();

    expect(server.RoomCeilingReachedError).not.toBe(bundled.RoomCeilingReachedError);
  });

  it('instanceof cannot see across it — this is the bug, not the fix', async () => {
    const [server, bundled] = await twoRegistries();
    const thrown = new server.RoomCeilingReachedError(8);

    // Every route that discriminated with instanceof fell through to a 500 here.
    expect(thrown instanceof bundled.RoomCeilingReachedError).toBe(false);
  });

  it('the code survives what instanceof does not', async () => {
    const [server, bundled] = await twoRegistries();
    const thrown = new server.RoomCeilingReachedError(8);

    expect(thrown instanceof bundled.RoomCeilingReachedError).toBe(false);
    expect(domainErrorCode(thrown)).toBe('ROOM_CEILING');
  });

  it('gives every domain error a distinct code, whichever registry built it', async () => {
    const [server] = await twoRegistries();
    const cases: [Error, string][] = [
      [new server.RoomCeilingReachedError(8), 'ROOM_CEILING'],
      [new server.KillSwitchError(), 'KILL_SWITCH'],
      [new server.RoomFullError(), 'ROOM_FULL'],
      [new server.SessionAlreadyStartedError(), 'SESSION_ALREADY_STARTED'],
      [new server.NotEnoughPlayersError(3), 'NOT_ENOUGH_PLAYERS'],
      [new server.NotAMemberError('p1'), 'NOT_A_MEMBER'],
      [new server.NotGmError('p1'), 'NOT_GM'],
      [new server.GameNotStartedError(), 'GAME_NOT_STARTED'],
      [new server.NotAPlayerError('p1'), 'NOT_A_PLAYER'],
      [new server.NothingToRevertError(), 'NOTHING_TO_REVERT'],
      [new server.NotYourActionError('p1', 'DOCTOR'), 'NOT_YOUR_ACTION'],
      [new server.WrongPhaseError('DAY', 'NIGHT_MAFIA'), 'WRONG_PHASE'],
      [new server.InvalidTargetError('p9'), 'INVALID_TARGET'],
      [new server.CrewCodeExhaustedError(20), 'CREW_CODE_EXHAUSTED'],
      [new server.MinuteBudgetExceededError(4400, 1080, 4500), 'MINUTE_BUDGET_EXCEEDED'],
      [new server.RoomNotFoundError('ABC234'), 'ROOM_NOT_FOUND'],
      [new server.VersionConflictError('ABC234'), 'VERSION_CONFLICT'],
    ];

    for (const [error, code] of cases) {
      expect(domainErrorCode(error), error.name).toBe(code);
    }
    expect(new Set(cases.map(([, code]) => code)).size, 'codes must be distinct').toBe(cases.length);
  });

  it('leaves no instanceof check on a domain error anywhere in the tree', () => {
    // A guard, not a style rule: every one of these compiles, passes review and
    // then silently returns false in production.
    const offenders: string[] = [];

    for (const file of sourceFiles('src')) {
      if (file.endsWith('module-boundary.test.ts')) continue;
      const lines = readFileSync(file, 'utf8').split('\n');

      lines.forEach((line, index) => {
        const code = line.trim();
        if (code.startsWith('*') || code.startsWith('//') || code.startsWith('/*')) return;

        // `instanceof Error` is fine — Error is a realm global, one per process.
        const match = /instanceof\s+([A-Z]\w*(?:Error|Exceeded))\b/.exec(code);
        if (match !== null && match[1] !== 'Error') {
          offenders.push(`${file}:${String(index + 1)}  ${code}`);
        }
      });
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('does not mistake a foreign error that happens to carry a code', async () => {
    // Node stamps `code` on its own errors. ENOENT is not a domain error, and
    // treating it as one would turn a real fault into a polite 503.
    const nodeError = Object.assign(new Error('no such file'), { code: 'ENOENT' });

    expect(domainErrorCode(nodeError)).toBeNull();
    expect(domainErrorCode(new Error('plain'))).toBeNull();
    expect(domainErrorCode(null)).toBeNull();
    expect(domainErrorCode('ROOM_CEILING')).toBeNull();
  });
});
