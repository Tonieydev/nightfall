import { describe, expect, it } from 'vitest';
import { roomKey } from './keys.js';
import { MemoryRedis } from './memory-redis.js';
import { createRoomStore } from './store.js';

const NOW = 1_700_000_000_000;

function setup(now: number = NOW) {
  const redis = new MemoryRedis(() => now);
  const store = createRoomStore({ redis, now: () => now });
  return { redis, store };
}

describe('room store', () => {
  it('creates a room and reads it back', async () => {
    const { store } = setup();

    const created = await store.create('ABC234');
    const read = await store.read('ABC234');

    expect(created.crewCode).toBe('ABC234');
    expect(created.version).toBe(1);
    expect(created.members).toEqual([]);
    expect(created.game).toBeNull();
    expect(read).toEqual(created);
  });

  it('returns null for a room that does not exist', async () => {
    const { store } = setup();

    expect(await store.read('ZZZ999')).toBeNull();
  });

  it('bumps version on every mutation', async () => {
    const { store } = setup();
    await store.create('ABC234');

    const first = await store.mutate('ABC234', (doc) => ({ ...doc, gmPlayerId: 'p1' }));
    const second = await store.mutate('ABC234', (doc) => ({ ...doc, gmPlayerId: 'p2' }));

    expect(first.version).toBe(2);
    expect(second.version).toBe(3);
    expect((await store.read('ABC234'))?.gmPlayerId).toBe('p2');
  });

  it('retries and preserves both writes when two callers race', async () => {
    const { redis, store } = setup();
    await store.create('ABC234');

    // Land a competing write between this mutation's read and its CAS, exactly
    // once — the retry must observe it rather than clobber it.
    let interfered = false;
    const original = redis.setIfVersion.bind(redis);
    redis.setIfVersion = async (key, value, expectedVersion, ttl) => {
      if (!interfered) {
        interfered = true;
        await store.mutate('ABC234', (doc) => ({
          ...doc,
          members: [
            ...doc.members,
            { playerId: 'racer', displayName: 'Racer', connected: true, joinedAt: NOW },
          ],
        }));
      }
      return original(key, value, expectedVersion, ttl);
    };

    const result = await store.mutate('ABC234', (doc) => ({ ...doc, gmPlayerId: 'winner' }));

    expect(result.gmPlayerId).toBe('winner');
    expect(result.members.map((m) => m.playerId)).toEqual(['racer']);
  });

  it('gives up rather than corrupting the document', async () => {
    const { redis, store } = setup();
    await store.create('ABC234');
    redis.setIfVersion = () => Promise.resolve(false);

    await expect(store.mutate('ABC234', (doc) => doc)).rejects.toThrow(/changed under us/);
  });

  it('refuses to mutate a room that is gone', async () => {
    const { store } = setup();

    await expect(store.mutate('ZZZ999', (doc) => doc)).rejects.toThrow(/no room for crew/);
  });

  it('gives the room a 90-minute lifetime that mutation does not extend', async () => {
    const redis = new MemoryRedis(() => NOW);
    let clock = NOW;
    const store = createRoomStore({ redis, now: () => clock });

    const created = await store.create('ABC234');
    expect(created.expiresAt - created.createdAt).toBe(90 * 60 * 1000);
    expect(await redis.ttl(roomKey('ABC234'))).toBe(90 * 60);

    clock = NOW + 80 * 60 * 1000;
    await store.mutate('ABC234', (doc) => ({ ...doc, gmPlayerId: 'p1' }));

    // Ten minutes left, not a fresh ninety.
    expect(await redis.ttl(roomKey('ABC234'))).toBeLessThanOrEqual(10 * 60);
    expect((await store.read('ABC234'))?.expiresAt).toBe(created.expiresAt);
  });

  it('treats an expired room as gone', async () => {
    const redis = new MemoryRedis(() => clock);
    let clock = NOW;
    const store = createRoomStore({ redis, now: () => clock });
    await store.create('ABC234');

    clock = NOW + 91 * 60 * 1000;

    expect(await store.read('ABC234')).toBeNull();
  });

  it('destroy removes the document', async () => {
    const { store } = setup();
    await store.create('ABC234');

    await store.destroy('ABC234');

    expect(await store.read('ABC234')).toBeNull();
  });
});
