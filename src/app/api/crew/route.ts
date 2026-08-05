import { domainErrorCode, getRedis, getRoomStore, spendCrewAllowance } from '@/room-store';

export const dynamic = 'force-dynamic';

function readName(body: unknown): string {
  if (typeof body === 'object' && body !== null && 'name' in body) {
    const value = (body as { name: unknown }).name;
    if (typeof value === 'string' && value.trim() !== '') return value.trim().slice(0, 40);
  }
  return 'Nightfall crew';
}

/** Railway terminates TLS upstream, so the caller's address arrives in a header. */
function callerIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  return first !== undefined && first !== '' ? first : 'unknown';
}

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => ({}));

  // Crews have no TTL, so creation has to be bounded or Redis grows forever.
  try {
    await spendCrewAllowance(getRedis(), callerIp(request), Date.now());
  } catch (error) {
    if (domainErrorCode(error) === 'CREW_RATE_LIMITED') {
      return Response.json(
        { error: 'too many crews from here — try again later' },
        { status: 429 },
      );
    }
    throw error;
  }

  try {
    const crew = await getRoomStore().crew.create(readName(body));
    return Response.json({ code: crew.code, name: crew.name }, { status: 201 });
  } catch (error) {
    // By code, not by class: see the note in src/room-store/errors.ts.
    if (domainErrorCode(error) === 'CREW_CODE_EXHAUSTED') {
      return Response.json({ error: 'could not allocate a crew code' }, { status: 503 });
    }
    throw error;
  }
}
