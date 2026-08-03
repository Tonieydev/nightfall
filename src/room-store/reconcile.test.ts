import { describe, expect, it } from 'vitest';
import { advanceGame, isPhaseExpired, reconcilePhase } from './commands.js';
import { createRoomStoreFacade } from './index.js';
import { MIN_LOBBY_TO_START } from './keys.js';
import { joinLobby, startSession } from './lobby.js';
import { MemoryRedis } from './memory-redis.js';
import { mafiaVote } from './night-actions.js';
import type { RoomDocument } from './types.js';

const NOW = 1_700_000_000_000;
const GM = 'p1';
const NIGHT_MS = 45_000;

function started(): RoomDocument {
  let doc: RoomDocument = {
    version: 1,
    crewCode: 'ABC234',
    createdAt: NOW,
    expiresAt: NOW + 90 * 60 * 1000,
    gmPlayerId: null,
    members: [],
    seed: null,
    game: null,
  };
  for (let i = 1; i <= MIN_LOBBY_TO_START; i += 1) {
    doc = joinLobby(doc, { playerId: `p${i}`, displayName: `Player ${i}`, now: NOW });
  }
  return startSession(doc, GM, { seed: 4242, now: NOW });
}

/** Walks to NIGHT_MAFIA, where advancePhase is the thing that sets a clock. */
function atNight(): RoomDocument {
  let doc = started();
  while (doc.game?.phase !== 'NIGHT_MAFIA') doc = advanceGame(doc, GM, NOW);
  return doc;
}

describe('phase expiry', () => {
  it('gives NIGHT_MAFIA an absolute deadline from game-core', () => {
    const night = atNight();

    expect(night.game?.phaseEndsAt).toBe(NOW + NIGHT_MS);
    expect(isPhaseExpired(night.game!, NOW + NIGHT_MS - 1)).toBe(false);
    expect(isPhaseExpired(night.game!, NOW + NIGHT_MS)).toBe(true);
  });

  it('leaves a phase with no clock alone forever', () => {
    const reveal = advanceGame(started(), GM, NOW);

    expect(reveal.game?.phaseEndsAt).toBeNull();
    expect(reconcilePhase(reveal, NOW + 10 * 60 * 1000)).toBeNull();
  });

  it('does nothing before the deadline', () => {
    expect(reconcilePhase(atNight(), NOW + NIGHT_MS - 1)).toBeNull();
  });

  it('resolves and advances once the deadline has passed', () => {
    const night = atNight();

    const reconciled = reconcilePhase(night, NOW + NIGHT_MS);

    expect(reconciled).not.toBeNull();
    expect(reconciled?.game?.phase).not.toBe('NIGHT_MAFIA');
    expect(reconciled?.game?.phaseEndsAt).toBeNull();
  });

  it('kills the plurality target when the clock runs out', () => {
    const night = atNight();
    const mafia = night.game?.players.find((p) => p.role === 'MAFIA')?.id ?? '';
    const target = night.game?.players.find((p) => p.role === 'VILLAGER')?.id ?? '';
    let doc = mafiaVote(night, mafia, target);

    // Expiry only ends the Mafia window; the kill lands on the way into DAWN.
    doc = reconcilePhase(doc, NOW + NIGHT_MS) ?? doc;
    while (doc.game?.phase !== 'DAWN' && doc.game?.phase !== 'GAME_OVER') {
      doc = advanceGame(doc, GM, NOW);
    }

    expect(doc.game?.players.find((p) => p.id === target)?.alive).toBe(false);
    expect(doc.game?.players.find((p) => p.id === target)?.eliminatedBy).toBe('MAFIA');
  });

  it('kills nobody when the clock runs out with no votes', () => {
    let doc = reconcilePhase(atNight(), NOW + NIGHT_MS) ?? atNight();

    while (doc.game?.phase !== 'DAWN' && doc.game?.phase !== 'GAME_OVER') {
      doc = advanceGame(doc, GM, NOW);
    }

    expect(doc.game?.players.every((p) => p.alive)).toBe(true);
  });

  it('refuses to resolve the same expiry twice', () => {
    const night = atNight();
    const once = reconcilePhase(night, NOW + NIGHT_MS);

    // A timer firing late, after a read already reconciled, must find nothing.
    const twice = reconcilePhase(once!, NOW + NIGHT_MS);

    expect(once).not.toBeNull();
    expect(twice).toBeNull();
  });

  it('never reconciles a finished game', () => {
    const night = atNight();
    const over: RoomDocument = {
      ...night,
      game: { ...night.game!, phase: 'GAME_OVER', phaseEndsAt: NOW - 1 },
    };

    expect(reconcilePhase(over, NOW + NIGHT_MS)).toBeNull();
  });
});

describe('reconciliation on read', () => {
  function setup(clock: () => number) {
    const redis = new MemoryRedis(clock);
    return createRoomStoreFacade(redis, { maxConcurrentRooms: 10, killSwitch: false }, clock, () => 0.5);
  }

  it('resolves on read when the timer never fired', async () => {
    let clock = NOW;
    const store = setup(() => clock);
    await store.room.open('ABC234');
    await store.room.mutate('ABC234', () => atNight());

    // No setTimeout anywhere in this test — the read is the whole mechanism.
    clock = NOW + NIGHT_MS + 1;
    const read = await store.room.read('ABC234');

    expect(read?.game?.phase).not.toBe('NIGHT_MAFIA');
    expect((await store.room.read('ABC234'))?.game?.phase).toBe(read?.game?.phase);
  });

  it('does not advance a read taken before the deadline', async () => {
    let clock = NOW;
    const store = setup(() => clock);
    await store.room.open('ABC234');
    await store.room.mutate('ABC234', () => atNight());

    clock = NOW + NIGHT_MS - 1;

    expect((await store.room.read('ABC234'))?.game?.phase).toBe('NIGHT_MAFIA');
  });

  it('advances exactly once when two readers race the same expiry', async () => {
    let clock = NOW;
    const store = setup(() => clock);
    await store.room.open('ABC234');
    await store.room.mutate('ABC234', () => atNight());
    clock = NOW + NIGHT_MS + 1;

    const [a, b, c] = await Promise.all([
      store.room.read('ABC234'),
      store.room.read('ABC234'),
      store.room.read('ABC234'),
    ]);

    expect(a?.game?.phase).toBe(b?.game?.phase);
    expect(b?.game?.phase).toBe(c?.game?.phase);
    // One advance, not three: phaseNumber must not have run away.
    expect(a?.game?.phaseNumber).toBe(1);
  });
});
