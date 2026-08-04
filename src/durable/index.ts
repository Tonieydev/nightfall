import { PrismaClient } from '@prisma/client';
import { toSessionRecord } from './record.js';
import { writeSession, type DurableClient } from './write-session.js';
import type { RoomDocument } from '../room-store/index.js';

export { sessionIdFor, toSessionRecord } from './record.js';
export { writeSession } from './write-session.js';
export type { SessionRecord, SessionPlayerRow } from './record.js';
export type { DurableClient } from './write-session.js';
export { EmailInvalidError, IdentityNotFoundError, claimIdentity } from './claim.js';
export type { ClaimRequest, ClaimResult } from './claim.js';
export { MergeRefusedError, mergePlayers } from './merge.js';
export type { MergeRequest } from './merge.js';
export { deleteIdentity, leaveCrew } from './privacy.js';

const globalRef = globalThis as typeof globalThis & { __nightfallPrisma?: PrismaClient };

/** One client per process. This is the only place Postgres is reached. */
export function getPrisma(): PrismaClient {
  globalRef.__nightfallPrisma ??= new PrismaClient();
  return globalRef.__nightfallPrisma;
}

/**
 * Called when a room reaches GAME_OVER. Records nothing for a game that did not
 * finish — an abandoned game is not a record.
 *
 * Never throws. Postgres is the durable copy, not the render source: the
 * debrief reads the final state out of Redis, so a database that is slow or
 * down costs the crew their history, never their screen.
 */
export async function recordFinishedGame(
  doc: RoomDocument,
  endedAt: number,
  client: DurableClient = getPrisma() as unknown as DurableClient,
): Promise<boolean> {
  const record = toSessionRecord(doc, endedAt);
  if (record === null) return false;

  try {
    await writeSession(client, record);
    return true;
  } catch (error) {
    console.error(
      `[nightfall] durable write failed for ${record.sessionId}; the debrief is unaffected`,
      error,
    );
    return false;
  }
}
