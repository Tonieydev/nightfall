import type { RoomView } from '@/room-store';

export type Channel = 'open' | 'mafia' | 'dead' | 'silenced';

export const CHANNEL_LABEL: Record<Channel, string> = {
  open: 'Open floor',
  mafia: 'Mafia channel',
  dead: 'Dead channel',
  silenced: 'Silenced',
};

/**
 * Which room a player's microphone is actually in, named the way the GM would
 * say it. Derived from the audio graph rather than from the phase, so it cannot
 * disagree with what the server subscribed them to — the console's whole value
 * is that it reports the truth, not a second guess at it.
 *
 * One implementation, shared by the roster and the audio panel: two components
 * inventing their own naming is how they end up contradicting each other on the
 * same screen.
 */
export function channelFor(view: RoomView, playerId: string): Channel {
  const graph = view.audioGraph;
  const game = view.game;
  if (graph === null || game === null) return 'silenced';

  const audience = (graph[playerId] ?? []).filter((id) => id !== playerId);
  if (audience.length === 0) return 'silenced';

  const player = game.players.find((p) => p.id === playerId);
  const dead = player !== undefined && !player.alive;

  // A dead speaker only ever reaches other dead players, so that is the room
  // they are in whatever the phase happens to be called.
  if (dead) return 'dead';

  const livingListeners = audience.filter((id) => {
    const other = game.players.find((p) => p.id === id);
    return other !== undefined && other.alive;
  });

  // Fewer living ears than there are living players means a private room.
  const livingOthers = game.players.filter((p) => p.alive && p.id !== playerId).length;
  return livingListeners.length > 0 && livingListeners.length < livingOthers ? 'mafia' : 'open';
}

/** How that player is voting right now, as the roster shows it. */
export function voteOf(view: RoomView, playerId: string): string {
  const game = view.game;
  if (game === null || game.phase !== 'VOTE') return '—';

  const target = game.dayVotes[playerId];
  if (target === undefined) return 'No vote';
  return game.players.find((p) => p.id === target)?.name ?? 'No vote';
}
