import { verifyIdentityToken } from '@/auth/tokens';
import { loadServerConfig } from '@/config';
import { deleteIdentity, getPrisma } from '@/durable';

export const dynamic = 'force-dynamic';

/**
 * Wipes the address. The Player row and its recorded games survive: those games
 * are the crew's shared history of evenings that genuinely happened, and a hard
 * delete would rewrite everyone else's record of the same night. Withdrawing the
 * games themselves is what leaving a crew does.
 */
export async function POST(request: Request): Promise<Response> {
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

  await deleteIdentity(getPrisma(), playerId);
  return Response.json({ deleted: true });
}
