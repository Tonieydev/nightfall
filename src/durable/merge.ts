import type { PrismaClient } from '@prisma/client';
import { DomainError } from '../room-store/errors.js';

export class MergeRefusedError extends DomainError {
  readonly code = 'MERGE_REFUSED' as const;

  constructor(reason: string) {
    super(`these two identities cannot be merged: ${reason}`);
    this.name = 'MergeRefusedError';
  }
}

export interface MergeRequest {
  /** The row being folded away — a second device that had not claimed yet. */
  orphanId: string;
  /** The row holding the claimed address, which keeps its id and its history. */
  canonicalId: string;
}

/**
 * One human, two Player rows: they joined on a new device before claiming, then
 * claimed an address already bound to the old row. This folds the new row into
 * the old one.
 *
 * Every statement is set-based, so nothing is read and then written back. A
 * read-plan-write version would have to decide which memberships collide before
 * it acted, and a membership created in between would either be missed or crash
 * the merge. Postgres resolves the collisions here, inside the transaction.
 *
 * Order is the whole difficulty. Two unique constraints stand in the way —
 * @@unique([crewId, playerId]) and @@unique([sessionId, playerId]) — so the
 * losing row of each collision is deleted *before* anything is reassigned into
 * its place. A plain reassignment fails on both.
 */
export async function mergePlayers(client: PrismaClient, request: MergeRequest): Promise<void> {
  const { orphanId, canonicalId } = request;

  if (orphanId === canonicalId) {
    throw new MergeRefusedError('they are the same player');
  }

  const orphan = await client.player.findUnique({
    where: { id: orphanId },
    select: { email: true, deletedAt: true },
  });
  if (orphan === null) throw new MergeRefusedError('there is no such player to merge');
  if (orphan.deletedAt !== null) throw new MergeRefusedError('it has already been merged away');
  // Two claimed addresses are two people, or one person's mistake. Neither is
  // resolved by silently discarding one of them.
  if (orphan.email !== null) {
    throw new MergeRefusedError('it holds a claimed address of its own');
  }

  // The canonical row is deliberately NOT checked here. If it does not exist the
  // foreign keys below reject the whole transaction, which is the behaviour worth
  // having: one failure, nothing half-moved.
  await client.$transaction([
    // Same crew, both rows. Whichever joined later loses; on a tie the canonical
    // row keeps its membership, so the outcome never depends on row order.
    client.$executeRaw`
      DELETE FROM "CrewMembership" AS loser
      USING "CrewMembership" AS keeper
      WHERE loser."playerId" = ${orphanId}
        AND keeper."playerId" = ${canonicalId}
        AND loser."crewId" = keeper."crewId"
        AND loser."joinedAt" >= keeper."joinedAt"`,
    client.$executeRaw`
      DELETE FROM "CrewMembership" AS loser
      USING "CrewMembership" AS keeper
      WHERE loser."playerId" = ${canonicalId}
        AND keeper."playerId" = ${orphanId}
        AND loser."crewId" = keeper."crewId"
        AND loser."joinedAt" > keeper."joinedAt"`,

    // Whatever survived above is now collision-free and can carry its history
    // — and its displayName and joinedAt — across to the canonical row.
    client.$executeRaw`
      UPDATE "CrewMembership" SET "playerId" = ${canonicalId}
      WHERE "playerId" = ${orphanId}`,

    // A person cannot have played one session twice. If the data says otherwise
    // the canonical row's version is the one that stands.
    client.$executeRaw`
      DELETE FROM "SessionPlayer" AS loser
      USING "SessionPlayer" AS keeper
      WHERE loser."playerId" = ${orphanId}
        AND keeper."playerId" = ${canonicalId}
        AND loser."sessionId" = keeper."sessionId"`,
    client.$executeRaw`
      UPDATE "SessionPlayer" SET "playerId" = ${canonicalId}
      WHERE "playerId" = ${orphanId}`,

    // Soft delete, last: the children are already reassigned, so nothing is
    // left pointing at a row that is about to stop being a person. The row
    // itself stays, which is what makes the merge auditable and reversible.
    client.$executeRaw`
      UPDATE "Player"
      SET "mergedIntoId" = ${canonicalId}, "deletedAt" = NOW(), "email" = NULL,
          "emailClaimedAt" = NULL
      WHERE "id" = ${orphanId}`,
  ]);
}
