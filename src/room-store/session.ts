import { ROOM_TTL_SECONDS, sessionKey } from './keys.js';
import type { RedisPort } from './redis-port.js';

/**
 * Any crew member can start a session, so two taps can land together. SETNX
 * decides it in Redis: the first writer owns the session and becomes GM, the
 * second gets false back and stays in the lobby as a player.
 */
export function claimSession(
  redis: RedisPort,
  crewCode: string,
  gmPlayerId: string,
): Promise<boolean> {
  return redis.setIfAbsent(sessionKey(crewCode), gmPlayerId, ROOM_TTL_SECONDS);
}

export function readSessionOwner(redis: RedisPort, crewCode: string): Promise<string | null> {
  return redis.get(sessionKey(crewCode));
}

export function releaseSession(redis: RedisPort, crewCode: string): Promise<void> {
  return redis.del(sessionKey(crewCode));
}
