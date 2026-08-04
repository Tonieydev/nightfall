import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { domainErrorCode } from '../room-store/errors.js';
import { claimIdentity } from './claim.js';

const OPTED_IN = process.env['NIGHTFALL_TEST_NEON'] === '1';
const DATABASE_URL = process.env['DATABASE_URL'];
const suite =
  OPTED_IN && DATABASE_URL !== undefined && DATABASE_URL !== '' ? describe : describe.skip;

const NEON_TIMEOUT = 30_000;
const RUN = String(Date.now());
const prefix = `TEST-CLAIM-${RUN}`;
const OLD_DEVICE = `${prefix}-old`;
const NEW_DEVICE = `${prefix}-new`;
// Lowercase on purpose: addresses are normalised on the way in, so an uppercase
// literal here would be asserting against a value that cannot be stored.
const EMAIL = `${prefix.toLowerCase()}@example.com`;

const prisma = new PrismaClient();
const WHEN = new Date('2026-01-01T00:00:00Z');

async function cleanup(): Promise<void> {
  await prisma.crew.deleteMany({ where: { code: { startsWith: prefix } } });
  await prisma.session.deleteMany({ where: { roomCode: { startsWith: prefix } } });
  await prisma.player.deleteMany({ where: { id: { startsWith: prefix } } });
}

/** Gives a player one crew and one recorded game, so a merge has something to move. */
async function seedHistory(playerId: string, suffix: string): Promise<string> {
  const code = `${prefix}-${suffix}`;
  const crew = await prisma.crew.create({ data: { code, name: code, hostPlayerId: playerId } });
  const session = await prisma.session.create({
    data: {
      id: `${code}:s`, crewId: crew.code, roomCode: code, gmPlayerId: playerId,
      seed: 1n, startedAt: WHEN, endedAt: WHEN, seatCount: 6, winner: 'TOWN', config: {},
    },
  });
  await prisma.crewMembership.create({
    data: { crewId: crew.code, playerId, displayName: 'Ada', joinedAt: WHEN },
  });
  await prisma.sessionPlayer.create({
    data: { sessionId: session.id, playerId, role: 'MAFIA', survived: true, wasWinner: true },
  });
  return crew.code;
}

suite('claiming an address', () => {
  beforeEach(async () => {
    await cleanup();
    await prisma.player.createMany({ data: [{ id: OLD_DEVICE }, { id: NEW_DEVICE }] });
  }, NEON_TIMEOUT);

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  }, NEON_TIMEOUT);

  it('binds a free address to the player who claimed it', async () => {
    const result = await claimIdentity(prisma, { playerId: OLD_DEVICE, email: EMAIL });

    expect(result).toEqual({ playerId: OLD_DEVICE, merged: false });
    const player = await prisma.player.findUnique({ where: { id: OLD_DEVICE } });
    expect(player?.email).toBe(EMAIL);
    expect(player?.emailClaimedAt).not.toBeNull();
  }, NEON_TIMEOUT);

  it('is a no-op when the same player claims the same address twice', async () => {
    await claimIdentity(prisma, { playerId: OLD_DEVICE, email: EMAIL });

    const again = await claimIdentity(prisma, { playerId: OLD_DEVICE, email: EMAIL });

    expect(again).toEqual({ playerId: OLD_DEVICE, merged: false });
  }, NEON_TIMEOUT);

  it('returns the existing identity to a device that has none', async () => {
    // The recovery case: a new phone, nothing joined yet, just the address.
    await claimIdentity(prisma, { playerId: OLD_DEVICE, email: EMAIL });

    const recovered = await claimIdentity(prisma, { playerId: null, email: EMAIL });

    expect(recovered).toEqual({ playerId: OLD_DEVICE, merged: false });
  }, NEON_TIMEOUT);

  it('merges when the device already played as somebody new', async () => {
    // The case the spec says fires in week one: joined on the new phone first,
    // claimed afterwards.
    await claimIdentity(prisma, { playerId: OLD_DEVICE, email: EMAIL });
    const crewId = await seedHistory(NEW_DEVICE, 'newphone');

    const result = await claimIdentity(prisma, { playerId: NEW_DEVICE, email: EMAIL });

    expect(result).toEqual({ playerId: OLD_DEVICE, merged: true });
    expect(await prisma.crewMembership.findMany({ where: { crewId } })).toMatchObject([
      { playerId: OLD_DEVICE },
    ]);
    expect(await prisma.sessionPlayer.count({ where: { playerId: NEW_DEVICE } })).toBe(0);
    expect((await prisma.player.findUnique({ where: { id: NEW_DEVICE } }))?.mergedIntoId).toBe(
      OLD_DEVICE,
    );
  }, NEON_TIMEOUT);

  it('refuses when the claiming device already holds a different address', async () => {
    await claimIdentity(prisma, { playerId: OLD_DEVICE, email: EMAIL });
    await claimIdentity(prisma, { playerId: NEW_DEVICE, email: `${prefix.toLowerCase()}-other@example.com` });

    const error = await claimIdentity(prisma, { playerId: NEW_DEVICE, email: EMAIL }).catch(
      (e: unknown) => e,
    );

    expect(domainErrorCode(error)).toBe('MERGE_REFUSED');
  }, NEON_TIMEOUT);

  it('refuses to hand back an identity that was merged away', async () => {
    await claimIdentity(prisma, { playerId: OLD_DEVICE, email: EMAIL });
    await seedHistory(NEW_DEVICE, 'gone');
    await claimIdentity(prisma, { playerId: NEW_DEVICE, email: EMAIL });

    // NEW_DEVICE is now a tombstone. A stale token for it must not resurrect it.
    const result = await claimIdentity(prisma, { playerId: NEW_DEVICE, email: EMAIL });

    expect(result.playerId).toBe(OLD_DEVICE);
  }, NEON_TIMEOUT);

  it('never lets one address end up on two rows', async () => {
    await claimIdentity(prisma, { playerId: OLD_DEVICE, email: EMAIL });
    await seedHistory(NEW_DEVICE, 'dupe');
    await claimIdentity(prisma, { playerId: NEW_DEVICE, email: EMAIL });

    expect(await prisma.player.count({ where: { email: EMAIL } })).toBe(1);
  }, NEON_TIMEOUT);
});
