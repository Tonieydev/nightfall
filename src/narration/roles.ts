import type { Role } from '../game-core/index.js';

/**
 * How a card is named out loud and on screen. Copy, so it lives here with the
 * rest of the copy rather than in the console: the roster, the debrief and the
 * election card all read from this one map and cannot drift into calling the
 * same card two different things.
 */
export const ROLE_LABEL: Record<Role, string> = {
  VILLAGER: 'Villager',
  MAFIA: 'Mafia',
  DOCTOR: 'Doctor',
  DETECTIVE: 'Detective',
};

/**
 * What the card actually asks of you, in one line. Taken from the design comp,
 * where the reveal is a card with a name and a job rather than a name alone: a
 * player who reads "Villager" and nothing else has been told what they are and
 * not what to do with it.
 */
export const ROLE_BLURB: Record<Role, string> = {
  MAFIA: 'You take one player each night. Say nothing in daylight that a villager would not say.',
  DOCTOR: 'Each night you protect one player. You may protect yourself.',
  DETECTIVE: 'Each night you learn one player’s alignment, and only you see it.',
  VILLAGER: 'No power. Your vote and your read are the whole job.',
};
