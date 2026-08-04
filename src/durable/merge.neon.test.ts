import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { mergePlayers } from './merge.js';

/**
 * The merge is a set of constraint problems — @@unique([crewId, playerId]) and
 * @@unique([sessionId, playerId]) both stand directly in its way — so the fake
 * client cannot test it at all. Only a real database enforces the thing that
 * makes this hard.
 *
 * Opt-in: `pnpm test:neon`. See the note in idempotency.neon.test.ts.
 */
const OPTED_IN = process.env['NIGHTFALL_TEST_NEON'] === '1';
const DATABASE_URL = process.env['DATABASE_URL'];
const suite =
  OPTED_IN && DATABASE_URL !== undefined && DATABASE_URL !== '' ? describe : describe.skip;

const NEON_TIMEOUT = 30_000;
const RUN = String(Date.now());
const prefix = `TEST-MERGE-${RUN}`;
const CANONICAL = `${prefix}-canonical`;
const ORPHAN = `${prefix}-orphan`;

const prisma = new PrismaClient();

const EARLIER = new Date('2026-01-01T00:00:00Z');
const LATER = new Date('2026-06-01T00:00:00Z');

async function cleanup(): Promise<void> {
  await prisma.crew.deleteMany({ where: { code: { startsWith: prefix } } });
  await prisma.session.deleteMany({ where: { roomCode: { startsWith: prefix } } });
  await prisma.player.deleteMany({ where: { id: { startsWith: prefix } } });
}

/** A crew with a session, and whichever of the two players the test asks for. */
async function seedCrew(
  suffix: string,
  members: { playerId: string; joinedAt: Date; displayName: string }[],
  played: string[] = [],
): Promise<{ crewId: string; sessionId: string }> {
  const code = `${prefix}-crew-${suffix}`;
  const crew = await prisma.crew.create({
    data: { code, name: code, hostPlayerId: CANONICAL },
  });
  const session = await prisma.session.create({
    data: {
      id: `${code}:session`,
      crewId: crew.code,
      roomCode: code,
      gmPlayerId: CANONICAL,
      seed: 1n,
      startedAt: EARLIER,
      endedAt: EARLIER,
      seatCount: 6,
      winner: 'TOWN',
      config: {},
    },
  });
  for (const m of members) {
    await prisma.crewMembership.create({
      data: { crewId: crew.code, playerId: m.playerId, displayName: m.displayName, joinedAt: m.joinedAt },
    });
  }
  for (const playerId of played) {
    await prisma.sessionPlayer.create({
      data: { sessionId: session.id, playerId, role: 'VILLAGER', survived: true, wasWinner: true },
    });
  }
  return { crewId: crew.code, sessionId: session.id };
}

