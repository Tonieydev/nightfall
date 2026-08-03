import {
  computeAudioGraph,
  projectState,
  type GameState,
  type ViewState,
} from '../game-core/index.js';
import { MIN_LOBBY_TO_START } from './keys.js';
import type { RoomDocument } from './types.js';

export interface MemberView {
  playerId: string;
  displayName: string;
  connected: boolean;
}

export interface SelfView {
  playerId: string;
  displayName: string;
  isGm: boolean;
}

/**
 * One viewer's row of the audio graph, never the whole graph. Broadcasting the
 * full map would hand a villager the Mafia channel's membership at NIGHT_MAFIA,
 * which is the exact leak projection exists to prevent.
 */
export interface AudioView {
  /** Who receives this viewer's audio. Empty means they are silenced. */
  speaksTo: string[];
  /** Whose audio this viewer receives. */
  hears: string[];
}

export interface RoomView {
  version: number;
  crewCode: string;
  expiresAt: number;
  gmPlayerId: string | null;
  members: MemberView[];
  canStart: boolean;
  you: SelfView | null;
  /** Null for the whole lobby; once a game exists this is game-core's own
   *  per-recipient projection, so role secrecy has exactly one implementation. */
  game: ViewState | null;
  audio: AudioView | null;
}

function projectAudio(game: GameState, viewerId: string): AudioView {
  const graph = computeAudioGraph(game);

  const hears: string[] = [];
  for (const [speaker, listeners] of graph) {
    if (listeners.has(viewerId)) hears.push(speaker);
  }

  return { speaksTo: [...(graph.get(viewerId) ?? [])], hears };
}

export function projectRoom(doc: RoomDocument, viewerId: string): RoomView {
  const self = doc.members.find((m) => m.playerId === viewerId) ?? null;

  return {
    version: doc.version,
    crewCode: doc.crewCode,
    expiresAt: doc.expiresAt,
    gmPlayerId: doc.gmPlayerId,
    members: doc.members.map((m) => ({
      playerId: m.playerId,
      displayName: m.displayName,
      connected: m.connected,
    })),
    canStart: doc.gmPlayerId === null && doc.members.length >= MIN_LOBBY_TO_START,
    you:
      self === null
        ? null
        : {
            playerId: self.playerId,
            displayName: self.displayName,
            isGm: doc.gmPlayerId === self.playerId,
          },
    game: doc.game === null ? null : gameView(doc.game, viewerId),
    audio: doc.game === null ? null : projectAudio(doc.game, viewerId),
  };
}

/**
 * game-core clears dayVotes on entry to VOTE, not on exit, so last round's
 * ballot survives in state until the next vote begins. It is only meaningful
 * while it is live, so it is withheld outside VOTE rather than shown stale.
 */
function gameView(game: GameState, viewerId: string): ViewState {
  const view = projectState(game, viewerId);
  return game.phase === 'VOTE' ? view : { ...view, dayVotes: {} };
}
