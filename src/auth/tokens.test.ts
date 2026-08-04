import { describe, expect, it } from 'vitest';
import {
  issueIdentityToken,
  issuePlayerToken,
  verifyIdentityToken,
  verifyPlayerToken,
} from './tokens.js';

const secret = 'a-test-secret-that-is-long-enough-for-hs256';

describe('player tokens', () => {
  it('round-trips the crew code and player id', async () => {
    const token = await issuePlayerToken({ crewCode: 'ABC234', playerId: 'p1' }, secret);

    expect(await verifyPlayerToken(token, secret)).toEqual({
      crewCode: 'ABC234',
      playerId: 'p1',
    });
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await issuePlayerToken({ crewCode: 'ABC234', playerId: 'p1' }, secret);

    await expect(verifyPlayerToken(token, 'a-different-secret-of-sufficient-length')).rejects.toThrow();
  });

  it('rejects a tampered payload', async () => {
    const token = await issuePlayerToken({ crewCode: 'ABC234', playerId: 'p1' }, secret);
    const [header, , signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ crewCode: 'ABC234', playerId: 'admin' }))
      .toString('base64url');

    await expect(verifyPlayerToken(`${header}.${forged}.${signature}`, secret)).rejects.toThrow();
  });

  it('rejects garbage', async () => {
    await expect(verifyPlayerToken('not-a-token', secret)).rejects.toThrow();
    await expect(verifyPlayerToken('', secret)).rejects.toThrow();
  });
});

/**
 * A playerId is not a secret — it is broadcast to every member of the crew in
 * projected state. So it cannot be what proves who you are. The identity token
 * is that proof: unforgeable, held only by the device that earned it.
 */
describe('identity tokens', () => {
  it('round-trips the player id, with no crew attached', async () => {
    const token = await issueIdentityToken({ playerId: 'p1' }, secret);

    expect(await verifyIdentityToken(token, secret)).toEqual({ playerId: 'p1' });
  });

  it('outlives a session — it is the device’s identity, not its login', async () => {
    const token = await issueIdentityToken({ playerId: 'p1' }, secret);
    const [, payload] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString()) as {
      exp: number;
      iat: number;
    };

    // A crew that plays monthly must not be logged out between games.
    expect(claims.exp - claims.iat).toBeGreaterThan(300 * 24 * 60 * 60);
  });

  it('cannot be forged from a known player id', async () => {
    // The whole attack this closes: a teammate reads your playerId from the
    // roster and tries to present it as their own identity.
    const token = await issueIdentityToken({ playerId: 'p1' }, secret);
    const [header, , signature] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ playerId: 'victim' })).toString('base64url');

    await expect(verifyIdentityToken(`${header}.${forged}.${signature}`, secret)).rejects.toThrow();
    await expect(verifyIdentityToken(token, 'a-different-secret-of-sufficient-length')).rejects.toThrow();
  });

  it('is not interchangeable with a player token', async () => {
    const identity = await issueIdentityToken({ playerId: 'p1' }, secret);
    const player = await issuePlayerToken({ crewCode: 'ABC234', playerId: 'p1' }, secret);

    // A crew-scoped token must not pass as proof of identity, nor the reverse:
    // they authorise different things and are minted for different lifetimes.
    await expect(verifyIdentityToken(player, secret)).rejects.toThrow();
    await expect(verifyPlayerToken(identity, secret)).rejects.toThrow();
  });

  it('rejects garbage', async () => {
    await expect(verifyIdentityToken('not-a-token', secret)).rejects.toThrow();
    await expect(verifyIdentityToken('', secret)).rejects.toThrow();
  });
});
