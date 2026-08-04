import { verifyIdentityToken } from '@/auth/tokens';
import { loadServerConfig } from '@/config';
import { getPrisma, leaveCrew } from '@/durable';
import { isCrewCode, normaliseCrewCode } from '@/room-store';

export const dynamic = 'force-dynamic';

/**
 * Leaving takes this member's recorded games with them, per the spec's privacy
 * rule. Gated on the identity token rather than a playerId: an id is broadcast
 * to the whole crew, so accepting one here would let any member delete another
 * member's history.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
): Promise<Response> {
  const code = normaliseCrewCode((await context.params).code);
  if (!isCrewCode(code)) {
    return Response.json({ error: 'that is not a crew code' }, { status: 400 });
  }

  const body: unknown = await request.json().catch(() => null);
  const token =
    typeof body === 'object' && body !== null && 'identityToken' in body
      ? (body as { identityToken: unknown }).identityToken
      : undefined;

  if (typeof token !== 'string' || token === '') {
    return Response.json({ error: 'sign in on this device first' }, { status: 401 });
  }

  let playerId: string;
  try {
    ({ playerId } = await verifyIdentityToken(token, loadServerConfig().jwtSecret));
  } catch {
    return Response.json({ error: 'that identity could not be verified' }, { status: 401 });
  }

  await leaveCrew(getPrisma(), { crewCode: code, playerId });
  return Response.json({ left: true });
}
