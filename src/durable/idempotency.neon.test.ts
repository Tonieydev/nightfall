import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeSession } from './write-session.js';
import type { SessionRecord } from './record.js';

/**
 * Runs against a real database, because the property under test is one only a
 * real database has: foreign keys. The fake client in write-session.test.ts
 * enforces nothing, which is exactly why it certified a write that Neon refused.
 *
 * Gated on an explicit opt-in rather than on DATABASE_URL alone: importing
 * @prisma/client loads .env as a side effect, so DATABASE_URL is never absent
 * here and could not gate anything. `pnpm test` must not touch the shared
 * dev/prod database. Run this deliberately:  pnpm test:neon
 */
const OPTED_IN = process.env['NIGHTFALL_TEST_NEON'] === '1';
const DATABASE_URL = process.env['DATABASE_URL'];
const suite =
  OPTED_IN && DATABASE_URL !== undefined && DATABASE_URL !== '' ? describe : describe.skip;

/** A real round-trip to Neon, several statements deep. The 5s default is not enough. */
const NEON_TIMEOUT = 30_000;

/** Unmistakably test data, and far longer than the 6-char crew codes. */
const RUN = String(Date.now());
const ALIGNED_CODE = `TEST-IDEMPOTENCY-ALIGNED-${RUN}`;
const DIVERGED_CODE = `TEST-IDEMPOTENCY-DIVERGED-${RUN}`;
const ROLLBACK_CODE = `TEST-IDEMPOTENCY-ROLLBACK-${RUN}`;
const CODES = [ALIGNED_CODE, DIVERGED_CODE, ROLLBACK_CODE];

const player = (n: string): string => `test-player-${RUN}-${n}`;
const MEMBERS = ['gm', 'a', 'b', 'c', 'd', 'e'].map((n) => ({
  playerId: player(n),
  displayName: `Player ${n}`,
}));

function recordFor(crewCode: string): SessionRecord {
  return {
    sessionId: `${crewCode}:1700000000000`,
    crewCode,
    gmPlayerId: player('gm'),
    seed: 4242n,
    startedAt: new Date(1_700_000_000_000),
    endedAt: new Date(1_700_002_400_000),
    seatCount: 6,
    winner: 'TOWN',
    config: { mafiaCount: null, doctor: true, detective: true, mafiaNightMs: 45_000 },
    members: MEMBERS,
    players: [
      { playerId: player('a'), role: 'MAFIA', survived: false, eliminatedAtPhase: 2, eliminatedBy: 'VOTE', wasWinner: false },
      { playerId: player('b'), role: 'DOCTOR', survived: true, eliminatedAtPhase: null, eliminatedBy: null, wasWinner: true },
      { playerId: player('c'), role: 'DETECTIVE', survived: true, eliminatedAtPhase: null, eliminatedBy: null, wasWinner: true },
      { playerId: player('d'), role: 'VILLAGER', survived: false, eliminatedAtPhase: 1, eliminatedBy: 'MAFIA', wasWinner: true },
      { playerId: player('e'), role: 'VILLAGER', survived: true, eliminatedAtPhase: null, eliminatedBy: null, wasWinner: true },
    ],
  };
}

const prisma = new PrismaClient();

async function cleanup(): Promise<void> {
  // Cascades take the memberships, sessions and session players with them.
  await prisma.crew.deleteMany({ where: { code: { in: CODES } } });
  await prisma.session.deleteMany({ where: { roomCode: { in: CODES } } });
  await prisma.player.deleteMany({ where: { id: { startsWith: `test-player-${RUN}-` } } });
}

async function countsFor(crewCode: string): Promise<{
  crews: number;
  memberships: number;
  sessions: number;
  sessionPlayers: number;
}> {
  const crew = await prisma.crew.findUnique({ where: { code: crewCode } });
  const sessions = await prisma.session.findMany({ where: { roomCode: crewCode } });
  return {
    crews: crew === null ? 0 : 1,
    memberships:
      crew === null ? 0 : await prisma.crewMembership.count({ where: { crewId: crew.code } }),
    sessions: sessions.length,
    sessionPlayers: await prisma.sessionPlayer.count({
      where: { sessionId: { in: sessions.map((s) => s.id) } },
    }),
  };
}

suite('the durable write against real Postgres', () => {
  beforeAll(async () => {
    await cleanup();

    // A crew that already exists before any session is written to it. This
    // used to be the shape that broke the write, back when Crew.id was a
    // separate uuid free to disagree with the code.
    await prisma.crew.create({
      data: { code: DIVERGED_CODE, name: DIVERGED_CODE, hostPlayerId: player('gm') },
    });
  }, NEON_TIMEOUT);

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  }, NEON_TIMEOUT);

  it('writes a first-time record end to end', async () => {
    await writeSession(prisma, recordFor(ALIGNED_CODE));

    expect(await countsFor(ALIGNED_CODE)).toEqual({
      crews: 1,
      memberships: 6,
      sessions: 1,
      sessionPlayers: 5,
    });
  }, NEON_TIMEOUT);

  it('is a no-op on the second fire — one session, no duplicates, no crash', async () => {
    await writeSession(prisma, recordFor(ALIGNED_CODE));
    await writeSession(prisma, recordFor(ALIGNED_CODE));

    expect(await countsFor(ALIGNED_CODE)).toEqual({
      crews: 1,
      memberships: 6,
      sessions: 1,
      sessionPlayers: 5,
    });
  }, NEON_TIMEOUT);

  it('writes to a crew that already existed', async () => {
    // This once threw P2003 on CrewMembership_crewId_fkey: the write invented
    // crewId = crewCode for a row whose id was a uuid. The write stopped
    // inventing keys, and then the schema stopped allowing the divergence at
    // all — the crew code is the primary key, so there is no second identity
    // left to disagree with.
    await writeSession(prisma, recordFor(DIVERGED_CODE));

    const crew = await prisma.crew.findUnique({ where: { code: DIVERGED_CODE } });
    expect(crew?.code).toBe(DIVERGED_CODE);
    expect(Object.keys(crew ?? {}), 'a separate id would be a way back to the bug').not.toContain(
      'id',
    );
    expect(await countsFor(DIVERGED_CODE)).toEqual({
      crews: 1,
      memberships: 6,
      sessions: 1,
      sessionPlayers: 5,
    });
  }, NEON_TIMEOUT);

  it('replays against a pre-existing crew without duplicating anything', async () => {
    await writeSession(prisma, recordFor(DIVERGED_CODE));
    await writeSession(prisma, recordFor(DIVERGED_CODE));

    expect(await countsFor(DIVERGED_CODE)).toEqual({
      crews: 1,
      memberships: 6,
      sessions: 1,
      sessionPlayers: 5,
    });
  }, NEON_TIMEOUT);

  it('rolls the whole record back rather than leaving half of it', async () => {
    const broken = recordFor(ROLLBACK_CODE);
    // A session player referencing a player nobody wrote: the FK must reject it.
    broken.players = [
      { playerId: 'test-player-does-not-exist', role: 'MAFIA', survived: true, eliminatedAtPhase: null, eliminatedBy: null, wasWinner: false },
    ];

    await expect(writeSession(prisma, broken)).rejects.toThrow();

    // Nothing partial survived — not even the crew, which was written first.
    expect(await prisma.crew.findUnique({ where: { code: broken.crewCode } })).toBeNull();
  }, NEON_TIMEOUT);
});
