import {
  advancePhase,
  computeAudioGraph,
  projectState,
  type AudioGraph,
  type GameState,
  type ViewState,
} from '../game-core/index.js';
import { chatFor, systemRecord, type ChatMessage, type SystemEvent } from './chat.js';
import { nightKillsFor } from './game-config.js';
import { MIN_LOBBY_TO_START } from './keys.js';
import { advanceLabelFor, narrationFor, type NarrationCard } from '../narration/script.js';
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
  /** False when this month's voice budget is spent; the game plays on, silently. */
  voiceEnabled: boolean;
  you: SelfView | null;
  /** Null for the whole lobby; once a game exists this is game-core's own
   *  per-recipient projection, so role secrecy has exactly one implementation. */
  game: ViewState | null;
  audio: AudioView | null;
  /**
   * Only the messages this viewer is allowed to have received, routed by the
   * audio graph before the emit. Never the whole log for the client to filter.
   */
  chat: ChatMessage[];
  /** The pinned strip. Facts only, and the same for everyone. */
  record: SystemEvent[];
  /**
   * The GM's teleprompter for the phase they are in — null for every other
   * viewer, at every phase. A player who could read the narration would read
   * ahead instead of listening to their friend, and the drama is the friend.
   */
  narration: NarrationCard | null;
  /**
   * When the GM's target for the day runs out — GM only, and null everywhere
   * else. Advisory: reaching it changes nothing, and no server timer watches
   * it. The authoritative clock is GameState.phaseEndsAt, which is a different
   * field for a different reason.
   */
  dayEndsAt: number | null;
  /** Which night cycle the room is on. Not a secret. */
  round: number;
  /**
   * What the GM is about to say, for the button that says it — named for the
   * phase the room will actually land in, which advancePhase decides. Null at
   * GAME_OVER, and null for anyone who is not the GM.
   */
  advanceLabel: string | null;
  /**
   * How many names the mafia's ballot may settle on tonight — GM only, null for
   * everyone else. The room finds out how many died by being told at dawn, not
   * by reading the setting off their own screen the night before.
   */
  nightKills: number | null;
  /**
   * The whole speaker-to-listeners map, GM only and null for everyone else.
   * At NIGHT_MAFIA this map IS the mafia roster — whoever hears a mafia
   * speaker is mafia — so it is the single most damaging thing that could be
   * projected. Every other viewer still gets only their own row, in `audio`.
   */
  audioGraph: Record<string, string[]> | null;
}

function projectAudio(viewerId: string, graph: AudioGraph): AudioView {
  const hears: string[] = [];
  for (const [speaker, listeners] of graph) {
    if (listeners.has(viewerId)) hears.push(speaker);
  }

  return { speaksTo: [...(graph.get(viewerId) ?? [])], hears };
}

export function projectRoom(
  doc: RoomDocument,
  viewerId: string,
  graph?: AudioGraph,
): RoomView {
  const self = doc.members.find((m) => m.playerId === viewerId) ?? null;
  const resolved = doc.game === null ? null : (graph ?? computeAudioGraph(doc.game));

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
    voiceEnabled: doc.voiceEnabled,
    you:
      self === null
        ? null
        : {
            playerId: self.playerId,
            displayName: self.displayName,
            isGm: doc.gmPlayerId === self.playerId,
          },
    chat: chatFor(doc, viewerId, resolved ?? undefined),
    record: systemRecord(doc),
    // Projected here rather than merged in by the console, so there is one
    // place that decides who may see it — the same place that decides roles.
    narration:
      doc.game !== null && doc.gmPlayerId === viewerId ? narrationFor(doc.game.phase) : null,
    round: doc.roundNumber ?? 1,
    // Asking advancePhase where we are going keeps legal order in game-core —
    // including the night roles it skips when nobody holds them. The peek is
    // discarded and advancePhase is pure, so `now` here changes nothing.
    advanceLabel:
      doc.game !== null && doc.gmPlayerId === viewerId && doc.game.phase !== 'GAME_OVER'
        ? advanceLabelFor(doc.game.phase, advancePhase(doc.game, 0).phase)
        : null,
    nightKills:
      doc.game !== null && doc.gmPlayerId === viewerId ? nightKillsFor(doc.game.config) : null,
    audioGraph:
      resolved !== null && doc.gmPlayerId === viewerId
        ? Object.fromEntries([...resolved].map(([speaker, hears]) => [speaker, [...hears]]))
        : null,
    dayEndsAt:
      doc.gmPlayerId === viewerId &&
      doc.game?.phase === 'DAY' &&
      typeof doc.dayTargetMs === 'number' &&
      typeof doc.phaseChangedAt === 'number'
        ? doc.phaseChangedAt + doc.dayTargetMs
        : null,
    game: doc.game === null ? null : gameView(doc.game, viewerId),
    audio: doc.game === null || resolved === null ? null : projectAudio(viewerId, resolved),
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

/**
 * One broadcast, one graph. The room is identical for everyone receiving it, so
 * rebuilding the graph per socket was pure repetition — and the projection still
 * runs per recipient, which is the part that must never be shared.
 */
export function projectRoomFor(doc: RoomDocument, viewerIds: string[]): RoomView[] {
  const graph = doc.game === null ? undefined : computeAudioGraph(doc.game);
  return viewerIds.map((viewerId) => projectRoom(doc, viewerId, graph));
}
