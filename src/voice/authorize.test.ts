import { describe, expect, it, vi } from 'vitest';
import { issuePlayerToken } from '../auth/tokens.js';
import { issueVoiceToken, type VoiceTokenDeps } from './authorize.js';

const SECRET = 'a-test-secret-that-is-long-enough-for-hs256';
const CREW = 'ABC234';

function deps(overrides: Partial<VoiceTokenDeps> = {}): VoiceTokenDeps {
  return {
    jwtSecret: SECRET,
    url: 'wss://example.livekit.cloud',
    readRoom: () => Promise.resolve({ voiceEnabled: true }),
    mint: vi.fn((room: string, playerId: string) => Promise.resolve(`lk:${room}:${playerId}`)),
    ...overrides,
  };
}

const bearer = async (crewCode: string, playerId: string) =>
  `Bearer ${await issuePlayerToken({ crewCode, playerId }, SECRET)}`;

describe('voice token authorization', () => {
  it('mints a token for a verified player', async () => {
    const result = await issueVoiceToken(await bearer(CREW, 'p1'), CREW, deps());

    expect(result).toEqual({
      ok: true,
      voiceEnabled: true,
      token: 'lk:ABC234:p1',
      identity: 'p1',
      url: 'wss://example.livekit.cloud',
    });
  });

  it('refuses a caller with no player token', async () => {
    expect(await issueVoiceToken(null, CREW, deps())).toMatchObject({ ok: false, status: 401 });
    expect(await issueVoiceToken('', CREW, deps())).toMatchObject({ ok: false, status: 401 });
    expect(await issueVoiceToken('Bearer', CREW, deps())).toMatchObject({ ok: false, status: 401 });
  });

  it('refuses a forged or foreign-signed token', async () => {
    const forged = `Bearer ${await issuePlayerToken({ crewCode: CREW, playerId: 'p1' }, 'a-completely-different-secret-value')}`;

    expect(await issueVoiceToken(forged, CREW, deps())).toMatchObject({ ok: false, status: 401 });
    expect(await issueVoiceToken('Bearer not-a-jwt', CREW, deps())).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it('takes the identity from the JWT, never from the caller', async () => {
    const mint = vi.fn((room: string, playerId: string) => Promise.resolve(`lk:${room}:${playerId}`));

    // The caller is p1 and cannot ask to be minted as anyone else — there is no
    // parameter through which to try.
    const result = await issueVoiceToken(await bearer(CREW, 'p1'), CREW, deps({ mint }));

    expect(mint).toHaveBeenCalledWith(CREW, 'p1');
    expect(result).toMatchObject({ identity: 'p1' });
  });

  it('refuses a token minted for another crew', async () => {
    const result = await issueVoiceToken(await bearer('XYZ789', 'p1'), CREW, deps());

    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it('mints nothing for a room that is gone', async () => {
    const result = await issueVoiceToken(
      await bearer(CREW, 'p1'),
      CREW,
      deps({ readRoom: () => Promise.resolve(null) }),
    );

    expect(result).toMatchObject({ ok: false, status: 404 });
  });

  it('tells the client not to connect when voice is unfunded', async () => {
    const mint = vi.fn();
    const result = await issueVoiceToken(
      await bearer(CREW, 'p1'),
      CREW,
      deps({ readRoom: () => Promise.resolve({ voiceEnabled: false }), mint }),
    );

    expect(result).toEqual({ ok: true, voiceEnabled: false });
    expect(mint, 'no LiveKit room exists to mint against').not.toHaveBeenCalled();
  });
});
