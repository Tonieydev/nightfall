import { describe, expect, it, vi } from 'vitest';
import { writeSession, type DurableClient } from './write-session.js';
import type { SessionRecord } from './record.js';

const RECORD: SessionRecord = {
  sessionId: 'ABC234:1700000000000',
  crewCode: 'ABC234',
  gmPlayerId: 'gm',
  seed: 4242n,
  startedAt: new Date(1_700_000_000_000),
  endedAt: new Date(1_700_002_400_000),
  seatCount: 6,
  winner: 'TOWN',
  config: { mafiaCount: null, doctor: true, detective: true, mafiaNightMs: 45_000 },
  members: [
    { playerId: 'gm', displayName: 'Toniey' },
    { playerId: 'p2', displayName: 'Ada' },
    { playerId: 'p3', displayName: 'Musa' },
    { playerId: 'p4', displayName: 'Chidi' },
    { playerId: 'p5', displayName: 'Bola' },
    { playerId: 'p6', displayName: 'Emeka' },
  ],
  players: [
    { playerId: 'p2', role: 'MAFIA', survived: false, eliminatedAtPhase: 2, eliminatedBy: 'VOTE', wasWinner: false },
    { playerId: 'p3', role: 'DOCTOR', survived: true, eliminatedAtPhase: null, eliminatedBy: null, wasWinner: true },
    { playerId: 'p4', role: 'DETECTIVE', survived: true, eliminatedAtPhase: null, eliminatedBy: null, wasWinner: true },
    { playerId: 'p5', role: 'VILLAGER', survived: false, eliminatedAtPhase: 1, eliminatedBy: 'MAFIA', wasWinner: true },
    { playerId: 'p6', role: 'VILLAGER', survived: true, eliminatedAtPhase: null, eliminatedBy: null, wasWinner: true },
  ],
};

/** Records every statement handed to the batch, so its shape can be asserted. */
function fakeClient() {
  const calls: { table: string; args: Record<string, unknown> }[] = [];
  let batches = 0;

  const stmt = (name: string) => (args: Record<string, unknown>) => {
    calls.push({ table: name, args });
    return { __table: name };
  };

  const client: DurableClient = {
    $transaction: (operations) => {
      batches += 1;
      return Promise.resolve(operations);
    },
    player: { createMany: vi.fn(stmt('player')) },
    crew: { upsert: vi.fn(stmt('crew')) },
    session: { upsert: vi.fn(stmt('session')) },
  };

  return { client, calls, batchCount: () => batches };
}

const of = (calls: ReturnType<typeof fakeClient>['calls'], table: string) =>
  calls.filter((c) => c.table === table);

const one = (calls: ReturnType<typeof fakeClient>['calls'], table: string) => {
  const call = of(calls, table)[0];
  if (call === undefined) throw new Error(`no ${table} write`);
  return call.args;
};

describe('writing the durable record', () => {
  it('writes everything inside a single batched transaction', async () => {
    const fake = fakeClient();

    await writeSession(fake.client, RECORD);

    // One round-trip. The interactive form spent 15s on this and timed out:
    // Neon's pooler is PgBouncer in transaction mode.
    expect(fake.batchCount()).toBe(1);
    expect(fake.calls).toHaveLength(3);
  });

  it('writes rows only after the rows they reference', async () => {
    const fake = fakeClient();

    await writeSession(fake.client, RECORD);

    // Players exist before anything points at them; the crew exists before its
    // memberships and before the session. The array form runs in this order.
    expect(fake.calls.map((c) => c.table)).toEqual(['player', 'crew', 'session']);
  });

  it('never invents a crew id — it addresses the crew by its code', async () => {
    const fake = fakeClient();

    await writeSession(fake.client, RECORD);

    // Crew.id defaults to uuid() and nothing ties it to the code. A write that
    // assumed id === code violated CrewMembership_crewId_fkey against any crew
    // where that happened not to hold.
    const serialised = JSON.stringify(fake.calls, (_k, v: unknown) =>
      typeof v === 'bigint' ? v.toString() : v,
    );
    expect(serialised).not.toContain('"crewId"');

    expect(one(fake.calls, 'crew')['where']).toEqual({ code: 'ABC234' });
    const session = one(fake.calls, 'session') as { create: { crew: unknown } };
    expect(session.create.crew).toEqual({ connect: { code: 'ABC234' } });
  });

  it('nests memberships under the crew so Postgres resolves the key', async () => {
    const fake = fakeClient();

    await writeSession(fake.client, RECORD);
    const crew = one(fake.calls, 'crew') as {
      create: { memberships: { createMany: { data: unknown[]; skipDuplicates: boolean } } };
      update: { memberships: { createMany: { data: unknown[]; skipDuplicates: boolean } } };
    };

    // Six in the room, GM included — membership is not the same as playing.
    expect(crew.create.memberships.createMany.data).toHaveLength(6);
    expect(crew.update.memberships.createMany.skipDuplicates).toBe(true);
  });

  it('records the GM as narrator and never as a player', async () => {
    const fake = fakeClient();

    await writeSession(fake.client, RECORD);
    const session = one(fake.calls, 'session') as {
      create: { gmPlayerId: string; players: { createMany: { data: { playerId: string }[] } } };
    };

    expect(session.create.gmPlayerId).toBe('gm');
    const written = session.create.players.createMany.data.map((r) => r.playerId);
    expect(written).not.toContain('gm');
    expect(written).toHaveLength(5);
  });

  it('gives every member a player row', async () => {
    const fake = fakeClient();

    await writeSession(fake.client, RECORD);
    const players = one(fake.calls, 'player') as { data: unknown[]; skipDuplicates: boolean };

    expect(players.data).toHaveLength(6);
    expect(players.skipDuplicates).toBe(true);
  });

  it('carries the seed and the winner', async () => {
    const fake = fakeClient();

    await writeSession(fake.client, RECORD);
    const { create } = one(fake.calls, 'session') as { create: Record<string, unknown> };

    expect(create['seed']).toBe(4242n);
    expect(create['winner']).toBe('TOWN');
    expect(create['seatCount']).toBe(6);
  });

  it('preserves how each player left, GM overrides included', async () => {
    const fake = fakeClient();

    await writeSession(fake.client, RECORD);
    const session = one(fake.calls, 'session') as {
      create: {
        players: { createMany: { data: { playerId: string; eliminatedBy: string | null }[] } };
      };
    };
    const rows = session.create.players.createMany.data;

    expect(rows.find((r) => r.playerId === 'p2')?.eliminatedBy).toBe('VOTE');
    expect(rows.find((r) => r.playerId === 'p5')?.eliminatedBy).toBe('MAFIA');
    expect(rows.find((r) => r.playerId === 'p3')?.eliminatedBy).toBeNull();
  });

  it('is idempotent: every write is keyed, so a double fire cannot duplicate', async () => {
    const fake = fakeClient();

    await writeSession(fake.client, RECORD);
    await writeSession(fake.client, RECORD);

    // Twice the calls, but every one is keyed: upserts on a stable unique field,
    // batches with skipDuplicates. The same game lands on the same rows.
    for (const call of fake.calls) {
      const keyed = call.args['where'] !== undefined || call.args['skipDuplicates'] === true;
      expect(keyed, `${call.table} must be idempotent`).toBe(true);
    }
    const sessionKeys = of(fake.calls, 'session').map(
      (c) => (c.args as { where: { id: string } }).where.id,
    );
    expect(new Set(sessionKeys).size, 'both writes target one session row').toBe(1);
  });
});
