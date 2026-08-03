import { describe, expect, it } from 'vitest';
import { sessionKey } from './keys.js';
import { MemoryRedis } from './memory-redis.js';
import { claimSession, readSessionOwner, releaseSession } from './session.js';

describe('session claim', () => {
  it('gives the session to the first writer only', async () => {
    const redis = new MemoryRedis();

    const first = await claimSession(redis, 'ABC234', 'p1');
    const second = await claimSession(redis, 'ABC234', 'p2');

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(await readSessionOwner(redis, 'ABC234')).toBe('p1');
  });

  it('scopes the claim to one crew', async () => {
    const redis = new MemoryRedis();

    expect(await claimSession(redis, 'ABC234', 'p1')).toBe(true);
    expect(await claimSession(redis, 'XYZ789', 'p2')).toBe(true);
  });

  it('expires with the room rather than outliving it', async () => {
    let clock = 1_700_000_000_000;
    const redis = new MemoryRedis(() => clock);
    await claimSession(redis, 'ABC234', 'p1');

    expect(await redis.ttl(sessionKey('ABC234'))).toBe(90 * 60);

    clock += 91 * 60 * 1000;

    expect(await readSessionOwner(redis, 'ABC234')).toBeNull();
  });

  it('frees the crew for another session once released', async () => {
    const redis = new MemoryRedis();
    await claimSession(redis, 'ABC234', 'p1');

    await releaseSession(redis, 'ABC234');

    expect(await claimSession(redis, 'ABC234', 'p2')).toBe(true);
  });
});
