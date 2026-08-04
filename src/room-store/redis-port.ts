/**
 * The narrow slice of Redis this project uses. Kept small on purpose: the
 * in-memory double in memory-redis.ts must reproduce these semantics exactly,
 * so anything that cannot be faithfully faked does not belong here.
 *
 * `setIfVersion` is a port operation rather than a generic primitive because
 * compare-and-set has to be atomic — Upstash implements it as one Lua script.
 */
export interface RedisPort {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  /** SET NX. Resolves true when this caller created the key. */
  setIfAbsent(key: string, value: string, ttlSeconds?: number): Promise<boolean>;
  /** Writes only when the stored JSON's `version` equals `expectedVersion`. */
  setIfVersion(
    key: string,
    value: string,
    expectedVersion: number,
    ttlSeconds: number,
  ): Promise<boolean>;
  del(key: string): Promise<void>;
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
  /**
   * Atomic add-and-return. `delta` may be negative. `ttlSeconds` refreshes the
   * key's expiry so a month counter evicts itself once nothing writes to it.
   */
  incrBy(key: string, delta: number, ttlSeconds?: number): Promise<number>;
  /** Remaining TTL in seconds; -1 when the key has none, -2 when it is gone. */
  ttl(key: string): Promise<number>;
}
