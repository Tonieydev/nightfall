import { verifyPlayerToken } from '../auth/tokens.js';

export type VoiceTokenResult =
  | { ok: true; voiceEnabled: false }
  | { ok: true; voiceEnabled: true; token: string; identity: string; url: string }
  | { ok: false; status: 401 | 403 | 404; error: string };

export interface VoiceTokenDeps {
  jwtSecret: string;
  url: string;
  readRoom: (crewCode: string) => Promise<{ voiceEnabled: boolean } | null>;
  mint: (roomCode: string, playerId: string) => Promise<string>;
}

/** `Authorization: Bearer <player jwt>`, and nothing else is trusted. */
function bearer(header: string | null): string | null {
  if (header === null) return null;
  const match = /^Bearer (.+)$/.exec(header.trim());
  return match?.[1] ?? null;
}

/**
 * The LiveKit identity is taken from the verified player JWT, never from the
 * request — otherwise any caller could mint a token for someone else's identity
 * and subscribe as them, which would defeat the audio graph entirely.
 */
export async function issueVoiceToken(
  authHeader: string | null,
  crewCode: string,
  deps: VoiceTokenDeps,
): Promise<VoiceTokenResult> {
  const playerToken = bearer(authHeader);
  if (playerToken === null) {
    return { ok: false, status: 401, error: 'a player token is required' };
  }

  let claims;
  try {
    claims = await verifyPlayerToken(playerToken, deps.jwtSecret);
  } catch {
    return { ok: false, status: 401, error: 'that player token is not valid' };
  }

  // A token for crew A must not open a microphone in crew B.
  if (claims.crewCode !== crewCode) {
    return { ok: false, status: 403, error: 'that token belongs to another crew' };
  }

  const room = await deps.readRoom(crewCode);
  if (room === null) return { ok: false, status: 404, error: 'that room is no longer open' };
  if (!room.voiceEnabled) return { ok: true, voiceEnabled: false };

  return {
    ok: true,
    voiceEnabled: true,
    token: await deps.mint(crewCode, claims.playerId),
    identity: claims.playerId,
    url: deps.url,
  };
}
