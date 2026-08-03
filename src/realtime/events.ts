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
  | 'CONFLICT';

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
  startSession: () => void;
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
