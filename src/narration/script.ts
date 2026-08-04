import type { Phase } from '../game-core/index.js';

/**
 * What the GM says, and what the GM needs to know. Two different things, kept
 * apart on purpose: `lines` are spoken aloud, `cue` never is.
 */
export interface NarrationCard {
  /** Read aloud, in the GM's own voice. They may paraphrase — it is a prompt. */
  lines: string[];
  /** Private to the GM. Explains what to wait for, never what to decide. */
  cue: string | null;
}

/**
 * The script is data. It can be rewritten, extended, or grown tone variants
 * without anyone touching the console — nothing here branches on game state,
 * and nothing here knows what a room or a socket is.
 *
 * Register comes from the spec: spare and atmospheric, the way a person
 * actually talks at a table. "Mafia, wake up. Mafia, choose. Mafia, sleep."
 * The GM performs the drama; the script only hands them the line. Anything
 * arch or theatrical here reads as costume the moment it is said out loud.
 */
export const NARRATION_SCRIPT: Record<Phase, NarrationCard> = {
  LOBBY: {
    lines: [
      'Everyone find a seat. Check your mic, say something so we know you are there.',
      'Once we start, the only thing you can trust is what someone says out loud.',
    ],
    cue: 'Six in the room before you can start, and you will not hold a role — you narrate the whole night.',
  },

  ROLE_REVEAL: {
    lines: [
      'Your card is on your screen. Look at it once, remember it, and show no one.',
      'Some of you are about to spend the night lying to your friends. Be good at it.',
    ],
    cue: 'Give them a moment with it. Advance when the room goes quiet again.',
  },

  NIGHT_MAFIA: {
    lines: [
      'Night falls. Everyone close your eyes — the village is asleep.',
      'Mafia, wake up. Look at each other. Agree on who does not see the morning.',
    ],
    cue: 'Only the mafia hear each other now; the town hears you. Let them settle on a name or let the clock run out — a tie kills nobody, and that is allowed to happen.',
  },

  NIGHT_DOCTOR: {
    lines: [
      'Mafia, sleep.',
      'Doctor, wake up. One person lives through tonight if you choose them. Point.',
    ],
    cue: 'The doctor does not speak, they tap. Advance once they have chosen — they may choose themselves.',
  },

  NIGHT_DETECTIVE: {
    lines: [
      'Doctor, sleep.',
      'Detective, wake up. Choose one face. You will learn what they are, and no one else will.',
    ],
    cue: 'The answer lands on their screen the instant they tap. You never say it aloud, tonight or any night.',
  },

  DAWN: {
    lines: [
      'Detective, sleep.',
      'The village wakes up. Open your eyes.',
    ],
    cue: 'Read what happened off the roster, then say the name — or tell them everyone made it through.',
  },

  DAY: {
    lines: [
      'It is morning, and somebody at this table is lying to you.',
      'Talk. Work out who.',
    ],
    cue: 'This one is theirs. Listen, keep time, and advance when the room has said what it needs to.',
  },

  VOTE: {
    lines: [
      'Enough. Choose someone.',
    ],
    cue: 'Votes appear live on every screen and can be pulled until you advance. A tie eliminates nobody.',
  },

  GAME_OVER: {
    lines: [
      'It is over. Every card is face up.',
      'Go on then — tell each other what you were.',
    ],
    cue: null,
  },
};

/** The card for a phase. Keyed by phase and nothing else. */
export function narrationFor(phase: Phase): NarrationCard {
  return NARRATION_SCRIPT[phase];
}
