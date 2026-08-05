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
