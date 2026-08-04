import { loadServerConfig } from '../config.js';
import { acquireRoomSlot, releaseRoomSlot, type CapacityPolicy } from './capacity.js';
import { reconcilePhase } from './commands.js';
import { createCrew, readCrew, type CrewRecord } from './crew.js';
import { MemoryRedis } from './memory-redis.js';
import { claimSession, releaseSession } from './session.js';
import { createRoomStore, type RoomStore } from './store.js';
import { createUpstashRedis } from './upstash-redis.js';
import type { RedisPort } from './redis-port.js';
import type { RoomDocument } from './types.js';

export { RoomFullError, NotEnoughPlayersError, SessionAlreadyStartedError, NotAMemberError, joinLobby, setConnected, startSession } from './lobby.js';
export { RoomCeilingReachedError, KillSwitchError } from './capacity.js';
export { mulberry32, newSeed } from './prng.js';
export {
  GameNotStartedError,
  NotAPlayerError,
  NotGmError,
  NothingToRevertError,
  advanceGame,
  endGame,
  forceKill,
  forceRevive,
  isPhaseExpired,
  reconcilePhase,
  revertPhase,
} from './commands.js';
export {
  InvalidTargetError,
  NotYourActionError,
  WrongPhaseError,
  detectiveCheck,
  doctorSave,
  mafiaVote,
} from './night-actions.js';
export { castVote, clearVote } from './voting.js';
export { DEFAULT_GAME_CONFIG } from './lobby.js';
export { CrewCodeExhaustedError } from './crew.js';
export { RoomNotFoundError, VersionConflictError } from './store.js';
export { isCrewCode, normaliseCrewCode } from './crew-code.js';
export { MAX_DISPLAY_NAME, parseDisplayName } from './display-name.js';
export { projectRoom } from './project-room.js';
export { MAX_SEATS, MIN_LOBBY_TO_START, MIN_PLAYERS_TO_START, ROOM_TTL_SECONDS } from './keys.js';
export type { MemberView, RoomView, SelfView } from './project-room.js';
export type { LobbyMember, RoomDocument } from './types.js';
export type { CrewRecord } from './crew.js';

export interface RoomStoreFacade {
  crew: {
    create(name: string): Promise<CrewRecord>;
    read(code: string): Promise<CrewRecord | null>;
  };
  room: RoomStore & {
    /** Creates the room behind the concurrency ceiling and the kill switch. */
    open(crewCode: string): Promise<RoomDocument>;
    close(crewCode: string): Promise<void>;
  };
  session: {
    claim(crewCode: string, gmPlayerId: string): Promise<boolean>;
    release(crewCode: string): Promise<void>;
  };
}

export function createRoomStoreFacade(
  redis: RedisPort,
  policy: CapacityPolicy,
  now: () => number = Date.now,
  rng: () => number = Math.random,
): RoomStoreFacade {
  const store = createRoomStore({ redis, now });

  return {
    crew: {
      create: (name) => createCrew(redis, name, now(), rng),
      read: (code) => readCrew(redis, code),
    },
    room: {
      ...store,
      // Every read reconciles. The per-room timer is only a fast path; this is
      // what makes a mid-phase redeploy or a dropped timer self-healing.
      async read(crewCode) {
        const doc = await store.read(crewCode);
        if (doc === null || reconcilePhase(doc, now()) === null) return doc;

        // Re-check inside the CAS: a racing reader may have already resolved it,
        // and returning null there aborts the write instead of resolving twice.
        return await store.mutate(crewCode, (fresh) => reconcilePhase(fresh, now()));
      },
      async open(crewCode) {
        const existing = await store.read(crewCode);
        if (existing !== null) return existing;

        await acquireRoomSlot(redis, policy);
        try {
          return await store.create(crewCode);
        } catch (error) {
          await releaseRoomSlot(redis);
          throw error;
        }
      },
      async close(crewCode) {
        const existing = await store.read(crewCode);
        await store.destroy(crewCode);
        await releaseSession(redis, crewCode);
        // Only give the slot back if this call is what removed the room.
        if (existing !== null) await releaseRoomSlot(redis);
      },
    },
    session: {
      claim: (crewCode, gmPlayerId) => claimSession(redis, crewCode, gmPlayerId),
      release: (crewCode) => releaseSession(redis, crewCode),
    },
  };
}

// Held on globalThis, not in module scope: the custom server and Next's
// compiled route handlers share one process but not one module registry, so a
// module-level singleton would give them a client each. Harmless against
// Upstash, fatal for the in-memory dev store, which would then be two stores.
const globalRef = globalThis as typeof globalThis & {
  __nightfallRoomStore?: RoomStoreFacade;
};

/** The process-wide store. This is the only place the Redis client is built. */
export function getRoomStore(): RoomStoreFacade {
  const existing = globalRef.__nightfallRoomStore;
  if (existing !== undefined) return existing;

  const config = loadServerConfig();
  const redis = config.memoryRedis
    ? new MemoryRedis()
    : createUpstashRedis(config.upstashUrl, config.upstashToken);

  const store = createRoomStoreFacade(redis, {
    maxConcurrentRooms: config.maxConcurrentRooms,
    killSwitch: config.killSwitch,
  });
  globalRef.__nightfallRoomStore = store;
  return store;
}
