import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { afterAll, describe, expect, it } from 'vitest';

/**
 * Proves the crew-code-PK migration's abort guard before it is ever run for
 * real. Everything here happens inside a transaction that is always rolled
 * back — this is the shared dev/prod database, and the whole point of the
 * exercise is that a half-applied migration must be impossible.
 */
const OPTED_IN = process.env['NIGHTFALL_TEST_NEON'] === '1';
const DIRECT_URL = process.env['DIRECT_URL'];
const suite =
  OPTED_IN && DIRECT_URL !== undefined && DIRECT_URL !== '' ? describe : describe.skip;

const NEON_TIMEOUT = 60_000;

// The unpooled endpoint: this test issues DDL inside an interactive
// transaction, which is exactly what PgBouncer in transaction mode is worst at.
const prisma = new PrismaClient({ datasourceUrl: DIRECT_URL ?? '' });

const MIGRATION = readFileSync(
  join('prisma', 'migrations', '20260804200000_crew_code_is_the_primary_key', 'migration.sql'),
  'utf8',
);

/**
 * The guard, read out of the real migration rather than copied. The
 * reconciliation beside it (`UPDATE "Crew" SET "id" = "code"`) cannot be
 * re-run now that the column is gone — it was proved against the live database
 * before the migration was applied, and this is what remains testable.
 */
const GUARD = MIGRATION.slice(MIGRATION.indexOf('DO $$'), MIGRATION.indexOf('END $$;') + 7);

const RUN = String(Date.now());
const GHOST = `TEST-PK-GHOST-${RUN}`;

suite('the migration cannot leave the database half-changed', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  }, NEON_TIMEOUT);

  it('extracted the guard from the real migration file, not a copy', () => {
    expect(GUARD).toContain('RAISE EXCEPTION');
    expect(GUARD).toContain('CrewMembership');
    expect(GUARD).toContain('Session');
    // The reconciliation had to come before the constraints were dropped, or
    // the ON UPDATE CASCADE that carried the children along was already gone.
    // Recorded here because it is the whole reason the migration was safe.
    expect(MIGRATION.indexOf('UPDATE "Crew" SET "id" = "code"')).toBeLessThan(
      MIGRATION.indexOf('DropForeignKey'),
    );
  });

  it('raises when a child references a crew that would not survive', async () => {
    const attempt = prisma.$transaction(
      async (tx) => {
        // Strand a membership deliberately. The foreign key would normally make
        // this impossible, which is why it comes off first — inside the
        // transaction, so it is restored by the rollback either way.
        await tx.$executeRawUnsafe(
          'ALTER TABLE "CrewMembership" DROP CONSTRAINT "CrewMembership_crewId_fkey"',
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO "Player" ("id") VALUES ('${GHOST}-player') ON CONFLICT DO NOTHING`,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO "CrewMembership" ("id", "crewId", "playerId", "displayName")
           VALUES ('${GHOST}-m', '${GHOST}-nowhere', '${GHOST}-player', 'Ghost')`,
        );

        await tx.$executeRawUnsafe(GUARD);
        return 'the guard did not fire';
      },
      { timeout: 30_000, maxWait: 10_000 },
    );

    await expect(attempt).rejects.toThrow(/reference a crew that would not survive/);
  }, NEON_TIMEOUT);

  it('left nothing behind when it rolled back', async () => {
    expect(await prisma.crewMembership.count({ where: { id: `${GHOST}-m` } })).toBe(0);
    expect(await prisma.player.count({ where: { id: `${GHOST}-player` } })).toBe(0);
  }, NEON_TIMEOUT);

  it('finds nothing stranded now that the migration has run', async () => {
    const [row] = await prisma.$queryRawUnsafe<{ n: number }[]>(`
      SELECT count(*)::int AS n FROM (
        SELECT cm."crewId" FROM "CrewMembership" cm
          LEFT JOIN "Crew" c ON c."code" = cm."crewId" WHERE c."code" IS NULL
        UNION ALL
        SELECT s."crewId" FROM "Session" s
          LEFT JOIN "Crew" c ON c."code" = s."crewId" WHERE c."code" IS NULL
      ) o`);

    expect(row?.n).toBe(0);
  }, NEON_TIMEOUT);

  it('restored the foreign key the guard test dropped', async () => {
    const rows = await prisma.$queryRawUnsafe<{ conname: string }[]>(
      `SELECT conname FROM pg_constraint WHERE conname = 'CrewMembership_crewId_fkey'`,
    );

    expect(rows).toHaveLength(1);
  }, NEON_TIMEOUT);

  it('passes the guard against the live data', async () => {
    await expect(prisma.$executeRawUnsafe(GUARD)).resolves.toBeDefined();
  }, NEON_TIMEOUT);
});
