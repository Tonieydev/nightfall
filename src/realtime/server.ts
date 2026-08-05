import type { Server as HttpServer } from 'node:http';
import { Server, type Namespace } from 'socket.io';
import { PhaseTimers } from './phase-timers.js';
import { syncRoomVoice, type DurableSync, type VoiceSync } from './sync-voice.js';
import { verifyPlayerToken } from '../auth/tokens.js';
import {
  domainErrorCode,
  detectiveCheck,
  doctorSave,
  mafiaVote,
  castVote,
  clearVote,
  advanceGame,
  endGame,
  handOffGm,
  postChat,
  forceKill,
  forceRevive,
  revertPhase,
  newSeed,
  projectRoomFor,
  setConnected,
  startSession,
  configProblems,
  DEFAULT_GAME_CONFIG,
  type RoomDocument,
  type RoomStoreFacade,
} from '../room-store/index.js';
import {
  REALTIME_NAMESPACE,
  readHandshakeToken,
  type ClientToServerEvents,
  type InterServerEvents,
  type RoomErrorCode,
  type SessionSetup,
  type ServerToClientEvents,
  type SocketData,
} from './events.js';

export type RealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type RoomNamespace = Namespace<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export interface RealtimeDeps {
  store: RoomStoreFacade;
  jwtSecret: string;
  /** Omitted in tests that do not exercise audio. */
  voice?: VoiceSync;
  /** Omitted in tests that do not exercise the durable record. */
  durable?: DurableSync;
}

/**
 * The socket handlers live in the server's own registry today, so instanceof
 * happened to work here — but it is the identical pattern that broke the HTTP
 * routes, one import-graph change away from breaking the same way. The wire
 * codes and the error codes are the same strings, so this is now a pass-through
 * for everything the client has a name for.
 */
const WIRE_CODES: ReadonlySet<string> = new Set<RoomErrorCode>([
  'NOT_ENOUGH_PLAYERS',
  'SESSION_ALREADY_STARTED',
  'NOT_A_MEMBER',
  'NOT_GM',
  'GAME_NOT_STARTED',
  'NOT_A_PLAYER',
  'NOTHING_TO_REVERT',
  'NOT_YOUR_ACTION',
  'WRONG_PHASE',
  'INVALID_TARGET',
  'CHAT_NOT_ALLOWED',
  'CHAT_RATE_LIMITED',
  'INVALID_CONFIG',
]);

/** The GM's setup, or the defaults when an older client sends nothing. */
function configOf(setup: SessionSetup | undefined) {
  if (setup === undefined) return DEFAULT_GAME_CONFIG;
  return {
    mafiaCount: setup.mafiaCount,
    doctor: setup.doctor,
    detective: setup.detective,
    mafiaNightMs: setup.mafiaNightMs,
    nightKills: setup.nightKills,
  };
}

function errorCodeFor(error: unknown): RoomErrorCode {
  const code = domainErrorCode(error);
  return code !== null && WIRE_CODES.has(code) ? (code as RoomErrorCode) : 'CONFLICT';
}

/**
 * Sends every socket in the crew its own projection. There is deliberately no
 * path here that emits a document to more than one recipient: the projection
 * runs inside the loop, per socket, before the emit.
 */
