import { loadServerConfig } from '@/config';
import { getRoomStore, isCrewCode, normaliseCrewCode } from '@/room-store';
import { issueVoiceToken, mintToken } from '@/voice';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  context: { params: Promise<{ code: string }> },
): Promise<Response> {
  const code = normaliseCrewCode((await context.params).code);
  if (!isCrewCode(code)) {
    return Response.json({ error: 'that is not a crew code' }, { status: 400 });
  }

  const config = loadServerConfig();
  const store = getRoomStore();

  const result = await issueVoiceToken(request.headers.get('authorization'), code, {
    jwtSecret: config.jwtSecret,
    url: config.livekitUrl,
    readRoom: async (crew: string) => await store.room.read(crew),
    mint: mintToken,
  });

  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json(result);
}
