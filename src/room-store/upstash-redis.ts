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

    ttl(key) {
      return redis.ttl(key);
    },
  };
}
