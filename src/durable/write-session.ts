import type { SessionRecord } from './record.js';

/**
 * The slice of Prisma this write needs. Narrow on purpose: a test can drive it
 * without a database, and nothing outside src/durable/ touches Postgres.
 *
 * The array form of $transaction, not the interactive one: Neon's pooled
 * endpoint is PgBouncer in transaction mode, where an interactive transaction
 * holds a session open across every round-trip. Five sequential queries spent
 * 15s that way. The array form ships them as one batch, in order.
 */
export interface DurableClient {
  $transaction<T>(operations: T[]): Promise<unknown>;
  player: { createMany(args: unknown): unknown };
  crew: { upsert(args: unknown): unknown };
  session: { upsert(args: unknown): unknown };
}

/**
 * One transaction, once, at game end. Every statement is keyed — upserts on a
 * unique field, nested batches with skipDuplicates — so a retry, a reconnect or
 * a double-advance into GAME_OVER records the same game once rather than twice.
 *
 * Nothing here invents a primary key. An earlier version set the crew's id to
 * its code and then wrote `crewId: crewCode` on the rows beneath it, which held
 * only for crews that happened to have been created that way: Crew.id defaults
 * to uuid() and the schema does not tie it to the code. Against a crew where the
 * two differed, the upsert matched by code, took its update branch — which
 * cannot change a primary key — and the memberships below it pointed at an id no
 * row had. Postgres rejected it with CrewMembership_crewId_fkey; the in-memory
 * fake, which enforces no foreign keys, had certified it.
 *
 * So the crew is addressed by `code`, its natural key, and the rows beneath it
 * are nested. Prisma fills in the foreign key from the row it actually matched.
 *
 * Order matters and the array form preserves it: players exist before anything
 * references them, and the crew exists before its memberships and its sessions.
 *
 * Postgres is never in the hot path: callers run this after the state is
 * written and broadcast, and a failure here must not reach the players.
 */
export async function writeSession(client: DurableClient, record: SessionRecord): Promise<void> {
  const memberships = record.members.map((m) => ({
    playerId: m.playerId,
    displayName: m.displayName,
  }));

  await client.$transaction([
    // Both the memberships and the session players reference these.
    client.player.createMany({
      data: record.members.map((m) => ({ id: m.playerId })),
      skipDuplicates: true,
    }),

    // displayName binds to the membership, not the player: one name per crew.
    client.crew.upsert({
      where: { code: record.crewCode },
      create: {
        code: record.crewCode,
        name: record.crewCode,
        hostPlayerId: record.gmPlayerId,
        lastPlayedAt: record.endedAt,
        memberships: { createMany: { data: memberships, skipDuplicates: true } },
      },
      update: {
        lastPlayedAt: record.endedAt,
        memberships: { createMany: { data: memberships, skipDuplicates: true } },
      },
    }),

    client.session.upsert({
      where: { id: record.sessionId },
      create: {
        id: record.sessionId,
        roomCode: record.crewCode,
        gmPlayerId: record.gmPlayerId,
        seed: record.seed,
        startedAt: record.startedAt,
        endedAt: record.endedAt,
        seatCount: record.seatCount,
        winner: record.winner,
        config: record.config,
        crew: { connect: { code: record.crewCode } },
        // Role-holders only; the GM narrated and has no row here.
        players: { createMany: { data: record.players, skipDuplicates: true } },
      },
      update: {
        endedAt: record.endedAt,
        winner: record.winner,
        players: { createMany: { data: record.players, skipDuplicates: true } },
      },
    }),
  ]);
}
