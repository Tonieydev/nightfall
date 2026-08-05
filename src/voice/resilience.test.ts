import { describe, expect, it, vi } from 'vitest';
import { applyGraphToRoom, destroyRoom } from './index.js';
import type { VoiceRoomService } from './room-service.js';

/** LiveKit's shape for "that room is not there", which is not a failure. */
function notFound(): Error & { status: number; code: string } {
  return Object.assign(new Error('Not Found: requested room does not exist'), {
    status: 404,
    code: 'not_found',
  });
}

function service(overrides: Partial<VoiceRoomService> = {}): VoiceRoomService {
  return {
    listParticipants: vi.fn(() => Promise.resolve([])),
    updateSubscriptions: vi.fn(() => Promise.resolve()),
    deleteRoom: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

/**
 * A voice fault took the whole server down.
 *
 * destroyRoom ran at GAME_OVER inside broadcastRoom, which was called from a
 * socket disconnect handler whose try/catch covered only the Redis write. When
 * LiveKit answered 404 the rejection escaped, Node treated it as fatal, and the
 * process restarted, dropping every socket in every room. The room that had
 * merely finished took the ones still playing with it.
 *
 * Voice is a projection of the game, never a dependency of it: the same rule
 * the durable write already follows.
 */
describe('a voice fault never reaches the game', () => {
  it('treats a missing room as nothing to delete', async () => {
    const svc = service({ deleteRoom: vi.fn(() => Promise.reject(notFound())) });

    await expect(destroyRoom('ABC234', true, svc)).resolves.toBeUndefined();
  });

  it('treats a missing room as nobody to subscribe', async () => {
    // The normal state of a lobby: nobody has opened their microphone, so there
    // is no LiveKit room behind it yet, and asking about it answers 404.
    const svc = service({ listParticipants: vi.fn(() => Promise.reject(notFound())) });

    await expect(applyGraphToRoom('ABC234', new Map(), true, svc)).resolves.toBeUndefined();
  });

  it('survives LiveKit being unreachable entirely', async () => {
    const down = () => Promise.reject(new Error('ECONNREFUSED'));

    await expect(
      applyGraphToRoom('ABC234', new Map(), true, service({ listParticipants: down })),
    ).resolves.toBeUndefined();
    await expect(
      destroyRoom('ABC234', true, service({ deleteRoom: down })),
    ).resolves.toBeUndefined();
  });

  it('survives a subscription call failing halfway through', async () => {
    const svc = service({
      listParticipants: vi.fn(() =>
        Promise.resolve([
          { identity: 'a', tracks: [{ sid: 'TR_a' }] },
          { identity: 'b', tracks: [{ sid: 'TR_b' }] },
        ]),
      ),
      updateSubscriptions: vi.fn(() => Promise.reject(new Error('boom'))),
    });
    const graph = new Map([
      ['a', new Set(['b'])],
      ['b', new Set(['a'])],
    ]);

    await expect(applyGraphToRoom('ABC234', graph, true, svc)).resolves.toBeUndefined();
  });

  it('still does the work when nothing is wrong', async () => {
    const svc = service({
      listParticipants: vi.fn(() =>
        Promise.resolve([
          { identity: 'a', tracks: [{ sid: 'TR_a' }] },
          { identity: 'b', tracks: [{ sid: 'TR_b' }] },
        ]),
      ),
    });

    await applyGraphToRoom(
      'ABC234',
      new Map([
        ['a', new Set(['b'])],
        ['b', new Set(['a'])],
      ]),
      true,
      svc,
    );

    expect(svc.updateSubscriptions).toHaveBeenCalledWith('ABC234', 'b', ['TR_a'], true);
    expect(svc.updateSubscriptions).toHaveBeenCalledWith('ABC234', 'a', ['TR_b'], true);
  });

  it('does nothing at all for a voiceless room', async () => {
    const svc = service();

    await applyGraphToRoom('ABC234', new Map(), false, svc);
    await destroyRoom('ABC234', false, svc);

    expect(svc.listParticipants).not.toHaveBeenCalled();
    expect(svc.deleteRoom).not.toHaveBeenCalled();
  });
});
