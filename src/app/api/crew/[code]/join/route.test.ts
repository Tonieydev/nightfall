import { describe, expect, it, vi } from 'vitest';

process.env['NIGHTFALL_DEV_MEMORY_REDIS'] = 'true';

/**
 * The store the route sees. `open` throws whatever the test plants, which is how
 * a server-registry error is delivered to a bundled route handler.
 */
const planted: { error: Error | null } = { error: null };

vi.mock('@/room-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/room-store')>();
  return {
    ...actual,
    getRoomStore: () => ({
      crew: { read: () => Promise.resolve({ code: 'ABC234', name: 'Crew' }) },
      room: {
        open: () => (planted.error === null ? Promise.resolve() : Promise.reject(planted.error)),
        mutate: () => Promise.resolve(),
      },
    }),
  };
});

/**
 * Loads the error classes and the route through two separate module registries,
 * which is what Next and the custom server actually have: webpack bundles the
 * route while tsx loads the same files for the server, so each holds its own
 * copy of every class.
 *
 * `foreign` stands for the server's copy. The route never sees it, so any check
 * based on class identity fails — which was the bug.
 */
async function boundary(): Promise<{
  foreign: typeof import('@/room-store/capacity.js');
  routeSide: typeof import('@/room-store');
  post: (body?: Record<string, unknown>) => Promise<Response>;
}> {
  vi.resetModules();
  const foreign = await import('@/room-store/capacity.js');

  vi.resetModules();
  const { POST } = await import('./route.js');
  const routeSide = await import('@/room-store');

  const post = async (body: Record<string, unknown> = { displayName: 'Ada' }): Promise<Response> =>
    await POST(
      new Request('http://localhost/api/crew/ABC234/join', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
      }),
      { params: Promise.resolve({ code: 'ABC234' }) },
    );

  return { foreign, routeSide, post };
}

describe('join route, errors crossing the bundle boundary', () => {
  it('really is two registries — otherwise every test below proves nothing', async () => {
    const { foreign, routeSide } = await boundary();

    expect(foreign.RoomCeilingReachedError).not.toBe(routeSide.RoomCeilingReachedError);
    expect(
      new foreign.RoomCeilingReachedError(8) instanceof routeSide.RoomCeilingReachedError,
    ).toBe(false);
  });

  it('answers 503 when the room ceiling is reached, not 500', async () => {
    const { foreign, post } = await boundary();
    planted.error = new foreign.RoomCeilingReachedError(8);

    const response = await post();

    expect(response.status).toBe(503);
    expect(await response.json()).toHaveProperty('error');
  });

  it('answers 503 for the kill switch', async () => {
    const { foreign, post } = await boundary();
    planted.error = new foreign.KillSwitchError();

    expect((await post()).status).toBe(503);
  });

  it('answers 409 for a full room', async () => {
    const { post } = await boundary();
    vi.resetModules();
    const lobby = await import('@/room-store/lobby.js');
    planted.error = new lobby.RoomFullError();

    expect((await post()).status).toBe(409);
  });

  it('answers 409 once the session has started', async () => {
    const { post } = await boundary();
    vi.resetModules();
    const lobby = await import('@/room-store/lobby.js');
    planted.error = new lobby.SessionAlreadyStartedError();

    expect((await post()).status).toBe(409);
  });

  it('still lets an unrecognised fault through rather than dressing it as a 503', async () => {
    const { post } = await boundary();
    // A real outage must stay a 500. Turning it into a polite 503 would hide it.
    planted.error = Object.assign(new Error('upstash unreachable'), { code: 'ECONNREFUSED' });

    await expect(post()).rejects.toThrow(/upstash unreachable/);
  });

  it('joins normally when nothing throws', async () => {
    const { post } = await boundary();
    planted.error = null;

    expect((await post()).status).toBe(200);
  });
});

/**
 * A playerId is public: projected state carries every member's id to every other
 * member. So the join route must never accept one as proof of who you are — a
 * teammate could read yours off the roster and join as you, writing into a
 * history that step 7 binds to a verified email address.
 */
describe('join route, who you are allowed to be', () => {
  const SECRET = 'nightfall-development-secret-not-for-production-use';

  it('ignores a playerId in the body and mints a fresh identity', async () => {
    const { post } = await boundary();
    planted.error = null;

    const body = (await (await post({ displayName: 'Ada', playerId: 'victim' })).json()) as {
      playerId: string;
    };

    expect(body.playerId).not.toBe('victim');
  });

  it('hands back an identity token the device can return with', async () => {
    const { post } = await boundary();
    const { verifyIdentityToken } = await import('@/auth/tokens');
    planted.error = null;

    const body = (await (await post()).json()) as { playerId: string; identityToken: string };

    expect(await verifyIdentityToken(body.identityToken, SECRET)).toEqual({
      playerId: body.playerId,
    });
  });

  it('returns the same player when a valid identity token comes back', async () => {
    const { post } = await boundary();
    const { issueIdentityToken } = await import('@/auth/tokens');
    planted.error = null;
    const identityToken = await issueIdentityToken({ playerId: 'returning-player' }, SECRET);

    const body = (await (await post({ displayName: 'Ada', identityToken })).json()) as {
      playerId: string;
    };

    expect(body.playerId).toBe('returning-player');
  });

  it('refuses a forged identity token rather than treating it as a newcomer', async () => {
    const { post } = await boundary();
    planted.error = null;
    const { issueIdentityToken } = await import('@/auth/tokens');
    const real = await issueIdentityToken({ playerId: 'p1' }, SECRET);
    const [header, , signature] = real.split('.');
    const forged = `${header}.${Buffer.from(JSON.stringify({ playerId: 'victim' })).toString('base64url')}.${signature}`;

    const response = await post({ displayName: 'Ada', identityToken: forged });

    // Silently minting a new id would hide the attempt; this must be visible.
    expect(response.status).toBe(401);
  });

  it('refuses a crew-scoped player token presented as an identity', async () => {
    const { post } = await boundary();
    const { issuePlayerToken } = await import('@/auth/tokens');
    planted.error = null;
    const playerToken = await issuePlayerToken({ crewCode: 'ABC234', playerId: 'p1' }, SECRET);

    expect((await post({ displayName: 'Ada', identityToken: playerToken })).status).toBe(401);
  });
});
