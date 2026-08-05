import type { NightOutcome } from '../game-core/index.js';

export interface VerdictCopy {
  /** Said aloud at dawn. Never contains a saved name, and never a role. */
  headline: string;
  /** How to say it, and what to keep back. The GM's, not the room's. */
  detail: string;
}

/** "Ada", "Ada and Musa", "Ada, Musa and Chidi", the way a person says a list. */
function spokenList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}

/**
 * What the night did, in words the GM can read straight out.
 *
 * Kept out of the component because it is copy, not layout, and because the
 * plural cases the kill count introduced are worth testing on their own: the
 * difference between "Ada, Musa did not survive" and "Ada and Musa did not
 * survive" is the difference between a moderator reading and a moderator
 * translating.
 */
export function verdictCopy(night: NightOutcome, nameOf: (id: string) => string): VerdictCopy {
  const dead = night.eliminatedIds.map(nameOf);
  const saved = night.savedId === null ? null : nameOf(night.savedId);

  if (dead.length > 0) {
    const say = dead.length === 1 ? 'Say the name.' : 'Say the names.';
    return {
      headline: `${spokenList(dead)} did not survive the night.`,
      detail:
        saved === null
          ? `${say} Do not say the role. The cards stay down until the end.`
          : `${say} Somebody else was taken and pulled back. That is theirs to know, not yours to tell.`,
    };
  }

  if (saved !== null) {
    return {
      headline: 'The doctor got there first. Everybody lived.',
      detail: `${saved} was taken and pulled back. That is theirs to know, not yours to tell.`,
    };
  }

  return {
    headline: 'Nobody died last night.',
    detail: 'A tie or an empty ballot. Say it plainly; it unsettles people more than a death.',
  };
}
