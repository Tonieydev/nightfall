import { loadServerConfig } from '../config.js';
import { acquireRoomSlot, releaseRoomSlot, type CapacityPolicy } from './capacity.js';
import { reconcilePhase } from './commands.js';
import { reclaimGm } from './handoff.js';
import { createCrew, readCrew, type CrewRecord } from './crew.js';
import { domainErrorCode } from './errors.js';
import { MemoryRedis } from './memory-redis.js';
import {
  ALARM_FRACTION,
  MINUTE_BUDGET_DEFAULT,
  maxSpendFor,
  reconcileMinutes,
  reserveMinutes,
  type MinutePolicy,
} from './minutes.js';
import { MAX_SEATS, ROOM_TTL_SECONDS } from './keys.js';
import { claimSession, releaseSession } from './session.js';
import { createRoomStore, type RoomStore } from './store.js';
import { createUpstashRedis } from './upstash-redis.js';
import type { RedisPort } from './redis-port.js';
import type { RoomDocument } from './types.js';

export { RoomFullError, NotEnoughPlayersError, SessionAlreadyStartedError, NotAMemberError, joinLobby, setConnected, startSession } from './lobby.js';
export { RoomCeilingReachedError, KillSwitchError } from './capacity.js';
export {
  DOMAIN_ERROR_CODES,
  DomainError,
  domainErrorCode,
  errorMessage,
  type DomainErrorCode,
} from './errors.js';
export {
  ALARM_FRACTION,
  MINUTE_BUDGET_DEFAULT,
  MinuteBudgetExceededError,
  maxSpendFor,
  minutesReserved,
  monthKey,
  reconcileMinutes,
  reserveMinutes,
} from './minutes.js';
export {
  ChatNotAllowedError,
  MAX_CHAT_CHARS,
  chatFor,
  chatRecipients,
  postChat,
  systemRecord,
} from './chat.js';
export type { ChatMessage, SystemEvent } from './chat.js';
export { GM_GRACE_MS, handOffGm, isGmAbandoned, reclaimGm, successorToGm } from './handoff.js';
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
    /**
     * `actualMinutes` comes from LiveKit's per-participant durations once voice
     * is wired. Until then the elapsed-time estimate below stands in, which is
     * a real measurement of seats x minutes rather than a placeholder.
     */
    close(crewCode: string, actualMinutes?: number): Promise<void>;
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
  minutes: MinutePolicy = { budget: MINUTE_BUDGET_DEFAULT, onAlarm: logMinuteAlarm },
  onRoomClosed?: (crewCode: string) => Promise<void>,
): RoomStoreFacade {
  // Worst case for one room: every seat, the whole lifetime.
  const roomReservation = maxSpendFor(MAX_SEATS, ROOM_TTL_SECONDS / 60);
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
        if (doc === null) return doc;

        // Both are reconciliation on read, for the same reason: a timer is a
        // fast path, and the room must heal itself after a redeploy or a
        // dropped callback. A GM whose phone died is reclaimed here even if
        // nobody is left to trigger it.
        const settle = (fresh: RoomDocument): RoomDocument | null =>
          reconcilePhase(fresh, now()) ?? reclaimGm(fresh, now());
        if (settle(doc) === null) return doc;

        // Re-check inside the CAS: a racing reader may have already resolved it,
        // and returning null there aborts the write instead of resolving twice.
        return await store.mutate(crewCode, settle);
      },
      async open(crewCode) {
        const existing = await store.read(crewCode);
        if (existing !== null) return existing;

        // Minutes are reserved before the room exists, so a month that cannot
        // fund a full room never admits one and then cuts it off mid-game.
        // A month that cannot fund it degrades to a voiceless room instead of
        // refusing: the pinned crew link has to keep working.
        let voice = { enabled: true, reservedMinutes: roomReservation };
        try {
          await reserveMinutes(redis, now(), roomReservation, minutes);
        } catch (error) {
          // Same registry today, but the discriminator is the same everywhere:
          // there is one way to recognise a domain error in this codebase.
          if (domainErrorCode(error) !== 'MINUTE_BUDGET_EXCEEDED') throw error;
          voice = { enabled: false, reservedMinutes: 0 };
        }

        const releaseReservation = async (): Promise<void> => {
          if (voice.reservedMinutes > 0) {
            await reconcileMinutes(redis, now(), voice.reservedMinutes, 0);
          }
        };

        try {
          await acquireRoomSlot(redis, policy, crewCode, now());
        } catch (error) {
          await releaseReservation();
          throw error;
        }

        try {
          return await store.create(crewCode, voice);
        } catch (error) {
          await releaseRoomSlot(redis, crewCode);
          await releaseReservation();
          throw error;
        }
      },
      async close(crewCode, actualMinutes) {
        const existing = await store.read(crewCode);
        // Participant-minutes accrue while the LiveKit room exists, so the kill
        // has to reach it — a room left behind bleeds budget until it idles out.
        if (existing?.voiceEnabled === true) await onRoomClosed?.(crewCode);
        await store.destroy(crewCode);
        await releaseSession(redis, crewCode);

        if (existing !== null) {
          await releaseRoomSlot(redis, crewCode);
          // Hand back the difference between the worst case held and what the
          // room actually cost, so a pessimistic reservation cannot starve a
          // month that had capacity all along.
          // A voiceless room held nothing and published nothing, so there is
          // nothing to hand back.
          if (existing.reservedMinutes > 0) {
            await reconcileMinutes(
              redis,
              now(),
              existing.reservedMinutes,
              actualMinutes ?? estimateSpend(existing, now()),
            );
          }
        }
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
  __nightfallRedis?: RedisPort;
};

/**
 * The process's Redis client. Shared rather than rebuilt per caller so the OTP
 * store and the room store are the same store — which matters in dev, where
 * `memoryRedis` means a second client would be a second, empty database.
 */
export function getRedis(): RedisPort {
  const existing = globalRef.__nightfallRedis;
  if (existing !== undefined) return existing;

  const config = loadServerConfig();
  const redis = config.memoryRedis
    ? new MemoryRedis()
    : createUpstashRedis(config.upstashUrl, config.upstashToken);
  globalRef.__nightfallRedis = redis;
  return redis;
}

/** The process-wide store. This is the only place the Redis client is built. */
export function getRoomStore(): RoomStoreFacade {
  const existing = globalRef.__nightfallRoomStore;
  if (existing !== undefined) return existing;

  const config = loadServerConfig();

  const store = createRoomStoreFacade(
    getRedis(),
    { maxConcurrentRooms: config.maxConcurrentRooms, killSwitch: config.killSwitch },
    Date.now,
    Math.random,
    { budget: config.minuteBudget, onAlarm: logMinuteAlarm },
  );
  globalRef.__nightfallRoomStore = store;
  return store;
}

/**
 * Seats present multiplied by minutes the room was open. Replaced by LiveKit's
 * own per-participant connected durations when voice lands; until then it is
 * the honest measure available, and it only ever releases reservation.
 */
function estimateSpend(doc: RoomDocument, closedAt: number): number {
  const elapsedMinutes = Math.max(0, Math.ceil((closedAt - doc.createdAt) / 60_000));
  return elapsedMinutes * doc.members.length;
}

function logMinuteAlarm(reserved: number, budget: number): void {
  console.warn(
    `[nightfall] participant-minute alarm: ${String(reserved)} of ${String(budget)} reserved ` +
      `this month (threshold ${String(Math.round(ALARM_FRACTION * budget))}). ` +
      `Voice capacity is running out.`,
  );
}
