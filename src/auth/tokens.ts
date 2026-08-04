import { SignJWT, jwtVerify } from 'jose';

const ALGORITHM = 'HS256';
const ISSUER = 'nightfall';
// Long enough to outlive the 90-minute room it belongs to.
const TOKEN_LIFETIME = '2h';

/**
 * The identity token outlives the room by design: it is what a device shows to
 * come back as the same person, and a crew that plays once a month must not be
 * turned into strangers in between.
 */
const IDENTITY_LIFETIME = '365d';

/**
 * Audiences keep the two tokens from standing in for each other. They authorise
 * different things — one a seat in a specific room for two hours, the other a
 * durable claim on a person's history — so neither may be presented as the other.
 */
const PLAYER_AUDIENCE = 'nightfall:room';
const IDENTITY_AUDIENCE = 'nightfall:identity';

export interface PlayerClaims {
  crewCode: string;
  playerId: string;
}

export interface IdentityClaims {
  playerId: string;
}

function keyFrom(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function issuePlayerToken(claims: PlayerClaims, secret: string): Promise<string> {
  return await new SignJWT({ crewCode: claims.crewCode, playerId: claims.playerId })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuer(ISSUER)
    .setAudience(PLAYER_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(TOKEN_LIFETIME)
    .sign(keyFrom(secret));
}

export async function verifyPlayerToken(token: string, secret: string): Promise<PlayerClaims> {
  const { payload } = await jwtVerify(token, keyFrom(secret), {
    issuer: ISSUER,
    audience: PLAYER_AUDIENCE,
    algorithms: [ALGORITHM],
  });

  const { crewCode, playerId } = payload;
  if (typeof crewCode !== 'string' || typeof playerId !== 'string') {
    throw new Error('player token is missing its claims');
  }

  return { crewCode, playerId };
}

/**
 * Proof that this device is this player, across crews and across sessions.
 *
 * It exists because a playerId cannot serve as its own proof: projected state
 * carries every member's playerId to every other member, so anyone in the crew
 * could otherwise present a teammate's id as their own and write into a history
 * that is about to be bound to a verified email address.
 */
export async function issueIdentityToken(
  claims: IdentityClaims,
  secret: string,
): Promise<string> {
  return await new SignJWT({ playerId: claims.playerId })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuer(ISSUER)
    .setAudience(IDENTITY_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(IDENTITY_LIFETIME)
    .sign(keyFrom(secret));
}

export async function verifyIdentityToken(
  token: string,
  secret: string,
): Promise<IdentityClaims> {
  const { payload } = await jwtVerify(token, keyFrom(secret), {
    issuer: ISSUER,
    audience: IDENTITY_AUDIENCE,
    algorithms: [ALGORITHM],
  });

  const { playerId } = payload;
  if (typeof playerId !== 'string') {
    throw new Error('identity token is missing its claims');
  }

  return { playerId };
}
