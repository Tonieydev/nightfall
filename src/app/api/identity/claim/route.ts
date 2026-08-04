import { issueIdentityToken, verifyIdentityToken } from '@/auth/tokens';
import { loadServerConfig } from '@/config';
import { claimIdentity, getPrisma } from '@/durable';
import { getOtpService, normaliseEmail } from '@/otp';
import { domainErrorCode } from '@/room-store';

export const dynamic = 'force-dynamic';

interface ClaimBody {
  email: string;
  code: string;
  identityToken: string | null;
}

function readBody(body: unknown): ClaimBody | null {
  if (typeof body !== 'object' || body === null) return null;
  const { email, code, identityToken } = body as Record<string, unknown>;

  const address = normaliseEmail(email);
  if (address === null || typeof code !== 'string' || !/^\d{6}$/.test(code)) return null;

  return {
    email: address,
    code,
    identityToken: typeof identityToken === 'string' && identityToken !== '' ? identityToken : null,
  };
}

export async function POST(request: Request): Promise<Response> {
  const otp = getOtpService();
  if (!otp.enabled) {
    return Response.json({ error: 'saving your record is not available yet' }, { status: 503 });
  }

  const parsed = readBody(await request.json().catch(() => null));
  if (parsed === null) {
    return Response.json({ error: 'that code or address is not valid' }, { status: 400 });
  }

  const { jwtSecret } = loadServerConfig();

  // The device's current identity, if it has one. Unverifiable means absent
  // rather than an error: a fresh phone recovering an account has none, and
  // that is the ordinary case.
  let playerId: string | null = null;
  if (parsed.identityToken !== null) {
    try {
      ({ playerId } = await verifyIdentityToken(parsed.identityToken, jwtSecret));
    } catch {
      return Response.json({ error: 'that identity could not be verified' }, { status: 401 });
    }
  }

  // Verified before anything is bound, and consumed either way: a code that has
  // been offered once is spent.
  if (!(await otp.verify(parsed.email, parsed.code))) {
    return Response.json({ error: 'that code is wrong or has expired' }, { status: 401 });
  }

  try {
    const result = await claimIdentity(getPrisma(), { playerId, email: parsed.email });

    return Response.json({
      playerId: result.playerId,
      merged: result.merged,
      identityToken: await issueIdentityToken({ playerId: result.playerId }, jwtSecret),
    });
  } catch (error) {
    switch (domainErrorCode(error)) {
      case 'IDENTITY_NOT_FOUND':
        return Response.json({ error: 'no saved record for that address' }, { status: 404 });
      case 'MERGE_REFUSED':
        return Response.json(
          { error: 'this device already has its own saved record' },
          { status: 409 },
        );
      case 'EMAIL_INVALID':
        return Response.json({ error: 'that does not look like an email address' }, { status: 400 });
      default:
        throw error;
    }
  }
}
