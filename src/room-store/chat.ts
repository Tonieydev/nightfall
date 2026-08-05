import { computeAudioGraph, type AudioGraph, type Phase } from '../game-core/index.js';
import { DomainError } from './errors.js';
import type { RoomDocument } from './types.js';

/**
 * Long enough for "mic dead, voting Musa". Too short to argue in — the cap is
 * what pushes people back to voice, so it is a rule, not a validation detail.
 */
export const MAX_CHAT_CHARS = 140;

export class ChatNotAllowedError extends DomainError {
  readonly code = 'CHAT_NOT_ALLOWED' as const;

  constructor(reason: string) {
    super(`that message cannot be sent: ${reason}`);
    this.name = 'ChatNotAllowedError';
  }
}

export interface ChatMessage {
  id: string;
  senderId: string;
  /** The crew name. A role never travels with a message. */
  senderName: string;
  text: string;
  at: number;
  /**
   * The phase and the phase number this was sent in. Messages are filtered
   * against the live pair rather than deleted on transition: clearing then
   * depends on a call site remembering to, and five of them change phase.
   * phaseNumber is monotonic, so the same phase coming round again is a
   * different scope and yesterday's day chat cannot reappear.
   */
  phase: Phase;
  phaseNumber: number;
}

export interface SystemEvent {
  id: string;
  text: string;
  at: number;
}

const CAUSE_TEXT: Record<string, string> = {
  VOTE: 'was voted out',
  MAFIA: 'was taken in the night',
  GM: 'was removed by the moderator',
};

/**
 * Who can hear this sender, right now. This is `computeAudioGraph` and nothing
 * else — chat and voice cannot drift apart, and there is no second routing
 * surface to leak through.
 */
export function chatRecipients(
  doc: RoomDocument,
  senderId: string,
  graph?: AudioGraph,
): string[] {
  if (doc.game === null) return [];

  // The graph is rebuilt from scratch on every call, so a caller resolving many
  // senders — or many viewers — passes one in. Projecting a room used to build
  // one per message per recipient on a path that runs on every state change.
  const audience = (graph ?? computeAudioGraph(doc.game)).get(senderId) ?? new Set<string>();
  // Nobody is in their own audio audience — you do not hear yourself speak. Text
  // is different only in that the sender sees what they typed, which discloses
  // nothing. Routing to everyone else is still the graph, untouched.
  if (audience.size === 0) return [];
  return [...new Set([senderId, ...audience])];
}

function currentScope(doc: RoomDocument): number {
  return doc.game?.phaseNumber ?? 0;
}

/** Only what belongs to the phase on screen. Everything older is already gone. */
function live(doc: RoomDocument): ChatMessage[] {
  const phase = doc.game?.phase;
  if (phase === undefined) return [];
  const phaseNumber = currentScope(doc);
  return (doc.chat ?? []).filter((m) => m.phase === phase && m.phaseNumber === phaseNumber);
}

/**
 * This viewer's messages, routed server-side. Never the whole log filtered on
 * the client: the filtering happens before the emit, per recipient.
 */
export function chatFor(
  doc: RoomDocument,
  viewerId: string,
  graph?: AudioGraph,
): ChatMessage[] {
  const resolved = doc.game === null ? undefined : (graph ?? computeAudioGraph(doc.game));
  return live(doc).filter((m) => chatRecipients(doc, m.senderId, resolved).includes(viewerId));
}

export function postChat(
  doc: RoomDocument,
  senderId: string,
  text: string,
  now: number,
): RoomDocument {
  const body = text.trim();
  if (body === '') throw new ChatNotAllowedError('it is empty');
  if (body.length > MAX_CHAT_CHARS) {
    throw new ChatNotAllowedError(`it is longer than ${String(MAX_CHAT_CHARS)} characters`);
  }
  if (doc.game === null) throw new ChatNotAllowedError('the game has not started');

  const sender = doc.members.find((m) => m.playerId === senderId);
  if (sender === undefined) throw new ChatNotAllowedError('you are not in this room');

  // An empty audience is the graph's way of saying this person cannot speak
  // now — the dead during the day, the doctor at night. Refusing here is the
  // same rule the audio uses, not a second one.
  if (chatRecipients(doc, senderId).length === 0) {
    throw new ChatNotAllowedError('nobody can hear you in this phase');
  }

  const phase = doc.game.phase;
  const phaseNumber = currentScope(doc);

  return {
    ...doc,
    // Pruned on write so a long game cannot grow an unbounded document.
    chat: [
      ...live(doc),
      {
        id: `${String(now)}:${senderId}`,
        senderId,
        senderName: sender.displayName,
        text: body,
        at: now,
        phase,
        phaseNumber,
      },
    ],
  };
}

/**
 * The pinned strip: deaths and where the game is, nothing else. Derived from
 * game state rather than appended to, so it cannot disagree with the game it
 * describes — and so it needs no hook on any mutation.
 */
export function systemRecord(doc: RoomDocument): SystemEvent[] {
  const game = doc.game;
  if (game === null) return [];

  const nameOf = (playerId: string): string =>
    doc.members.find((m) => m.playerId === playerId)?.displayName ?? 'Someone';

  const deaths = game.players
    .filter((p) => !p.alive)
    .sort((a, b) => (a.eliminatedAtPhase ?? 0) - (b.eliminatedAtPhase ?? 0))
    .map((p) => ({
      id: `death:${p.id}`,
      text: `${nameOf(p.id)} ${p.eliminatedBy === null ? 'left the game' : (CAUSE_TEXT[p.eliminatedBy] ?? 'left the game')}.`,
      at: doc.createdAt,
    }));

  return deaths;
}
