import type { AudioGraph } from './types.js';

/**
 * Who hears whom before a game exists: everybody, everybody.
 *
 * There are no roles yet, no phases and nothing to hide, so this is the one
 * audio state in the product with no rule in it. It still has to be stated
 * rather than assumed: subscriptions are explicit, and audio nobody grants is
 * audio nobody hears. The lobby had been working only because LiveKit
 * subscribes a joiner to everything by default, which is the same default that
 * was handing out the mafia channel.
 *
 * Lives here with computeAudioGraph because it is an audio rule, and audio
 * rules have exactly one home.
 */
export function computeLobbyGraph(memberIds: string[]): AudioGraph {
  return new Map(
    memberIds.map((id) => [id, new Set(memberIds.filter((other) => other !== id))]),
  );
}
