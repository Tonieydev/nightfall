import {
  advancePhase,
  checkWinCondition,
  resolveNight,
  tallyVotes,
  type GameState,
} from '../game-core/index.js';
import type { RoomDocument } from './types.js';
import { DomainError } from './errors.js';

export class NotGmError extends DomainError {
  readonly code = 'NOT_GM' as const;

  constructor(actorId: string) {
    super(`${actorId} is not the GM of this session`);
    this.name = 'NotGmError';
  }
}

export class GameNotStartedError extends DomainError {
  readonly code = 'GAME_NOT_STARTED' as const;

  constructor() {
    super('this room has no game yet');
    this.name = 'GameNotStartedError';
  }
}

export class NotAPlayerError extends DomainError {
  readonly code = 'NOT_A_PLAYER' as const;

  constructor(targetId: string) {
    super(`${targetId} is not a player in this game`);
    this.name = 'NotAPlayerError';
  }
}

export class NothingToRevertError extends DomainError {
  readonly code = 'NOTHING_TO_REVERT' as const;

  constructor() {
    super('nothing to revert — the game has not advanced yet');
    this.name = 'NothingToRevertError';
  }
}

/**
 * Authorization lives here rather than in the socket handler so it cannot be
 * bypassed by a second call site, and so it is testable without a socket.
 */
export function requireGm(doc: RoomDocument, actorId: string): GameState {
  if (doc.gmPlayerId === null || actorId !== doc.gmPlayerId) throw new NotGmError(actorId);
  if (doc.game === null) throw new GameNotStartedError();
  return doc.game;
}

/**
 * Overrides exist to break the rules, so they edit GameState directly — there
 * is no game-core function for "the GM says this player is dead". Every *rule*
 * consequence still routes through game-core: the win check below, and the
 * GAME_OVER divert inside advancePhase.
 */
function withWinCheck(doc: RoomDocument, game: GameState): RoomDocument {
  const winner = checkWinCondition(game);
  const settled: GameState =
    winner === null
      ? game
      : { ...game, phase: 'GAME_OVER', phaseEndsAt: null, winner };

  return { ...doc, game: { ...settled, version: game.version + 1 } };
}

function applyAdvance(doc: RoomDocument, game: GameState, now: number): RoomDocument {
  // Snapshot before the move: REVERT_PHASE restores this rather than computing
  // a backwards transition, so legal order stays only in game-core.
  const resolved = resolveVoteIfDue(resolveNightIfDue(game, now));

  // advancePhase runs checkWinCondition on what it is given, so handing it the
  // post-elimination state is what makes GAME_OVER game-core's decision.
  // Stamped here because this is the one funnel both ADVANCE and the server's
  // own reconciliation pass through. It anchors the GM's advisory day
  // countdown and nothing else — no rule reads it.
  const next = advancePhase(resolved, now);

  return {
    ...doc,
    previousGame: game,
    phaseChangedAt: now,
    // A new night is a new round. Every other phase leaves it alone.
    roundNumber:
      next.phase === 'NIGHT_MAFIA' && game.phase !== 'NIGHT_MAFIA'
        ? (doc.roundNumber ?? 1) + 1
        : (doc.roundNumber ?? 1),
    game: next,
  };
}

/**
 * ADVANCE is the lock. tallyVotes decides who goes — plurality out, tie or an
 * empty ballot out of nobody — and this only writes down the answer.
 */
function resolveVoteIfDue(game: GameState): GameState {
  if (game.phase !== 'VOTE') return game;

  const { eliminated } = tallyVotes(
    game.dayVotes,
    game.players.filter((p) => p.alive),
  );
  if (eliminated === null) return game;

  return {
    ...game,
    players: game.players.map((p) =>
      p.id === eliminated
        ? { ...p, alive: false, eliminatedAtPhase: game.phaseNumber, eliminatedBy: 'VOTE' }
        : p,
    ),
  };
}

export function advanceGame(doc: RoomDocument, actorId: string, now: number): RoomDocument {
  return applyAdvance(doc, requireGm(doc, actorId), now);
}

/** True when the phase's clock has run out and nobody has resolved it yet. */
export function isPhaseExpired(game: GameState, now: number): boolean {
  return game.phase !== 'GAME_OVER' && game.phaseEndsAt !== null && game.phaseEndsAt <= now;
}

/**
 * The correctness guarantee behind the per-room setTimeout. The timer is only a
 * fast path; this runs on every read, so a missed or never-scheduled timer — a
 * redeploy mid-phase — still resolves. Returns null when there is nothing to do,
 * which is also the guard against a late timer resolving a second time.
 */
export function reconcilePhase(doc: RoomDocument, now: number): RoomDocument | null {
  if (doc.game === null) return null;
  if (!isPhaseExpired(doc.game, now)) return null;

  return applyAdvance(doc, doc.game, now);
}

/**
 * The night resolves on the way into DAWN, whichever night phase we leave from
 * — advancePhase skips NIGHT_DOCTOR and NIGHT_DETECTIVE when nobody holds the
 * role. Asking advancePhase where we are going keeps that rule in game-core;
 * the peek is discarded, and advancePhase is pure so peeking costs nothing.
 */
function resolveNightIfDue(game: GameState, now: number): GameState {
  if (!game.phase.startsWith('NIGHT_')) return game;
  if (advancePhase(game, now).phase !== 'DAWN') return game;

  return resolveNight(game);
}

export function forceKill(doc: RoomDocument, actorId: string, targetId: string): RoomDocument {
  const game = requireGm(doc, actorId);
  if (!game.players.some((p) => p.id === targetId)) throw new NotAPlayerError(targetId);

  return withWinCheck(doc, {
    ...game,
    players: game.players.map((p) =>
      p.id === targetId
        ? { ...p, alive: false, eliminatedAtPhase: game.phaseNumber, eliminatedBy: 'GM' }
        : { ...p },
    ),
  });
}

export function forceRevive(doc: RoomDocument, actorId: string, targetId: string): RoomDocument {
  const game = requireGm(doc, actorId);
  if (!game.players.some((p) => p.id === targetId)) throw new NotAPlayerError(targetId);

  return withWinCheck(doc, {
    ...game,
    players: game.players.map((p) =>
      p.id === targetId
        ? { ...p, alive: true, eliminatedAtPhase: null, eliminatedBy: null }
        : { ...p },
    ),
  });
}

export function revertPhase(doc: RoomDocument, actorId: string): RoomDocument {
  requireGm(doc, actorId);
  const previous = doc.previousGame ?? null;
  if (previous === null) throw new NothingToRevertError();

  return {
    ...doc,
    game: { ...previous, version: (doc.game?.version ?? previous.version) + 1 },
    previousGame: null,
  };
}

export function endGame(doc: RoomDocument, actorId: string): RoomDocument {
  const game = requireGm(doc, actorId);

  // An abandoned game has no winner. Nothing is invented to fill the field.
  return {
    ...doc,
    game: { ...game, phase: 'GAME_OVER', phaseEndsAt: null, version: game.version + 1 },
  };
}
