import { describe, expect, it } from 'vitest';
import { issuePlayerToken, verifyPlayerToken } from './tokens.js';

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
