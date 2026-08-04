import { normaliseCrewCode } from './crew-code.js';

export const MAX_DISPLAY_NAME = 24;

/**
 * The one place a typed name becomes a display name. It never substitutes a
 * default: an absent name is null and the caller rejects the join, so no player
 * can end up labelled with something they did not type.
 *
 * A name equal to the crew code is refused too. Nothing in the server produces
 * that, but the join field sits one tap from a pinned code, and a browser
 * autofill or a paste lands it silently — at which point the roster reads as a
 * row of identical codes.
 */
export function parseDisplayName(input: unknown, crewCode: string): string | null {
  if (typeof input !== 'string') return null;

  const trimmed = input.trim();
  if (trimmed === '') return null;
  if (normaliseCrewCode(trimmed) === normaliseCrewCode(crewCode)) return null;

  return trimmed.slice(0, MAX_DISPLAY_NAME);
}
