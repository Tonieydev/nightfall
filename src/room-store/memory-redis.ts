import type { RedisPort } from './redis-port.js';

interface Entry {
  value: string;
  expiresAt: number | null;
}

/** Member -> the instant it stops counting. Mirrors a sorted set scored by expiry. */
type LiveSet = Map<string, number>;

/**
 * In-memory RedisPort for tests. Expiry is driven by an injected clock so TTL
 * behaviour can be asserted without waiting, and every operation is written to
 * match the Upstash adapter's semantics rather than to be convenient.
 */
export class MemoryRedis implements RedisPort {
  readonly #entries = new Map<string, Entry>();
  readonly #liveSets = new Map<string, LiveSet>();
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  #live(key: string): Entry | null {
    const entry = this.#entries.get(key);
    if (entry === undefined) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= this.#now()) {
      this.#entries.delete(key);
      return null;
    }
    return entry;
  }

  #expiryFor(ttlSeconds: number | undefined): number | null {
    return ttlSeconds === undefined ? null : this.#now() + ttlSeconds * 1000;
  }

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.#live(key)?.value ?? null);
  }

  set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.#entries.set(key, { value, expiresAt: this.#expiryFor(ttlSeconds) });
    return Promise.resolve();
  }

  setIfAbsent(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (this.#live(key) !== null) return Promise.resolve(false);
    this.#entries.set(key, { value, expiresAt: this.#expiryFor(ttlSeconds) });
    return Promise.resolve(true);
  }

  setIfVersion(
    key: string,
    value: string,
    expectedVersion: number,
    ttlSeconds: number,
  ): Promise<boolean> {
    const entry = this.#live(key);
    if (entry === null) return Promise.resolve(false);

    const current: unknown = JSON.parse(entry.value);
    const version =
      typeof current === 'object' && current !== null && 'version' in current
        ? (current as { version: unknown }).version
        : undefined;
    if (version !== expectedVersion) return Promise.resolve(false);

    this.#entries.set(key, { value, expiresAt: this.#expiryFor(ttlSeconds) });
    return Promise.resolve(true);
  }

  del(key: string): Promise<void> {
    this.#entries.delete(key);
    return Promise.resolve();
  }

  incr(key: string): Promise<number> {
    const entry = this.#live(key);
    const next = Number(entry?.value ?? '0') + 1;
    this.#entries.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null });
    return Promise.resolve(next);
  }

  decr(key: string): Promise<number> {
    const entry = this.#live(key);
    const next = Number(entry?.value ?? '0') - 1;
    this.#entries.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null });
    return Promise.resolve(next);
  }

  incrBy(key: string, delta: number, ttlSeconds?: number): Promise<number> {
    const entry = this.#live(key);
    const next = Number(entry?.value ?? '0') + delta;
    this.#entries.set(key, {
      value: String(next),
      expiresAt: ttlSeconds === undefined ? (entry?.expiresAt ?? null) : this.#expiryFor(ttlSeconds),
    });
    return Promise.resolve(next);
  }

  ttl(key: string): Promise<number> {
    const entry = this.#live(key);
    if (entry === null) return Promise.resolve(-2);
    if (entry.expiresAt === null) return Promise.resolve(-1);
    return Promise.resolve(Math.ceil((entry.expiresAt - this.#now()) / 1000));
  }

  #liveSet(key: string): LiveSet {
    let set = this.#liveSets.get(key);
    if (set === undefined) {
      set = new Map();
      this.#liveSets.set(key, set);
    }
    return set;
  }

  /** Expiry is a comparison, never a deletion — same rule the Lua script uses. */
  #countLive(set: LiveSet, nowMs: number): number {
    let live = 0;
    for (const expiresAt of set.values()) if (expiresAt > nowMs) live += 1;
    return live;
  }

  liveSetAdmit(
    key: string,
    member: string,
    expiresAtMs: number,
    limit: number,
    nowMs: number,
  ): Promise<boolean> {
    const set = this.#liveSet(key);

    // Dropping the dead first is housekeeping, not correctness: the count below
    // already ignores them. It stops the key growing without bound.
    for (const [existing, expiresAt] of set) if (expiresAt <= nowMs) set.delete(existing);

    const held = set.get(member);
    if (held !== undefined && held > nowMs) return Promise.resolve(true);
    if (this.#countLive(set, nowMs) >= limit) return Promise.resolve(false);

    set.set(member, expiresAtMs);
    return Promise.resolve(true);
  }

  liveSetRemove(key: string, member: string): Promise<void> {
    this.#liveSet(key).delete(member);
    return Promise.resolve();
  }

  liveSetCount(key: string, nowMs: number): Promise<number> {
    return Promise.resolve(this.#countLive(this.#liveSet(key), nowMs));
  }
}
