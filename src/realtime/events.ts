import type { RoomView } from '../room-store/index.js';

export const REALTIME_NAMESPACE = '/nightfall';

export type RoomErrorCode =
  | 'UNAUTHENTICATED'
  | 'ROOM_NOT_FOUND'
  | 'NOT_A_MEMBER'
  | 'NOT_ENOUGH_PLAYERS'
  | 'SESSION_ALREADY_STARTED'
  | 'NOT_GM'
  | 'GAME_NOT_STARTED'
  | 'NOT_A_PLAYER'
  | 'NOTHING_TO_REVERT'
  | 'NOT_YOUR_ACTION'
  | 'WRONG_PHASE'
  | 'INVALID_TARGET'
  | 'CHAT_NOT_ALLOWED'
  | 'CHAT_RATE_LIMITED'
  | 'INVALID_CONFIG'
  | 'CONFLICT';

export interface SessionSetup {
  mafiaCount: number | null;
  doctor: boolean;
  detective: boolean;
  mafiaNightMs: number;
  /** How many the mafia may take in a night. A ceiling on the ballot, not a quota. */
  nightKills: number;
  /** Advisory day length, or null. Drives nothing. */
  dayTargetMs: number | null;
}

export interface RoomErrorPayload {
  code: RoomErrorCode;
  message: string;
}

export interface ServerToClientEvents {
  /** Always the result of projectRoom for this recipient. Never raw state. */
  roomState: (view: RoomView) => void;
  roomError: (payload: RoomErrorPayload) => void;
}

export interface ClientToServerEvents {
  /**
   * The GM's pre-game setup. Validated server-side regardless: the client's
   * pre-Start check exists to warn the GM early, not to be trusted.
   */
  startSession: (setup?: SessionSetup) => void;
  /** GM-only. The GM never names the target phase; the server owns legal order. */
  advance: () => void;
  forceKill: (targetId: string) => void;
  forceRevive: (targetId: string) => void;
  revertPhase: () => void;
  endGame: () => void;
  /** Authorized server-side by living role; the phase decides who may act. */
  mafiaVote: (targetId: string) => void;
  doctorSave: (targetId: string) => void;
  detectiveCheck: (targetId: string) => void;
  /** Public and live: the ballot is projected to everyone, never a secret. */
  castVote: (targetId: string) => void;
  clearVote: () => void;
  /** Routed by computeAudioGraph server-side; the sender names no audience. */
  sendChat: (text: string) => void;
  /** GM-only. The console moves; no game logic travels with it. */
  handOffGm: (targetId: string) => void;
  /**
   * Back to a lobby, same room, same people. Anyone may ask for it once the
   * game is over: the console is over too, and the next moderator is not
   * decided yet. Refused while a game is running.
   */
  newSession: () => void;
  /**
   * This device has finished connecting to the voice room.
   *
   * Subscriptions are issued by walking the participants LiveKit reports, so a
   * player who joins between phase changes is invisible to the last pass and
   * hears nobody until the next one. Announcing arrival is what closes that
   * window; it carries no argument and grants nothing.
   */
  voiceReady: () => void;
}

export type InterServerEvents = Record<string, never>;

export interface SocketData {
  crewCode: string;
  playerId: string;
}

/** The socket handshake carries the player JWT and nothing else. */
export function readHandshakeToken(auth: unknown): string | null {
  if (typeof auth === 'object' && auth !== null && 'token' in auth) {
    const value = (auth as { token: unknown }).token;
    if (typeof value === 'string' && value !== '') return value;
  }
  return null;
}
