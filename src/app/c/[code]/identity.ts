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

/**
 * Device-wide, not per crew: this proves who the human is, and one human is the
 * same person in every crew they play in. The per-crew entry above only carries
 * the name, which genuinely does differ from crew to crew.
 *
 * This is what a returning device presents instead of a playerId — an id is
 * broadcast to the whole crew in projected state and so proves nothing.
 */
const IDENTITY_TOKEN = 'nightfall:identity-token';

export function readIdentityToken(): string | null {
  try {
    return window.localStorage.getItem(IDENTITY_TOKEN);
  } catch {
    return null;
  }
}

export function writeIdentityToken(token: string): void {
  try {
    window.localStorage.setItem(IDENTITY_TOKEN, token);
  } catch {
    // See writeIdentity — a browser that refuses storage still gets to play,
    // it just arrives as someone new next time.
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

// Stored beside the token because it arrives with it: a refresh mid-game
// restores the token without re-joining, and the debrief still has to know
// whether it may offer to save a record.
const CLAIM_AVAILABLE = 'nightfall:claim-available';

export function readClaimAvailable(): boolean {
  try {
    return window.sessionStorage.getItem(CLAIM_AVAILABLE) === 'true';
  } catch {
    return false;
  }
}

export function writeClaimAvailable(available: boolean): void {
  try {
    window.sessionStorage.setItem(CLAIM_AVAILABLE, String(available));
  } catch {
    // See writeIdentity.
  }
}
