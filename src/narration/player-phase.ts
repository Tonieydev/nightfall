import { ROLE_LABEL } from './roles.js';
import type { Phase, Role } from '../game-core/index.js';

export interface PlayerPhaseCopy {
  /** The headline. The phase, except at the reveal, where the card is the beat. */
  title: string;
  /** One line: what is happening, and whether this player is in it. */
  line: string;
  /** True when this player has nothing to tap and is only listening. */
  waiting: boolean;
}

/** Phases where this role is the one being asked to act. */
function actsIn(phase: Phase, role: Role): boolean {
  if (phase === 'VOTE') return true;
  if (phase === 'NIGHT_MAFIA') return role === 'MAFIA';
  if (phase === 'NIGHT_DOCTOR') return role === 'DOCTOR';
  if (phase === 'NIGHT_DETECTIVE') return role === 'DETECTIVE';
  return false;
}

const TITLE: Record<Phase, string> = {
  LOBBY: 'Waiting to start',
  ROLE_REVEAL: 'Your card',
  NIGHT_MAFIA: 'Night',
  NIGHT_DOCTOR: 'Night',
  NIGHT_DETECTIVE: 'Night',
  DAWN: 'Morning',
  DAY: 'Day',
  VOTE: 'The vote',
  VERDICT: 'The result',
  GAME_OVER: 'Game over',
};

/** What is happening, for somebody who is not being asked to do anything. */
const WATCHING: Record<Phase, string> = {
  LOBBY: 'Everyone is still arriving. Say something so they know your mic works.',
  ROLE_REVEAL: 'Look at your card, remember it, and show no one.',
  NIGHT_MAFIA: 'Eyes closed. Somewhere out there a choice is being made about you.',
  NIGHT_DOCTOR: 'Still night. Stay quiet and listen to the moderator.',
  NIGHT_DETECTIVE: 'Still night. Stay quiet and listen to the moderator.',
  DAWN: 'The room is waking up. Listen for who did not make it.',
  DAY: 'Talk. Work out who is lying, and say so out loud.',
  VOTE: 'The room is voting. Tap a name.',
  VERDICT: 'The card is turned over. Look at what the room chose.',
  GAME_OVER: 'Every card is face up. Argue about it.',
};

/**
 * What is happening, for the player whose turn it is. Never names a role: the
 * player already knows their own, and nobody else's belongs on this screen.
 */
const ACTING: Partial<Record<Phase, string>> = {
  NIGHT_MAFIA: 'Your turn. Settle on one name with the others and tap it.',
  NIGHT_DOCTOR: 'Your turn. Tap whoever lives through tonight. It may be you.',
  NIGHT_DETECTIVE: 'Your turn. Tap one face. Only you will see what comes back.',
  VOTE: 'Tap a name. You can pull it back until the moderator locks it.',
};

/**
 * What this player sees at the top of their own screen.
 *
 * The heading used to be their role, which is the one thing on that screen
 * guaranteed never to change, with the phase as a kicker two thirds smaller. A
 * player reported watching a whole round go by and seeing nothing move, and
 * they were right: between their own taps there was nothing on screen that did.
 *
 * Keyed on the phase and this player's own card, so it can never carry anything
 * they were not already projected.
 */
export function playerPhase(phase: Phase, role: Role | null, alive: boolean): PlayerPhaseCopy {
  // The reveal is the exception in the whole game: the card is the beat, and it
  // gets the headline once, on the one screen where it is the news.
  if (phase === 'ROLE_REVEAL' && role !== null) {
    return {
      title: ROLE_LABEL[role],
      line: WATCHING.ROLE_REVEAL,
      waiting: true,
    };
  }

  if (!alive) {
    return {
      title: TITLE[phase],
      line:
        phase === 'GAME_OVER'
          ? WATCHING.GAME_OVER
          : 'You are out. You can hear the day, and you say nothing.',
      waiting: true,
    };
  }

  const acting = role !== null && actsIn(phase, role);

  return {
    title: TITLE[phase],
    line: acting ? (ACTING[phase] ?? WATCHING[phase]) : WATCHING[phase],
    waiting: !acting,
  };
}
