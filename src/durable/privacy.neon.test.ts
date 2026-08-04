import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { claimIdentity } from './claim.js';
import { deleteIdentity, leaveCrew } from './privacy.js';

const OPTED_IN = process.env['NIGHTFALL_TEST_NEON'] === '1';
const DATABASE_URL = process.env['DATABASE_URL'];
const suite =
  OPTED_IN && DATABASE_URL !== undefined && DATABASE_URL !== '' ? describe : describe.skip;

const NEON_TIMEOUT = 30_000;
const RUN = String(Date.now());
const prefix = `TEST-PRIVACY-${RUN}`;
const LEAVER = `${prefix}-leaver`;
const STAYER = `${prefix}-stayer`;
const CREW = `${prefix}-crew`;
const OTHER_CREW = `${prefix}-other`;

const prisma = new PrismaClient();
const WHEN = new Date('2026-01-01T00:00:00Z');

async function cleanup(): Promise<void> {
  await prisma.crew.deleteMany({ where: { code: { startsWith: prefix } } });
  await prisma.session.deleteMany({ where: { roomCode: { startsWith: prefix } } });
  await prisma.player.deleteMany({ where: { id: { startsWith: prefix } } });
}

async function seedCrew(code: string, members: string[]): Promise<string> {
  const crew = await prisma.crew.create({ data: { code, name: code, hostPlayerId: STAYER } });
  const session = await prisma.session.create({
    data: {
      id: `${code}:s`, crewId: crew.code, roomCode: code, gmPlayerId: STAYER,
      seed: 1n, startedAt: WHEN, endedAt: WHEN, seatCount: 6, winner: 'TOWN', config: {},
    },
  });
  for (const playerId of members) {
    await prisma.crewMembership.create({
      data: { crewId: crew.code, playerId, displayName: playerId, joinedAt: WHEN },
    });
    await prisma.sessionPlayer.create({
      data: { sessionId: session.id, playerId, role: 'VILLAGER', survived: true, wasWinner: true },
    });
  }
  return session.id;
}

suite('privacy', () => {
  beforeEach(async () => {
    await cleanup();
    await prisma.player.createMany({ data: [{ id: LEAVER }, { id: STAYER }] });
  }, NEON_TIMEOUT);

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  }, NEON_TIMEOUT);

  it('wipes the leaver’s recorded games and their membership', async () => {
    const sessionId = await seedCrew(CREW, [LEAVER, STAYER]);

    await leaveCrew(prisma, { crewCode: CREW, playerId: LEAVER });

    expect(await prisma.sessionPlayer.count({ where: { sessionId, playerId: LEAVER } })).toBe(0);
    expect(await prisma.crewMembership.count({ where: { playerId: LEAVER } })).toBe(0);
  }, NEON_TIMEOUT);

  it('leaves everyone else’s record of the same games alone', async () => {
    const sessionId = await seedCrew(CREW, [LEAVER, STAYER]);

    await leaveCrew(prisma, { crewCode: CREW, playerId: LEAVER });

    expect(await prisma.sessionPlayer.count({ where: { sessionId, playerId: STAYER } })).toBe(1);
    expect(await prisma.session.count({ where: { id: sessionId } })).toBe(1);
  }, NEON_TIMEOUT);

  it('touches only the crew being left', async () => {
    await seedCrew(CREW, [LEAVER, STAYER]);
    const elsewhere = await seedCrew(OTHER_CREW, [LEAVER]);

    await leaveCrew(prisma, { crewCode: CREW, playerId: LEAVER });

    // One crew's privacy decision is not a decision about the others.
    expect(await prisma.sessionPlayer.count({ where: { sessionId: elsewhere, playerId: LEAVER } })).toBe(1);
    expect(await prisma.crewMembership.count({ where: { playerId: LEAVER } })).toBe(1);
  }, NEON_TIMEOUT);

  it('wipes the address when the record is deleted', async () => {
    await claimIdentity(prisma, { playerId: LEAVER, email: `${prefix.toLowerCase()}@example.com` });

    await deleteIdentity(prisma, LEAVER);

    const player = await prisma.player.findUnique({ where: { id: LEAVER } });
    expect(player?.email).toBeNull();
    expect(player?.emailClaimedAt).toBeNull();
    expect(player?.deletedAt).not.toBeNull();
  }, NEON_TIMEOUT);

  it('frees the address for a genuinely new claim afterwards', async () => {
    const email = `${prefix.toLowerCase()}@example.com`;
    await claimIdentity(prisma, { playerId: LEAVER, email });
    await deleteIdentity(prisma, LEAVER);

    await expect(claimIdentity(prisma, { playerId: STAYER, email })).resolves.toEqual({
      playerId: STAYER,
      merged: false,
    });
  }, NEON_TIMEOUT);
});
