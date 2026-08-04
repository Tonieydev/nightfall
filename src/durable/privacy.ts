import type { PrismaClient } from '@prisma/client';

/**
 * Leaving a crew takes that member's recorded games with them, per the spec's
 * privacy rule. One transaction: a membership removed while its games survive
 * would leave rows nobody can attribute or delete.
 *
 * Worth knowing: `SessionPlayer` is shared history, so this does change what the
 * rest of the crew can see about games they played. That is the trade the spec
 * makes deliberately — the person's record is theirs to withdraw.
 */
export async function leaveCrew(
  client: PrismaClient,
  request: { crewCode: string; playerId: string },
): Promise<void> {
  const { crewCode, playerId } = request;

  await client.$transaction([
    client.$executeRaw`
      DELETE FROM "SessionPlayer"
      WHERE "playerId" = ${playerId}
        AND "sessionId" IN (
          SELECT s."id" FROM "Session" s WHERE s."crewId" = ${crewCode}
        )`,
    // The crew code is the crew's key, so neither statement needs to reach
    // through the Crew table to find out which rows belong to it.
    client.$executeRaw`
      DELETE FROM "CrewMembership"
      WHERE "crewId" = ${crewCode} AND "playerId" = ${playerId}`,
  ]);
}

/**
 * Deleting the record wipes the address and marks the row gone. The row itself
 * stays: its `SessionPlayer` rows are the crew's shared history of games that
 * genuinely happened, and a hard delete would rewrite everyone else's record
 * of the same evening. Use leaveCrew to withdraw the games themselves.
 */
export async function deleteIdentity(client: PrismaClient, playerId: string): Promise<void> {
  await client.player.update({
    where: { id: playerId },
    data: { email: null, emailClaimedAt: null, deletedAt: new Date() },
  });
}