export async function broadcastRoom(
  namespace: RoomNamespace,
  store: RoomStoreFacade,
  crewCode: string,
  timers?: PhaseTimers,
  voice?: VoiceSync,
  durable?: DurableSync,
): Promise<void> {
  // A reconciling read: if the phase expired, it is already resolved by here.
  const doc = await store.room.read(crewCode);
  if (doc === null) return;

  // Re-arm the fast path from whatever state we just broadcast. Losing this
  // costs latency, never correctness — the next read would resolve it anyway.
  if (timers !== undefined) {
    const endsAt = doc.game?.phaseEndsAt ?? null;
    if (endsAt === null) timers.clear(crewCode);
    else {
      timers.schedule(crewCode, endsAt, Date.now(), () => {
        void broadcastRoom(namespace, store, crewCode, timers, voice, durable);
      });
    }
  }

  // Projected per recipient, as always — but the audio graph behind those
  // projections is built once for the whole broadcast rather than once per
  // socket, and once per socket rather than once per chat message.
  const sockets = await namespace.in(crewCode).fetchSockets();
  const views = projectRoomFor(
    doc,
    sockets.map((socket) => socket.data.playerId),
  );
  sockets.forEach((socket, i) => {
    const view = views[i];
    if (view !== undefined) socket.emit('roomState', view);
  });

  // Audio last: the graph is applied after players have already seen the phase
  // change, so voice follows the 400ms visual transition instead of leading it.
  await syncRoomVoice(doc, voice, durable);
}

/**
 * A token bucket per player, held in process. Not conduct policing — every one
 * of these events triggers a Redis compare-and-set, so an unthrottled client
 * can burn the Upstash request quota and churn version conflicts for everyone
 * else in the room. One backend instance, so in-process state is sufficient.
 */
class Budget {
  readonly #recent = new Map<string, number[]>();

  constructor(
    private readonly windowMs: number,
    private readonly allowance: number,
  ) {}

