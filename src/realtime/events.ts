export const REALTIME_NAMESPACE = '/nightfall';

// One room holds every connection for this step. Step 3 replaces it with the
// crew room; the per-recipient emit below is what has to survive that change.
export const HARNESS_ROOM = 'harness';

export interface WelcomePayload {
  connectionId: string;
  name: string;
  peerCount: number;
}

/** Sent to the socket that pinged, and to nobody else. Carries its own id. */
export interface PongPayload {
  kind: 'pong';
  connectionId: string;
  name: string;
  serverTime: number;
}

/**
 * Broadcast to every socket except the one that pinged. Deliberately carries
 * no connection id — the asymmetry with PongPayload is the thing under test.
 */
export interface PeerPingPayload {
  kind: 'peer-ping';
  peerName: string;
  peerCount: number;
  serverTime: number;
}

export interface ServerToClientEvents {
  welcome: (payload: WelcomePayload) => void;
  pong: (payload: PongPayload) => void;
  peerPing: (payload: PeerPingPayload) => void;
}

export interface ClientToServerEvents {
  ping: () => void;
}

export type InterServerEvents = Record<string, never>;

export interface SocketData {
  connectionId: string;
  name: string;
}

export const MAX_NAME_LENGTH = 40;

export function readName(auth: unknown): string {
  if (typeof auth === 'object' && auth !== null && 'name' in auth) {
    const value = (auth as { name: unknown }).name;
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim().slice(0, MAX_NAME_LENGTH);
    }
  }
  return 'anonymous';
}
