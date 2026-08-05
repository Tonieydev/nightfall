import { describe, expect, it, vi } from 'vitest';
import { applyGraphToRoom, destroyRoom } from './index.js';
import type { VoiceRoomService } from './room-service.js';

function spyService() {
  return {
    updateSubscriptions: vi.fn(() => Promise.resolve()),
    listParticipants: vi.fn(() => Promise.resolve([])),
    deleteRoom: vi.fn(() => Promise.resolve()),
  } satisfies VoiceRoomService;
}

describe('a voiceless room never touches LiveKit', () => {
  it('applies no subscriptions', async () => {
    const service = spyService();

    await applyGraphToRoom('ABC234', new Map([['gm', new Set(['v1'])]]), false, service);

    expect(service.listParticipants).not.toHaveBeenCalled();
    expect(service.updateSubscriptions).not.toHaveBeenCalled();
  });

  it('has no room to destroy', async () => {
    const service = spyService();

    await destroyRoom('ABC234', false, service);

    expect(service.deleteRoom).not.toHaveBeenCalled();
  });

  it('still does both when voice is funded', async () => {
    const service = spyService();

    await applyGraphToRoom('ABC234', new Map([['gm', new Set(['v1'])]]), true, service);
    await destroyRoom('ABC234', true, service);

    expect(service.listParticipants).toHaveBeenCalledOnce();
    expect(service.deleteRoom).toHaveBeenCalledOnce();
  });
});