  allow(playerId: string, now: number): boolean {
    const since = now - this.windowMs;
    const kept = (this.#recent.get(playerId) ?? []).filter((at) => at > since);
    if (kept.length >= this.allowance) {
      this.#recent.set(playerId, kept);
      return false;
    }
    this.#recent.set(playerId, [...kept, now]);
    return true;
  }
}

export function attachRealtime(httpServer: HttpServer, deps: RealtimeDeps): RealtimeServer {
  const io: RealtimeServer = new Server(httpServer, { serveClient: false });
  const timers = new PhaseTimers();
  // Chat is a stuck-key guard; commands are a quota guard. Generous enough that
  // a decisive GM or a player changing their vote never notices.
  const chatBudget = new Budget(10_000, 5);
  const commandBudget = new Budget(10_000, 25);
  const namespace: RoomNamespace = io.of(REALTIME_NAMESPACE);

  namespace.use((socket, next) => {
    const token = readHandshakeToken(socket.handshake.auth);
    if (token === null) {
      next(new Error('UNAUTHENTICATED'));
      return;
    }

    verifyPlayerToken(token, deps.jwtSecret)
      .then((claims) => {
        socket.data.crewCode = claims.crewCode;
        socket.data.playerId = claims.playerId;
        next();
      })
      .catch(() => {
        next(new Error('UNAUTHENTICATED'));
      });
  });

  namespace.on('connection', (socket) => {
    const { crewCode, playerId } = socket.data;

    const fail = (code: RoomErrorCode, message: string): void => {
      socket.emit('roomError', { code, message });
    };

    void (async () => {
      try {
        await deps.store.room.mutate(crewCode, (doc) => setConnected(doc, playerId, true, Date.now()));
      } catch {
        fail('ROOM_NOT_FOUND', 'that room is no longer open');
        socket.disconnect(true);
        return;
      }
      await socket.join(crewCode);
      await broadcastRoom(namespace, deps.store, crewCode, timers, deps.voice, deps.durable);
    })();

    socket.on('startSession', (setup) => {
      void (async () => {
        // Validated here as well as in the panel: the client's check warns the
        // GM early, it does not authorise anything.
        const doc = await deps.store.room.read(crewCode);
        const problems = configProblems(
          configOf(setup),
          Math.max(0, (doc?.members.length ?? 0) - 1),
          setup?.dayTargetMs ?? null,
        );
        if (problems.length > 0) {
          fail('INVALID_CONFIG', problems.join(' '));
          return;
        }

        // SETNX decides the race; the loser stays a player rather than erroring.
        const won = await deps.store.session.claim(crewCode, playerId);
        if (!won) {
          await broadcastRoom(namespace, deps.store, crewCode, timers, deps.voice, deps.durable);
          return;
        }

        try {
          // The seed is minted once here and persisted with the game, so the
          // assignment can be replayed from the document later.
          const seed = newSeed();
          await deps.store.room.mutate(crewCode, (doc) =>
            startSession(doc, playerId, {
              seed,
              now: Date.now(),
              config: configOf(setup),
              dayTargetMs: setup?.dayTargetMs ?? null,
            }),
          );
        } catch (error) {
          // The claim is only real if the lobby rules accepted it.
          await deps.store.session.release(crewCode);
          fail(errorCodeFor(error), error instanceof Error ? error.message : 'could not start');
          return;
        }
        await broadcastRoom(namespace, deps.store, crewCode, timers, deps.voice, deps.durable);
      })();
    });

    // Every GM command is the same shape: mutate through the command layer,
    // which authorizes against the session's gmPlayerId, then re-project.
    // Authorization is never read from the client.
    const command = (apply: (doc: RoomDocument) => RoomDocument): void => {
      void (async () => {
        if (!commandBudget.allow(playerId, Date.now())) {
          fail('CONFLICT', 'slow down a moment');
          return;
        }
        try {
          await deps.store.room.mutate(crewCode, apply);
        } catch (error) {
          fail(errorCodeFor(error), error instanceof Error ? error.message : 'command failed');
          return;
        }
        await broadcastRoom(namespace, deps.store, crewCode, timers, deps.voice, deps.durable);
      })();
    };

    // Not a command: no state changes, the room is simply re-broadcast so the
    // audio graph is reapplied against a participant list that now includes
    // this device. Rate limited like everything else, because it reaches Redis.
    socket.on('voiceReady', () => {
      void (async () => {
        if (!commandBudget.allow(playerId, Date.now())) return;
        await broadcastRoom(namespace, deps.store, crewCode, timers, deps.voice, deps.durable);
      })();
    });

    socket.on('advance', () => {
      command((doc) => advanceGame(doc, playerId, Date.now()));
    });
    socket.on('forceKill', (targetId) => {
      command((doc) => forceKill(doc, playerId, targetId));
    });
    socket.on('forceRevive', (targetId) => {
      command((doc) => forceRevive(doc, playerId, targetId));
    });
    socket.on('revertPhase', () => {
      command((doc) => revertPhase(doc, playerId));
    });
    socket.on('endGame', () => {
      command((doc) => endGame(doc, playerId));
    });
    socket.on('handOffGm', (targetId) => {
      command((doc) => handOffGm(doc, playerId, targetId, Date.now()));
    });

    socket.on('sendChat', (text) => {
      if (!chatBudget.allow(playerId, Date.now())) {
        fail('CHAT_RATE_LIMITED', 'slow down a moment');
        return;
      }
      command((doc) => postChat(doc, playerId, text, Date.now()));
    });

    socket.on('mafiaVote', (targetId) => {
      command((doc) => mafiaVote(doc, playerId, targetId));
    });
    socket.on('doctorSave', (targetId) => {
      command((doc) => doctorSave(doc, playerId, targetId));
    });
    socket.on('detectiveCheck', (targetId) => {
      command((doc) => detectiveCheck(doc, playerId, targetId));
    });

    socket.on('castVote', (targetId) => {
      command((doc) => castVote(doc, playerId, targetId));
    });
    socket.on('clearVote', () => {
      command((doc) => clearVote(doc, playerId));
    });

    socket.on('disconnect', () => {
      void (async () => {
        try {
          await deps.store.room.mutate(crewCode, (doc) => setConnected(doc, playerId, false, Date.now()));
        } catch {
          return;
        }
        await broadcastRoom(namespace, deps.store, crewCode, timers, deps.voice, deps.durable);
      })();
    });
  });

  return io;
}
