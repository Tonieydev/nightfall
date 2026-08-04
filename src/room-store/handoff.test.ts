import { describe, expect, it } from 'vitest';
import { advanceGame, forceKill } from './commands.js';
import { domainErrorCode } from './errors.js';
import {
  GM_GRACE_MS,
  handOffGm,
  isGmAbandoned,
  reclaimGm,
  successorToGm,
} from './handoff.js';
import { MIN_LOBBY_TO_START } from './keys.js';
import { joinLobby, setConnected, startSession } from './lobby.js';
import { projectRoom } from './project-room.js';
import type { RoomDocument } from './types.js';

const NOW = 1_700_000_000_000;
const GM = 'p1';

function lobby(now = NOW): RoomDocument {
  let doc: RoomDocument = {
    version: 1,
    crewCode: 'ABC234',
    createdAt: now,
    expiresAt: now + 90 * 60 * 1000,
    gmPlayerId: null,
    members: [],
    seed: null,
    voiceEnabled: true,
    reservedMinutes: 1080,
    game: null,
  };
  // Staggered joins, so "longest connected" has something to distinguish.
  for (let i = 1; i <= MIN_LOBBY_TO_START; i += 1) {
    doc = joinLobby(doc, {
      playerId: `p${String(i)}`,
      displayName: `Player ${String(i)}`,
      now: now + i * 1000,
    });
  }
  return doc;
}

function started(): RoomDocument {
  return advanceGame(startSession(lobby(), GM, { seed: 4242, now: NOW }), GM, NOW);
}

describe('the connection clock', () => {
  it('stamps when each member connected', () => {
    const doc = lobby();

    for (const member of doc.members) {
      expect(member.connectedAt, member.playerId).not.toBeNull();
    }
  });

  it('clears the stamp on disconnect and re-stamps on return', () => {
    let doc = setConnected(lobby(), 'p3', false, NOW + 10_000);
    expect(doc.members.find((m) => m.playerId === 'p3')?.connectedAt).toBeNull();

    doc = setConnected(doc, 'p3', true, NOW + 20_000);

    // Re-stamped at the return, not the original join: someone who has just come
    // back is not the longest-connected person in the room.
    expect(doc.members.find((m) => m.playerId === 'p3')?.connectedAt).toBe(NOW + 20_000);
  });

  it('records when the GM dropped, so the grace period can be measured', () => {
    const doc = setConnected(started(), GM, false, NOW + 5_000);

    expect(doc.members.find((m) => m.playerId === GM)?.connectedAt).toBeNull();
    expect(doc.gmDisconnectedAt).toBe(NOW + 5_000);
  });

  it('forgets the drop the moment the GM returns', () => {
    let doc = setConnected(started(), GM, false, NOW + 5_000);
    doc = setConnected(doc, GM, true, NOW + 10_000);

    expect(doc.gmDisconnectedAt).toBeNull();
  });
});

describe('choosing a successor', () => {
  it('takes nobody while the GM is still connected', () => {
    expect(isGmAbandoned(started(), NOW + GM_GRACE_MS + 1)).toBe(false);
  });

  it('waits the full grace period before giving the role away', () => {
    const doc = setConnected(started(), GM, false, NOW);

    expect(isGmAbandoned(doc, NOW + GM_GRACE_MS - 1)).toBe(false);
    expect(isGmAbandoned(doc, NOW + GM_GRACE_MS)).toBe(true);
    expect(GM_GRACE_MS).toBe(60_000);
  });

  it('prefers a player who is already out of the game', () => {
    // A dead player is free. Promoting them changes nothing about the balance.
    let doc = started();
    const victim = doc.game?.players.find((p) => p.id !== GM)?.id ?? '';
    doc = forceKill(doc, GM, victim);
    doc = setConnected(doc, GM, false, NOW);

    expect(successorToGm(doc, NOW + GM_GRACE_MS)?.playerId).toBe(victim);
  });

  it('takes the longest-connected of several dead players', () => {
    let doc = started();
    const dead = (doc.game?.players ?? []).filter((p) => p.id !== GM).slice(0, 2);
    for (const p of dead) doc = forceKill(doc, GM, p.id);
    // The second one reconnected recently; the first has been here throughout.
    doc = setConnected(doc, dead[1]?.id ?? '', false, NOW + 1_000);
    doc = setConnected(doc, dead[1]?.id ?? '', true, NOW + 2_000);
    doc = setConnected(doc, GM, false, NOW);

    expect(successorToGm(doc, NOW + GM_GRACE_MS)?.playerId).toBe(dead[0]?.id);
  });

  it('never offers the role back to the GM who dropped', () => {
    const doc = setConnected(started(), GM, false, NOW);

    expect(successorToGm(doc, NOW + GM_GRACE_MS)?.playerId).not.toBe(GM);
  });

  it('never offers it to someone who is also disconnected', () => {
    let doc = started();
    for (const member of doc.members) {
      if (member.playerId !== 'p2') doc = setConnected(doc, member.playerId, false, NOW);
    }

    expect(successorToGm(doc, NOW + GM_GRACE_MS)?.playerId).toBe('p2');
  });
});

