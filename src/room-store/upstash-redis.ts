import { Redis } from '@upstash/redis';
import type { RedisPort } from './redis-port.js';

/**
 * Compare-and-set has to be one round trip, or two writers can both read the
 * same version and both write. Upstash has no WATCH over REST, so the check and
 * the write happen together inside Lua.
 */
const SET_IF_VERSION = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
local ok, decoded = pcall(cjson.decode, current)
if not ok then return 0 end
if tostring(decoded.version) ~= ARGV[2] then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[3]))
return 1
`;

/**
 * Prune, count, admit — in one round trip, so two callers racing for the last
 * slot cannot both see room for themselves.
 *
 * The count is ZCOUNT over the live range rather than ZCARD, so an entry that
 * nobody pruned still does not count. The ZREMRANGEBYSCORE above it is only
 * housekeeping; correctness does not depend on it having run.
 */
const ADMIT_TO_LIVE_SET = `
local now = tonumber(ARGV[4])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
local held = redis.call('ZSCORE', KEYS[1], ARGV[1])
if held and tonumber(held) > now then return 1 end
if redis.call('ZCOUNT', KEYS[1], '(' .. now, '+inf') >= tonumber(ARGV[3]) then return 0 end
redis.call('ZADD', KEYS[1], tonumber(ARGV[2]), ARGV[1])
return 1
`;

export function createUpstashRedis(url: string, token: string): RedisPort {
  // Values are written as JSON strings and parsed by room-store; letting the
  // client parse them too would hand back objects where strings are expected.
  const redis = new Redis({ url, token, automaticDeserialization: false });

  return {
    async get(key) {
      return await redis.get<string>(key);
    },

    async set(key, value, ttlSeconds) {
      if (ttlSeconds === undefined) await redis.set(key, value);
      else await redis.set(key, value, { ex: ttlSeconds });
    },

    async setIfAbsent(key, value, ttlSeconds) {
      const result =
        ttlSeconds === undefined
          ? await redis.set(key, value, { nx: true })
          : await redis.set(key, value, { nx: true, ex: ttlSeconds });
      return result === 'OK';
    },

    async setIfVersion(key, value, expectedVersion, ttlSeconds) {
      const result = await redis.eval(
        SET_IF_VERSION,
        [key],
        [value, String(expectedVersion), String(ttlSeconds)],
      );
      return Number(result) === 1;
    },

    async del(key) {
      await redis.del(key);
    },

    incr(key) {
      return redis.incr(key);
    },

    decr(key) {
      return redis.decr(key);
    },

    async incrBy(key, delta, ttlSeconds) {
      const next = await redis.incrby(key, delta);
      // Refreshed after the add rather than set on create: INCRBY cannot carry
      // an expiry, and a month counter only needs to outlive its own month.
      if (ttlSeconds !== undefined) await redis.expire(key, ttlSeconds);
      return next;
    },

    ttl(key) {
      return redis.ttl(key);
    },

    async liveSetAdmit(key, member, expiresAtMs, limit, nowMs) {
      const result = await redis.eval(
        ADMIT_TO_LIVE_SET,
        [key],
        [member, String(expiresAtMs), String(limit), String(nowMs)],
      );
      return Number(result) === 1;
    },

    async liveSetRemove(key, member) {
      await redis.zrem(key, member);
    },

    async liveSetCount(key, nowMs) {
      // Exclusive of now, so a member whose expiry has arrived is already gone
      // from the count whether or not anything removed it.
      return await redis.zcount(key, `(${String(nowMs)}`, '+inf');
    },
  };
}
