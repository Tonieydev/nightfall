import { CrewCodeExhaustedError, getRoomStore } from '@/room-store';

export const dynamic = 'force-dynamic';

function readName(body: unknown): string {
  if (typeof body === 'object' && body !== null && 'name' in body) {
    const value = (body as { name: unknown }).name;
    if (typeof value === 'string' && value.trim() !== '') return value.trim().slice(0, 40);
  }
  return 'Nightfall crew';
}

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => ({}));

  try {
    const crew = await getRoomStore().crew.create(readName(body));
    return Response.json({ code: crew.code, name: crew.name }, { status: 201 });
  } catch (error) {
    if (error instanceof CrewCodeExhaustedError) {
      return Response.json({ error: 'could not allocate a crew code' }, { status: 503 });
    }
    throw error;
  }
}