describe('handing the role over', () => {
  it('moves the console to the new GM and hands the old one a player view', () => {
    let doc = started();
    const heir = doc.game?.players.find((p) => p.id !== GM)?.id ?? '';

    doc = handOffGm(doc, GM, heir, NOW);

    expect(doc.gmPlayerId).toBe(heir);
    expect(projectRoom(doc, heir).you?.isGm).toBe(true);
    expect(projectRoom(doc, GM).you?.isGm).toBe(false);
  });

  it('shows the new GM every role, and the old GM only their own', () => {
    let doc = started();
    const heir = doc.game?.players.find((p) => p.id !== GM)?.id ?? '';
    doc = handOffGm(doc, GM, heir, NOW);

    const asHeir = projectRoom(doc, heir);
    const asFormer = projectRoom(doc, GM);

    // Full visibility follows the role, not the person.
    expect(asHeir.game?.players.every((p) => p.role !== null)).toBe(true);
    expect(asFormer.game?.players.filter((p) => p.role !== null).length).toBeLessThan(
      asHeir.game?.players.length ?? 0,
    );
  });

  it('refuses a handoff from anyone but the GM', () => {
    const doc = started();
    const error = (() => {
      try {
        handOffGm(doc, 'p3', 'p4', NOW);
        return null;
      } catch (e: unknown) {
        return e;
      }
    })();

    expect(domainErrorCode(error)).toBe('NOT_GM');
  });

  it('refuses to hand off to someone who is not in the room', () => {
    expect(() => handOffGm(started(), GM, 'stranger', NOW)).toThrow();
  });

  it('eliminates a living successor before promoting them', () => {
    // Nobody is dead yet. Promoting a living player would hand them every role
    // while their own is still in play, so they leave the game first.
    let doc = setConnected(started(), GM, false, NOW);
    const heir = successorToGm(doc, NOW + GM_GRACE_MS);
    expect(heir).not.toBeNull();

    doc = reclaimGm(doc, NOW + GM_GRACE_MS) ?? doc;

    expect(doc.gmPlayerId).toBe(heir?.playerId);
    expect(doc.game?.players.find((p) => p.id === heir?.playerId)?.alive).toBe(false);
    expect(doc.game?.players.find((p) => p.id === heir?.playerId)?.eliminatedBy).toBe('GM');
  }, 10_000);

  it('leaves a dead successor exactly as dead as they already were', () => {
    let doc = started();
    const victim = doc.game?.players.find((p) => p.id !== GM)?.id ?? '';
    doc = forceKill(doc, GM, victim);
    const before = doc.game?.players.find((p) => p.id === victim)?.eliminatedAtPhase;
    doc = setConnected(doc, GM, false, NOW);

    doc = reclaimGm(doc, NOW + GM_GRACE_MS) ?? doc;

    expect(doc.gmPlayerId).toBe(victim);
    expect(doc.game?.players.find((p) => p.id === victim)?.eliminatedAtPhase).toBe(before);
  });

  it('does nothing before the grace period is up', () => {
    const doc = setConnected(started(), GM, false, NOW);

    expect(reclaimGm(doc, NOW + GM_GRACE_MS - 1)).toBeNull();
  });

  it('does nothing once the GM is back', () => {
    expect(reclaimGm(started(), NOW + GM_GRACE_MS * 10)).toBeNull();
  });
});
