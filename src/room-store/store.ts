import { ROOM_TTL_SECONDS, roomKey } from './keys.js';
import type { RedisPort } from './redis-port.js';
import type { RoomDocument } from './types.js';
import { DomainError } from './errors.js';

export class VersionConflictError extends DomainError {
  readonly code = 'VERSION_CONFLICT' as const;

  constructor(crewCode: string) {
    super(`room ${crewCode} changed under us too many times`);
    this.name = 'VersionConflictError';
  }
}

export class RoomNotFoundError extends DomainError {
  readonly code = 'ROOM_NOT_FOUND' as const;

  constructor(crewCode: string) {
    super(`no room for crew ${crewCode}`);
    this.name = 'RoomNotFoundError';
  }
}

export interface RoomStoreOptions {
  redis: RedisPort;
  now: () => number;
  maxRetries?: number;
}

export interface RoomStore {
  create(crewCode: string, voice?: { enabled: boolean; reservedMinutes: number }): Promise<RoomDocument>;
  read(crewCode: string): Promise<RoomDocument | null>;
  /** `apply` may return null to abort without writing — used when a racing
   *  caller has already done the work this one was about to do. */
  mutate(
    crewCode: string,
    apply: (doc: RoomDocument) => RoomDocument | null,
  ): Promise<RoomDocument>;
  destroy(crewCode: string): Promise<void>;
}

function parseRoom(raw: string): RoomDocument {
  return JSON.parse(raw) as RoomDocument;
}

export function createRoomStore({ redis, now, maxRetries = 5 }: RoomStoreOptions): RoomStore {
  async function read(crewCode: string): Promise<RoomDocument | null> {
    const raw = await redis.get(roomKey(crewCode));
    return raw === null ? null : parseRoom(raw);
  }

  return {
    async create(crewCode, voice = { enabled: true, reservedMinutes: 0 }) {
      const createdAt = now();
      const doc: RoomDocument = {
        version: 1,
        crewCode,
        createdAt,
        expiresAt: createdAt + ROOM_TTL_SECONDS * 1000,
        gmPlayerId: null,
        members: [],
        seed: null,
        voiceEnabled: voice.enabled,
        reservedMinutes: voice.reservedMinutes,
        game: null,
      };

      await redis.set(roomKey(crewCode), JSON.stringify(doc), ROOM_TTL_SECONDS);
      return doc;
    },

    read,

    async mutate(crewCode, apply) {
      for (let attempt = 0; attempt < maxRetries; attempt += 1) {
        const current = await read(crewCode);
        if (current === null) throw new RoomNotFoundError(crewCode);

        const applied = apply(current);
        if (applied === null) return current;

        const next: RoomDocument = { ...applied, version: current.version + 1 };

        // The TTL is re-asserted on every write rather than extended: expiresAt
        // was fixed at creation, so an active room still dies at 90 minutes.
        const remainingMs = Math.max(0, next.expiresAt - now());
        const ttlSeconds = Math.max(1, Math.ceil(remainingMs / 1000));

        const written = await redis.setIfVersion(
          roomKey(crewCode),
          JSON.stringify(next),
          current.version,
          ttlSeconds,
        );
        if (written) return next;
      }

      throw new VersionConflictError(crewCode);
    },

    async destroy(crewCode) {
      await redis.del(roomKey(crewCode));
    },
  };
}
