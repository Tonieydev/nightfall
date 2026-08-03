import { randomUUID } from 'node:crypto';
import { issuePlayerToken } from '@/auth/tokens';
import { loadServerConfig } from '@/config';
import {
  KillSwitchError,
  RoomCeilingReachedError,
  RoomFullError,
  SessionAlreadyStartedError,
  getRoomStore,
  isCrewCode,
  joinLobby,
  normaliseCrewCode,
} from '@/room-store';

export const dynamic = 'force-dynamic';

interface JoinBody {
  displayName: string;
  playerId: string | null;
}

function readBody(body: unknown): JoinBody | null {
  if (typeof body !== 'object' || body === null) return null;

  const name = 'displayName' in body ? (body as { displayName: unknown }).displayName : undefined;
  if (typeof name !== 'string' || name.trim() === '') return null;

  const id = 'playerId' in body ? (body as { playerId: unknown }).playerId : undefined;

  return {
    displayName: name.trim().slice(0, 24),
    playerId: typeof id === 'string' && id !== '' ? id : null,
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

  const parsed = readBody(await request.json().catch(() => null));
  if (parsed === null) {
    return Response.json({ error: 'a display name is required' }, { status: 400 });
  }

  const store = getRoomStore();
  if ((await store.crew.read(code)) === null) {
    return Response.json({ error: 'no crew with that code' }, { status: 404 });
  }

  // A returning player keeps the id their device already holds, which is what
  // makes a refresh land back in the same seat.
  const playerId = parsed.playerId ?? randomUUID();

  try {
    await store.room.open(code);
    await store.room.mutate(code, (doc) =>
      joinLobby(doc, { playerId, displayName: parsed.displayName, now: Date.now() }),
    );
  } catch (error) {
    if (error instanceof RoomFullError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof SessionAlreadyStartedError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof RoomCeilingReachedError || error instanceof KillSwitchError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    throw error;
  }

  const token = await issuePlayerToken({ crewCode: code, playerId }, loadServerConfig().jwtSecret);

  return Response.json({ token, playerId, displayName: parsed.displayName, crewCode: code });
}
