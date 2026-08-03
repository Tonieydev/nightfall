import { assignRoles, type GameConfig, type Player } from '../game-core/index.js';
import { MAX_SEATS, MIN_LOBBY_TO_START, MIN_PLAYERS_TO_START } from './keys.js';
import { mulberry32 } from './prng.js';
import type { RoomDocument } from './types.js';

export class RoomFullError extends Error {
  constructor() {
    super(`room is full at ${MAX_SEATS} seats`);
    this.name = 'RoomFullError';
  }
}

export class NotEnoughPlayersError extends Error {
  constructor(present: number) {
    super(
      `need ${MIN_LOBBY_TO_START} in the lobby to start ` +
        `(a GM plus ${MIN_PLAYERS_TO_START} players), have ${present}`,
    );
    this.name = 'NotEnoughPlayersError';
  }
}

export class SessionAlreadyStartedError extends Error {
  constructor() {
    super('this crew already has a session running');
    this.name = 'SessionAlreadyStartedError';
  }
}

export class NotAMemberError extends Error {
  constructor(playerId: string) {
    super(`${playerId} is not in this lobby`);
    this.name = 'NotAMemberError';
  }
}

export interface JoinRequest {
  playerId: string;
  displayName: string;
  now: number;
}

export function joinLobby(doc: RoomDocument, join: JoinRequest): RoomDocument {
  const existing = doc.members.find((m) => m.playerId === join.playerId);

  // Rejoining is how a refresh or a locked phone comes back, so it must never
  // consume a second seat or be blocked by a session already under way.
  if (existing !== undefined) {
    return {
      ...doc,
      members: doc.members.map((m) =>
        m.playerId === join.playerId
          ? { ...m, displayName: join.displayName, connected: true }
          : m,
      ),
    };
  }

  if (doc.gmPlayerId !== null) throw new SessionAlreadyStartedError();
  if (doc.members.length >= MAX_SEATS) throw new RoomFullError();

  return {
    ...doc,
    members: [
      ...doc.members,
      {
        playerId: join.playerId,
        displayName: join.displayName,
        connected: true,
        joinedAt: join.now,
      },
    ],
  };
}

export function setConnected(
  doc: RoomDocument,
  playerId: string,
  connected: boolean,
): RoomDocument {
  return {
    ...doc,
    members: doc.members.map((m) => (m.playerId === playerId ? { ...m, connected } : m)),
  };
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  mafiaCount: null,
  doctor: true,
  detective: true,
  mafiaNightMs: 45_000,
};

export interface StartOptions {
  seed: number;
  now: number;
  config?: GameConfig;
}

export function startSession(
  doc: RoomDocument,
  gmPlayerId: string,
  options: StartOptions,
): RoomDocument {
  if (doc.gmPlayerId !== null) throw new SessionAlreadyStartedError();
  if (!doc.members.some((m) => m.playerId === gmPlayerId)) throw new NotAMemberError(gmPlayerId);
  if (doc.members.length < MIN_LOBBY_TO_START) {
    throw new NotEnoughPlayersError(doc.members.length);
  }

  const config = options.config ?? DEFAULT_GAME_CONFIG;
  // The GM narrates: never passed to assignRoles, so they draw no role and are
  // never a kill, save, investigate or vote target.
  const playing = doc.members.filter((m) => m.playerId !== gmPlayerId);
  const roles = assignRoles(
    playing.map((m) => m.playerId),
    config,
    mulberry32(options.seed),
  );

  const players: Player[] = playing.map((m) => {
    const role = roles[m.playerId];
    if (role === undefined) throw new Error(`assignRoles skipped ${m.playerId}`);
    return {
      id: m.playerId,
      name: m.displayName,
      role,
      alive: true,
      eliminatedAtPhase: null,
      eliminatedBy: null,
    };
  });

  return {
    ...doc,
    gmPlayerId,
    seed: options.seed,
    game: {
      version: 1,
      // The game opens where the phase machine opens; ADVANCE moves it on, so
      // no transition ever bypasses game-core.
      phase: 'LOBBY',
      phaseNumber: 0,
      phaseEndsAt: null,
      gmPlayerId,
      config,
      players,
      night: { mafiaVotes: {}, doctorSave: null, detectiveCheck: null },
      dayVotes: {},
      lastNight: null,
      winner: null,
    },
  };
}
