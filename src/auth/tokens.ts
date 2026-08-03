import { SignJWT, jwtVerify } from 'jose';

const ALGORITHM = 'HS256';
const ISSUER = 'nightfall';
// Long enough to outlive the 90-minute room it belongs to.
const TOKEN_LIFETIME = '2h';

export interface PlayerClaims {
  crewCode: string;
  playerId: string;
}

function keyFrom(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function issuePlayerToken(claims: PlayerClaims, secret: string): Promise<string> {
  return await new SignJWT({ crewCode: claims.crewCode, playerId: claims.playerId })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(TOKEN_LIFETIME)
    .sign(keyFrom(secret));
}

export async function verifyPlayerToken(token: string, secret: string): Promise<PlayerClaims> {
  const { payload } = await jwtVerify(token, keyFrom(secret), {
    issuer: ISSUER,
    algorithms: [ALGORITHM],
  });

  const { crewCode, playerId } = payload;
  if (typeof crewCode !== 'string' || typeof playerId !== 'string') {
    throw new Error('player token is missing its claims');
  }

  return { crewCode, playerId };
}
