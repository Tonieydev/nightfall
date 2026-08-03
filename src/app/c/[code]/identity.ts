export interface StoredIdentity {
  playerId: string;
  displayName: string;
}

// Identity is per crew, not per device: displayName binds to crew membership,
// and a shared phone can hold a different name for each crew it has joined.
const keyFor = (crewCode: string): string => `nightfall:identity:${crewCode}`;

export function readIdentity(crewCode: string): StoredIdentity | null {
  try {
    const raw = window.localStorage.getItem(keyFor(crewCode));
    if (raw === null) return null;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { playerId, displayName } = parsed as Record<string, unknown>;
    if (typeof playerId !== 'string' || typeof displayName !== 'string') return null;

    return { playerId, displayName };
  } catch {
    return null;
  }
}

export function writeIdentity(crewCode: string, identity: StoredIdentity): void {
  try {
    window.localStorage.setItem(keyFor(crewCode), JSON.stringify(identity));
  } catch {
    // A private-mode browser that refuses storage still gets to play; they just
    // arrive as a new player after a refresh.
  }
}

export function clearIdentity(crewCode: string): void {
  try {
    window.localStorage.removeItem(keyFor(crewCode));
  } catch {
    // Nothing to do — see writeIdentity.
  }
}

const SESSION_TOKEN = 'nightfall:token';

export function readToken(crewCode: string): string | null {
  try {
    return window.sessionStorage.getItem(`${SESSION_TOKEN}:${crewCode}`);
  } catch {
    return null;
  }
}

export function writeToken(crewCode: string, token: string): void {
  try {
    window.sessionStorage.setItem(`${SESSION_TOKEN}:${crewCode}`, token);
  } catch {
    // See writeIdentity.
  }
}
