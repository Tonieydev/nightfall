import type { GameState, Phase, Role } from '../game-core/index.js';
import { GameNotStartedError } from './commands.js';
import type { RoomDocument } from './types.js';

export class NotYourActionError extends Error {
  constructor(actorId: string, role: Role) {
    super(`${actorId} is not the living ${role}`);
    this.name = 'NotYourActionError';
  }
}

export class WrongPhaseError extends Error {
  constructor(phase: Phase, expected: Phase) {
    super(`that action belongs to ${expected}, not ${phase}`);
    this.name = 'WrongPhaseError';
  }
}

export class InvalidTargetError extends Error {
  constructor(targetId: string) {
    super(`${targetId} is not a living player`);
    this.name = 'InvalidTargetError';
  }
}

/**
 * Night actions only record intent on the document; nothing is resolved here.
 * resolveNight turns these three fields into an outcome, so the rules stay in
 * game-core and this layer stays a permission check plus a write.
 */
function authorize(
  doc: RoomDocument,
  actorId: string,
  role: Role,
  phase: Phase,
  targetId: string,
): GameState {
  if (doc.game === null) throw new GameNotStartedError();
  const game = doc.game;

  if (game.phase !== phase) throw new WrongPhaseError(game.phase, phase);

  // The GM holds no role, so this rejects them too — they narrate, they do not act.
  const actor = game.players.find((p) => p.id === actorId);
  if (actor === undefined || !actor.alive || actor.role !== role) {
    throw new NotYourActionError(actorId, role);
  }

  const target = game.players.find((p) => p.id === targetId);
  if (target === undefined || !target.alive) throw new InvalidTargetError(targetId);

  return game;
}

function withNight(doc: RoomDocument, game: GameState, night: GameState['night']): RoomDocument {
  return { ...doc, game: { ...game, night, version: game.version + 1 } };
}

export function mafiaVote(doc: RoomDocument, actorId: string, targetId: string): RoomDocument {
  const game = authorize(doc, actorId, 'MAFIA', 'NIGHT_MAFIA', targetId);

  // Re-voting replaces this Mafia's own vote and touches nobody else's.
  return withNight(doc, game, {
    ...game.night,
    mafiaVotes: { ...game.night.mafiaVotes, [actorId]: targetId },
  });
}

export function doctorSave(doc: RoomDocument, actorId: string, targetId: string): RoomDocument {
  const game = authorize(doc, actorId, 'DOCTOR', 'NIGHT_DOCTOR', targetId);

  return withNight(doc, game, { ...game.night, doctorSave: targetId });
}

export function detectiveCheck(doc: RoomDocument, actorId: string, targetId: string): RoomDocument {
  const game = authorize(doc, actorId, 'DETECTIVE', 'NIGHT_DETECTIVE', targetId);

  return withNight(doc, game, { ...game.night, detectiveCheck: targetId });
}
