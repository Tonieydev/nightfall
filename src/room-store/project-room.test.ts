import { describe, expect, it } from 'vitest';
import { projectRoom } from './project-room.js';
import type { RoomDocument } from './types.js';

const NOW = 1_700_000_000_000;

function lobby(overrides: Partial<RoomDocument> = {}): RoomDocument {
  return {
    version: 4,
    crewCode: 'ABC234',
    createdAt: NOW,
    expiresAt: NOW + 90 * 60 * 1000,
    gmPlayerId: null,
    seed: null,
    members: [
      { playerId: 'p1', displayName: 'Toniey', connected: true, joinedAt: NOW },
      { playerId: 'p2', displayName: 'Musa', connected: true, joinedAt: NOW + 1 },
      { playerId: 'p3', displayName: 'Ada', connected: false, joinedAt: NOW + 2 },
    ],
    game: null,
    ...overrides,
  };
}

describe('projectRoom', () => {
  it('scopes the payload to its viewer', () => {
    const doc = lobby();

    const forP1 = projectRoom(doc, 'p1');
    const forP2 = projectRoom(doc, 'p2');

    expect(forP1.you).toEqual({ playerId: 'p1', displayName: 'Toniey', isGm: false });
    expect(forP2.you).toEqual({ playerId: 'p2', displayName: 'Musa', isGm: false });
    expect(forP1).not.toEqual(forP2);
  });

  it('shows everyone the roster and its live connection state', () => {
    const view = projectRoom(lobby(), 'p1');

    expect(view.members).toEqual([
      { playerId: 'p1', displayName: 'Toniey', connected: true },
      { playerId: 'p2', displayName: 'Musa', connected: true },
      { playerId: 'p3', displayName: 'Ada', connected: false },
    ]);
    expect(view.crewCode).toBe('ABC234');
    expect(view.version).toBe(4);
  });

  it('never leaks a role in the lobby, because there are none yet', () => {
    const json = JSON.stringify(projectRoom(lobby(), 'p1'));

    for (const role of ['VILLAGER', 'MAFIA', 'DOCTOR', 'DETECTIVE']) {
      expect(json, role).not.toContain(role);
    }
  });

  it('reports who will moderate and whether start is available', () => {
    const short = projectRoom(lobby(), 'p1');
    const ready = projectRoom(
      lobby({
        members: Array.from({ length: 6 }, (_, i) => ({
          playerId: `p${i + 1}`,
          displayName: `Player ${i + 1}`,
          connected: true,
          joinedAt: NOW + i,
        })),
      }),
      'p1',
    );
    const started = projectRoom(lobby({ gmPlayerId: 'p2' }), 'p2');

    expect(short.canStart).toBe(false);
    expect(short.gmPlayerId).toBeNull();
    expect(ready.canStart).toBe(true);
    expect(started.gmPlayerId).toBe('p2');
    expect(started.you?.isGm).toBe(true);
    expect(started.canStart).toBe(false);
  });

  it('tells a viewer who is not a member that they are not seated', () => {
    const view = projectRoom(lobby(), 'stranger');

    expect(view.you).toBeNull();
  });

  it('never mutates the document', () => {
    const doc = lobby();
    const before = structuredClone(doc);

    for (const id of ['p1', 'p2', 'p3', 'gm']) projectRoom(doc, id);

    expect(doc).toEqual(before);
  });
});
