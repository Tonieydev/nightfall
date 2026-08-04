import { normaliseEmail } from '@/otp';
import { getOtpService } from '@/otp';
import { domainErrorCode } from '@/room-store';

export const dynamic = 'force-dynamic';

/** Railway terminates TLS upstream, so the client address arrives in a header. */
function callerIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first !== undefined && first !== '' ? first : 'unknown';
}

export async function POST(request: Request): Promise<Response> {
  const otp = getOtpService();
  if (!otp.enabled) {
    return Response.json({ error: 'saving your record is not available yet' }, { status: 503 });
  }

  const body: unknown = await request.json().catch(() => null);
  const email = normaliseEmail(
    typeof body === 'object' && body !== null && 'email' in body
      ? (body as { email: unknown }).email
      : undefined,
  );
  if (email === null) {
    return Response.json({ error: 'that does not look like an email address' }, { status: 400 });
  }

  try {
    await otp.request(email, callerIp(request));
  } catch (error) {
    switch (domainErrorCode(error)) {
      case 'OTP_RATE_LIMITED':
        return Response.json(
          { error: 'too many codes requested — try again later' },
          { status: 429 },
        );
      case 'EMAIL_SEND_FAILED':
        // Nothing the player did is wrong, so do not dress this as their
        // mistake. The code has already been discarded server-side.
        return Response.json(
          { error: 'we could not send that code — try again in a moment' },
          { status: 502 },
        );
      default:
        throw error;
    }
  }

  // Deliberately the same answer whether or not the address is already known:
  // this endpoint must not become a way to test who has an account.
  return Response.json({ sent: true });
}