suite('merging two identities that turned out to be one person', () => {
  beforeEach(async () => {
    await cleanup();
    await prisma.player.createMany({
      data: [
        { id: CANONICAL, email: `${prefix}@example.com`, emailClaimedAt: EARLIER },
        { id: ORPHAN },
      ],
    });
  }, NEON_TIMEOUT);

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  }, NEON_TIMEOUT);

  it('moves history from a crew the canonical player was never in', async () => {
    const { crewId, sessionId } = await seedCrew(
      'solo',
      [{ playerId: ORPHAN, joinedAt: LATER, displayName: 'Ada' }],
      [ORPHAN],
    );

    await mergePlayers(prisma, { orphanId: ORPHAN, canonicalId: CANONICAL });

    expect(await prisma.crewMembership.findMany({ where: { crewId } })).toMatchObject([
      { playerId: CANONICAL, displayName: 'Ada' },
    ]);
    expect(await prisma.sessionPlayer.findMany({ where: { sessionId } })).toMatchObject([
      { playerId: CANONICAL },
    ]);
  }, NEON_TIMEOUT);

  it('keeps the older membership when both played the same crew', async () => {
    // The collision @@unique([crewId, playerId]) forbids: one crew, both rows.
    const { crewId } = await seedCrew('shared', [
      { playerId: CANONICAL, joinedAt: EARLIER, displayName: 'Ada' },
      { playerId: ORPHAN, joinedAt: LATER, displayName: 'Ada on the new phone' },
    ]);

    await mergePlayers(prisma, { orphanId: ORPHAN, canonicalId: CANONICAL });

    const memberships = await prisma.crewMembership.findMany({ where: { crewId } });
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({ playerId: CANONICAL, displayName: 'Ada' });
    expect(memberships[0]?.joinedAt).toEqual(EARLIER);
  }, NEON_TIMEOUT);

  it('keeps the orphan’s membership when it is the older of the two', async () => {
    // The device that joined first is the one with the real history, whichever
    // row later happened to hold the email.
    const { crewId } = await seedCrew('older-orphan', [
      { playerId: CANONICAL, joinedAt: LATER, displayName: 'Ada on the new phone' },
      { playerId: ORPHAN, joinedAt: EARLIER, displayName: 'Ada' },
    ]);

    await mergePlayers(prisma, { orphanId: ORPHAN, canonicalId: CANONICAL });

    const memberships = await prisma.crewMembership.findMany({ where: { crewId } });
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({ playerId: CANONICAL, displayName: 'Ada' });
    expect(memberships[0]?.joinedAt).toEqual(EARLIER);
  }, NEON_TIMEOUT);

  it('does not duplicate a session both rows somehow recorded', async () => {
    const { sessionId } = await seedCrew(
      'same-session',
      [
        { playerId: CANONICAL, joinedAt: EARLIER, displayName: 'Ada' },
        { playerId: ORPHAN, joinedAt: LATER, displayName: 'Ada' },
      ],
      [CANONICAL, ORPHAN],
    );

    await mergePlayers(prisma, { orphanId: ORPHAN, canonicalId: CANONICAL });

    const rows = await prisma.sessionPlayer.findMany({ where: { sessionId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.playerId).toBe(CANONICAL);
  }, NEON_TIMEOUT);

  it('soft-deletes the orphan and points it at where its history went', async () => {
    await seedCrew('soft', [{ playerId: ORPHAN, joinedAt: LATER, displayName: 'Ada' }]);

    await mergePlayers(prisma, { orphanId: ORPHAN, canonicalId: CANONICAL });

    const orphan = await prisma.player.findUnique({ where: { id: ORPHAN } });
    const canonical = await prisma.player.findUnique({ where: { id: CANONICAL } });
    // The row survives: it is what makes the merge auditable and reversible.
    expect(orphan).not.toBeNull();
    expect(orphan?.mergedIntoId).toBe(CANONICAL);
    expect(orphan?.deletedAt).not.toBeNull();
    expect(canonical?.email).toBe(`${prefix}@example.com`);
    expect(canonical?.deletedAt).toBeNull();
  }, NEON_TIMEOUT);

  it('leaves nothing behind pointing at the orphan', async () => {
    await seedCrew(
      'nothing-left',
      [
        { playerId: CANONICAL, joinedAt: EARLIER, displayName: 'Ada' },
        { playerId: ORPHAN, joinedAt: LATER, displayName: 'Ada' },
      ],
      [ORPHAN],
    );
    await seedCrew('nothing-left-2', [{ playerId: ORPHAN, joinedAt: LATER, displayName: 'Ada' }], [ORPHAN]);

    await mergePlayers(prisma, { orphanId: ORPHAN, canonicalId: CANONICAL });

    expect(await prisma.crewMembership.count({ where: { playerId: ORPHAN } })).toBe(0);
    expect(await prisma.sessionPlayer.count({ where: { playerId: ORPHAN } })).toBe(0);
  }, NEON_TIMEOUT);

  it('is one transaction — a failure leaves the history where it was', async () => {
    const { crewId } = await seedCrew('rollback', [
      { playerId: ORPHAN, joinedAt: LATER, displayName: 'Ada' },
    ]);

    // No such canonical row, so the soft-delete's foreign key must reject it.
    await expect(
      mergePlayers(prisma, { orphanId: ORPHAN, canonicalId: `${prefix}-nobody` }),
    ).rejects.toThrow();

    const memberships = await prisma.crewMembership.findMany({ where: { crewId } });
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.playerId, 'reassignment must have rolled back').toBe(ORPHAN);
  }, NEON_TIMEOUT);

  it('refuses to merge away a row that holds its own claimed address', async () => {
    await prisma.player.update({
      where: { id: ORPHAN },
      data: { email: `${prefix}-other@example.com`, emailClaimedAt: LATER },
    });

    // Two claimed addresses are two people, or one person's mistake. Either way
    // it is not something to resolve by silently discarding one of them.
    await expect(
      mergePlayers(prisma, { orphanId: ORPHAN, canonicalId: CANONICAL }),
    ).rejects.toThrow(/claimed/i);
  }, NEON_TIMEOUT);

  it('refuses to merge a player into itself', async () => {
    await expect(
      mergePlayers(prisma, { orphanId: CANONICAL, canonicalId: CANONICAL }),
    ).rejects.toThrow();
  }, NEON_TIMEOUT);
});
