import type { GameState } from '../game-core/index.js';
import { GameNotStartedError } from './commands.js';
import { InvalidTargetError, NotYourActionError, WrongPhaseError } from './night-actions.js';
import type { RoomDocument } from './types.js';

/**
 * Voting is public by construction: the ballot lives in GameState.dayVotes,
 * which projectState hands to every recipient unfiltered. There is no private
 * path here to accidentally build a secret ballot out of.
 */
function requireLivingVoter(doc: RoomDocument, actorId: string): GameState {
  if (doc.game === null) throw new GameNotStartedError();
  const game = doc.game;

  if (game.phase !== 'VOTE') throw new WrongPhaseError(game.phase, 'VOTE');

  // The GM holds no role, so they are not in players[] and cannot vote.
  const voter = game.players.find((p) => p.id === actorId);
  if (voter === undefined || !voter.alive) throw new NotYourActionError(actorId, 'VILLAGER');

  return game;
}

export function castVote(doc: RoomDocument, actorId: string, targetId: string): RoomDocument {
  const game = requireLivingVoter(doc, actorId);

  const target = game.players.find((p) => p.id === targetId);
  if (target === undefined || !target.alive) throw new InvalidTargetError(targetId);

  return {
    ...doc,
    game: {
      ...game,
      dayVotes: { ...game.dayVotes, [actorId]: targetId },
      version: game.version + 1,
    },
  };
}

/** A vote can be pulled, not just changed, until the GM locks it. */
export function clearVote(doc: RoomDocument, actorId: string): RoomDocument {
  const game = requireLivingVoter(doc, actorId);
  const { [actorId]: _removed, ...rest } = game.dayVotes;

  return { ...doc, game: { ...game, dayVotes: rest, version: game.version + 1 } };
}
