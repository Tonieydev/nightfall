import type { Server as HttpServer } from 'node:http';
import { Server, type Namespace } from 'socket.io';
import { PhaseTimers } from './phase-timers.js';
import { syncRoomVoice, type VoiceSync } from './sync-voice.js';
import { verifyPlayerToken } from '../auth/tokens.js';
import {
  GameNotStartedError,
  InvalidTargetError,
  NotYourActionError,
  WrongPhaseError,
  detectiveCheck,
  doctorSave,
  mafiaVote,
  castVote,
  clearVote,
  NotAMemberError,
  NotAPlayerError,
  NotEnoughPlayersError,
  NotGmError,
  NothingToRevertError,
  SessionAlreadyStartedError,
  advanceGame,
  endGame,
  forceKill,
  forceRevive,
  revertPhase,
  newSeed,
  projectRoom,
  setConnected,
  startSession,
  type RoomDocument,
  type RoomStoreFacade,
} from '../room-store/index.js';
import {
  REALTIME_NAMESPACE,
  readHandshakeToken,
  type ClientToServerEvents,
  type InterServerEvents,
  type RoomErrorCode,
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
}

function errorCodeFor(error: unknown): RoomErrorCode {
  if (error instanceof NotEnoughPlayersError) return 'NOT_ENOUGH_PLAYERS';
  if (error instanceof SessionAlreadyStartedError) return 'SESSION_ALREADY_STARTED';
  if (error instanceof NotAMemberError) return 'NOT_A_MEMBER';
  if (error instanceof NotGmError) return 'NOT_GM';
  if (error instanceof GameNotStartedError) return 'GAME_NOT_STARTED';
  if (error instanceof NotAPlayerError) return 'NOT_A_PLAYER';
  if (error instanceof NothingToRevertError) return 'NOTHING_TO_REVERT';
  if (error instanceof NotYourActionError) return 'NOT_YOUR_ACTION';
  if (error instanceof WrongPhaseError) return 'WRONG_PHASE';
  if (error instanceof InvalidTargetError) return 'INVALID_TARGET';
  return 'CONFLICT';
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
        void broadcastRoom(namespace, store, crewCode, timers, voice);
      });
    }
  }

  for (const socket of await namespace.in(crewCode).fetchSockets()) {
    socket.emit('roomState', projectRoom(doc, socket.data.playerId));
  }

  // Audio last: the graph is applied after players have already seen the phase
  // change, so voice follows the 400ms visual transition instead of leading it.
  await syncRoomVoice(doc, voice);
}

export function attachRealtime(httpServer: HttpServer, deps: RealtimeDeps): RealtimeServer {
  const io: RealtimeServer = new Server(httpServer, { serveClient: false });
  const timers = new PhaseTimers();
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
        await deps.store.room.mutate(crewCode, (doc) => setConnected(doc, playerId, true));
      } catch {
        fail('ROOM_NOT_FOUND', 'that room is no longer open');
        socket.disconnect(true);
        return;
      }
      await socket.join(crewCode);
      await broadcastRoom(namespace, deps.store, crewCode, timers, deps.voice);
    })();

    socket.on('startSession', () => {
      void (async () => {
        // SETNX decides the race; the loser stays a player rather than erroring.
        const won = await deps.store.session.claim(crewCode, playerId);
        if (!won) {
          await broadcastRoom(namespace, deps.store, crewCode, timers, deps.voice);
          return;
        }

        try {
          // The seed is minted once here and persisted with the game, so the
          // assignment can be replayed from the document later.
          const seed = newSeed();
          await deps.store.room.mutate(crewCode, (doc) =>
            startSession(doc, playerId, { seed, now: Date.now() }),
          );
        } catch (error) {
          // The claim is only real if the lobby rules accepted it.
          await deps.store.session.release(crewCode);
          fail(errorCodeFor(error), error instanceof Error ? error.message : 'could not start');
          return;
        }
        await broadcastRoom(namespace, deps.store, crewCode, timers, deps.voice);
      })();
    });

    // Every GM command is the same shape: mutate through the command layer,
    // which authorizes against the session's gmPlayerId, then re-project.
    // Authorization is never read from the client.
    const command = (apply: (doc: RoomDocument) => RoomDocument): void => {
      void (async () => {
        try {
          await deps.store.room.mutate(crewCode, apply);
        } catch (error) {
          fail(errorCodeFor(error), error instanceof Error ? error.message : 'command failed');
          return;
        }
        await broadcastRoom(namespace, deps.store, crewCode, timers, deps.voice);
      })();
    };

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
          await deps.store.room.mutate(crewCode, (doc) => setConnected(doc, playerId, false));
        } catch {
          return;
        }
        await broadcastRoom(namespace, deps.store, crewCode, timers, deps.voice);
      })();
    });
  });

  return io;
}
