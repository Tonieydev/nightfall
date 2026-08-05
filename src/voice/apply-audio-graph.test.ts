import { describe, expect, it, vi } from 'vitest';
import { computeAudioGraph } from '../game-core/index.js';
import { applyAudioGraph } from './apply-audio-graph.js';
import type { VoiceParticipant, VoiceRoomService } from './room-service.js';
import type { GameState, Phase, Player } from '../game-core/index.js';

const player = (id: string, role: Player['role'], alive = true): Player => ({
  id,
  name: id.toUpperCase(),
  role,
  alive,
  eliminatedAtPhase: alive ? null : 1,
  eliminatedBy: alive ? null : 'VOTE',
});

const CAST: Player[] = [
  player('m1', 'MAFIA'),
  player('m2', 'MAFIA'),
  player('v1', 'VILLAGER'),
  player('doc', 'DOCTOR'),
  player('det', 'DETECTIVE'),
  player('ghost', 'VILLAGER', false),
];

function game(phase: Phase): GameState {
  return {
    version: 1,
    phase,
    phaseNumber: 1,
    phaseEndsAt: null,
    gmPlayerId: 'gm',
    config: { mafiaCount: null, doctor: true, detective: true, mafiaNightMs: 45_000 },
    players: CAST,
    night: { mafiaVotes: {}, doctorSave: null, detectiveCheck: null },
    dayVotes: {},
    lastNight: null,
    winner: null,
  };
}

/** Everyone in the room publishes one audio track, named after them. */
const PARTICIPANTS: VoiceParticipant[] = ['gm', ...CAST.map((p) => p.id)].map((identity) => ({
  identity,
  tracks: [{ sid: `TR_${identity}` }],
}));

function fakeService() {
  const calls: { identity: string; trackSids: string[]; subscribe: boolean }[] = [];
  const service: VoiceRoomService = {
    updateSubscriptions: vi.fn((_room, identity, trackSids, subscribe) => {
      calls.push({ identity, trackSids: [...trackSids].sort(), subscribe });
      return Promise.resolve();
    }),
    listParticipants: () => Promise.resolve(PARTICIPANTS),
    deleteRoom: vi.fn(() => Promise.resolve()),
  };
  return { service, calls };
}

/** What the graph says each listener should end up subscribed to. */
function expectedFor(phase: Phase): Map<string, string[]> {
  const graph = computeAudioGraph(game(phase));
  const expected = new Map<string, string[]>();
  for (const participant of PARTICIPANTS) expected.set(participant.identity, []);

  for (const [speaker, listeners] of graph) {
    for (const listener of listeners) {
      expected.get(listener)?.push(`TR_${speaker}`);
    }
  }
  for (const [identity, sids] of expected) expected.set(identity, sids.sort());
  return expected;
}

function subscribedByIdentity(calls: ReturnType<typeof fakeService>['calls']): Map<string, string[]> {
  // The resulting subscription set, not the call log: re-subscribing to a track
  // already subscribed is a no-op, so duplicates collapse.
  const got = new Map<string, Set<string>>();
  for (const participant of PARTICIPANTS) got.set(participant.identity, new Set());
  for (const call of calls) {
    if (!call.subscribe) continue;
    for (const sid of call.trackSids) got.get(call.identity)?.add(sid);
  }
  return new Map([...got].map(([id, sids]) => [id, [...sids].sort()]));
}

const ALL_PHASES: Phase[] = [
  'LOBBY',
  'ROLE_REVEAL',
  'NIGHT_MAFIA',
  'NIGHT_DOCTOR',
  'NIGHT_DETECTIVE',
  'DAWN',
  'DAY',
  'VOTE',
  'GAME_OVER',
];

describe('applyAudioGraph', () => {
  it('subscribes exactly the edges the graph allows, in every phase', async () => {
    for (const phase of ALL_PHASES) {
      const { service, calls } = fakeService();

      await applyAudioGraph(service, 'ABC234', computeAudioGraph(game(phase)));

      expect(subscribedByIdentity(calls), phase).toEqual(expectedFor(phase));
    }
  });

  it('unsubscribes every edge the graph does not allow', async () => {
    for (const phase of ALL_PHASES) {
      const { service, calls } = fakeService();
      await applyAudioGraph(service, 'ABC234', computeAudioGraph(game(phase)));

      const allowed = expectedFor(phase);
      for (const call of calls.filter((c) => !c.subscribe)) {
        for (const sid of call.trackSids) {
          expect(allowed.get(call.identity), `${phase}: ${call.identity}`).not.toContain(sid);
        }
      }
    }
  });

  it('never lets a villager hear the Mafia channel at night', async () => {
    const { service, calls } = fakeService();

    await applyAudioGraph(service, 'ABC234', computeAudioGraph(game('NIGHT_MAFIA')));

    const villager = subscribedByIdentity(calls).get('v1');
    expect(villager).toEqual(['TR_gm']);
    expect(villager).not.toContain('TR_m1');
    expect(villager).not.toContain('TR_m2');
  });

  it('keeps the dead out of Mafia night and back in at GAME_OVER', async () => {
    const night = fakeService();
    await applyAudioGraph(night.service, 'ABC234', computeAudioGraph(game('NIGHT_MAFIA')));
    expect(subscribedByIdentity(night.calls).get('ghost')).toEqual(['TR_gm']);

    const over = fakeService();
    await applyAudioGraph(over.service, 'ABC234', computeAudioGraph(game('GAME_OVER')));
    expect(subscribedByIdentity(over.calls).get('ghost')?.length).toBeGreaterThan(1);
  });

  it('leaves a silenced player connected, subscribed to nobody but the GM', async () => {
    const { service, calls } = fakeService();

    await applyAudioGraph(service, 'ABC234', computeAudioGraph(game('NIGHT_DOCTOR')));

    for (const id of ['m1', 'v1', 'doc', 'det', 'ghost']) {
      expect(subscribedByIdentity(calls).get(id), id).toEqual(['TR_gm']);
    }
  });

  it('is idempotent — reapplying the same graph asks for the same thing', async () => {
    const first = fakeService();
    const second = fakeService();
    const graph = computeAudioGraph(game('DAY'));

    await applyAudioGraph(first.service, 'ABC234', graph);
    await applyAudioGraph(second.service, 'ABC234', graph);
    await applyAudioGraph(second.service, 'ABC234', graph);

    expect(subscribedByIdentity(second.calls)).toEqual(subscribedByIdentity(first.calls));
  });

  it('ignores a graph node that is not in the room', async () => {
    const { service, calls } = fakeService();
    const graph = computeAudioGraph(game('DAY'));
    graph.set('absent', new Set(['v1']));

    await applyAudioGraph(service, 'ABC234', graph);

    expect(calls.every((c) => c.identity !== 'absent')).toBe(true);
    expect(subscribedByIdentity(calls).get('v1')).not.toContain('TR_absent');
  });
});
