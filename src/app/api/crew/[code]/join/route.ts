import { randomUUID } from 'node:crypto';
import { issueIdentityToken, issuePlayerToken, verifyIdentityToken } from '@/auth/tokens';
import { loadServerConfig } from '@/config';
import {
  domainErrorCode,
  errorMessage,
  getRoomStore,
  isCrewCode,
  parseDisplayName,
  joinLobby,
  normaliseCrewCode,
} from '@/room-store';

export const dynamic = 'force-dynamic';

interface JoinBody {
  displayName: string;
  /**
   * Proof of a previous identity, or null for a newcomer. Deliberately not a
   * playerId: projected state broadcasts every member's id to the whole crew,
   * so accepting one here would let any teammate join as anyone else.
   */
  identityToken: string | null;
}

function readBody(body: unknown, crewCode: string): JoinBody | null {
  if (typeof body !== 'object' || body === null) return null;

  const raw = 'displayName' in body ? (body as { displayName: unknown }).displayName : undefined;
  const displayName = parseDisplayName(raw, crewCode);
  if (displayName === null) return null;

  const token =
    'identityToken' in body ? (body as { identityToken: unknown }).identityToken : undefined;

  return {
    displayName,
    identityToken: typeof token === 'string' && token !== '' ? token : null,
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
): Promise<Response> {
  const code = normaliseCrewCode((await context.params).code);
  if (!isCrewCode(code)) {
    return Response.json({ error: 'that is not a crew code' }, { status: 400 });
  }

  const parsed = readBody(await request.json().catch(() => null), code);
  if (parsed === null) {
    return Response.json(
      { error: 'pick a name for yourself — the crew code is not a name' },
      { status: 400 },
    );
  }

  const store = getRoomStore();
  if ((await store.crew.read(code)) === null) {
    return Response.json({ error: 'no crew with that code' }, { status: 404 });
  }

  // A returning player keeps the id their device already holds, which is what
  // makes a refresh land back in the same seat — but only against a signature.
  // A token that fails is refused rather than quietly replaced by a new id:
  // silently minting one would turn a forgery attempt into an ordinary join.
  const { jwtSecret } = loadServerConfig();
  let playerId: string;
  if (parsed.identityToken === null) {
    playerId = randomUUID();
  } else {
    try {
      ({ playerId } = await verifyIdentityToken(parsed.identityToken, jwtSecret));
    } catch {
      return Response.json({ error: 'that identity could not be verified' }, { status: 401 });
    }
  }

  try {
    await store.room.open(code);
    await store.room.mutate(code, (doc) =>
      joinLobby(doc, { playerId, displayName: parsed.displayName, now: Date.now() }),
    );
  } catch (error) {
    // Discriminating on the code, never on instanceof: this handler is webpack's
    // copy of the module and the error came from the server's copy, so the two
    // classes are different objects and instanceof is always false here.
    switch (domainErrorCode(error)) {
      case 'ROOM_FULL':
      case 'SESSION_ALREADY_STARTED':
        return Response.json({ error: errorMessage(error, 'that room is not open') }, { status: 409 });
      case 'ROOM_CEILING':
      case 'KILL_SWITCH':
        return Response.json(
          { error: errorMessage(error, 'Nightfall is at capacity') },
          { status: 503 },
        );
      default:
        // Anything unrecognised is a real fault and must stay a 500.
        throw error;
    }
  }

  const token = await issuePlayerToken({ crewCode: code, playerId }, jwtSecret);
  // Re-issued on every join so the device's proof of identity never goes stale
  // on a crew that plays irregularly.
  const identityToken = await issueIdentityToken({ playerId }, jwtSecret);

  return Response.json({
    token,
    identityToken,
    playerId,
    displayName: parsed.displayName,
    crewCode: code,
    // Whether the debrief may offer to save a record. Reported here so the offer
    // costs no extra round trip, and so the join path itself stays unaware of
    // anything to do with claiming.
    claimAvailable: loadServerConfig().claim.enabled,
  });
}
