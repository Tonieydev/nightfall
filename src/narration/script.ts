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
  /**
   * What the GM is about to SAY to OPEN this phase — "Mafia wake up", not
   * "Night, doctor". The console labels its one control with the next thing out
   * of the GM's mouth, so pressing it is the same gesture as saying it.
   */
  advanceLabel: string;
  /**
   * What the GM says to CLOSE this phase, in the same breath as the line that
   * opens the next one: "Mafia, sleep. Doctor, wake up." One tap is two
   * sentences at the table, and a button that only carried the second half left
   * the mafia awake for the rest of the night.
   *
   * Null where nobody is being put under.
   */
  sleepLabel: string | null;
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
    advanceLabel: 'Take your seats',
    sleepLabel: null,
  },

  ROLE_REVEAL: {
    lines: [
      'Your card is on your screen. Look at it once, remember it, and show no one.',
      'Some of you are about to spend the night lying to your friends. Be good at it.',
    ],
    cue: 'Give them a moment with it. Advance when the room goes quiet again.',
    advanceLabel: 'Deal the cards',
    sleepLabel: 'Everyone sleep',
  },

  NIGHT_MAFIA: {
    lines: [
      'Night falls. Everyone, sleep — close your eyes.',
      'Mafia, wake up. Look at each other. Agree on who does not see the morning.',
    ],
    cue: 'Only the mafia hear each other now; the town hears you. Let them settle on a name or let the clock run out — a tie kills nobody, and that is allowed to happen.',
    advanceLabel: 'Mafia wake up',
    sleepLabel: 'Mafia sleep',
  },

  NIGHT_DOCTOR: {
    lines: [
      'Mafia, sleep.',
      'Doctor, wake up. One person lives through tonight if you choose them. Point.',
    ],
    cue: 'The doctor does not speak, they tap. Advance once they have chosen — they may choose themselves.',
    advanceLabel: 'Doctor wake up',
    sleepLabel: 'Doctor sleep',
  },

  NIGHT_DETECTIVE: {
    lines: [
      'Doctor, sleep.',
      'Detective, wake up. Choose one face. You will learn what they are, and no one else will.',
    ],
    cue: 'The answer lands on their screen the instant they tap. You never say it aloud, tonight or any night.',
    advanceLabel: 'Detective wake up',
    sleepLabel: 'Detective sleep',
  },

  DAWN: {
    lines: [
      'Detective, sleep.',
      'Everyone, wake up. The village opens its eyes.',
    ],
    cue: 'Read what happened off the roster, then say who did not make it — or tell them everyone did.',
    advanceLabel: 'Everyone wake up',
    sleepLabel: null,
  },

  DAY: {
    lines: [
      'It is morning, and somebody at this table is lying to you.',
      'Talk. Work out who.',
    ],
    cue: 'This one is theirs. Listen, keep time, and advance when the room has said what it needs to.',
    advanceLabel: 'Open the day',
    sleepLabel: null,
  },

  VOTE: {
    lines: [
      'Enough. Choose someone.',
    ],
    cue: 'Votes appear live on every screen and can be pulled until you advance. A tie eliminates nobody.',
    advanceLabel: 'Call the vote',
    // The next night is entered from here, not from the reveal, so the whole
    // room still has to go down before the mafia open their eyes.
    sleepLabel: 'Everyone sleep',
  },

  GAME_OVER: {
    lines: [
      'It is over. Every card is face up.',
      'Go on then — tell each other what you were.',
    ],
    cue: null,
    advanceLabel: 'End the game',
    sleepLabel: null,
  },
};

/** The card for a phase. Keyed by phase and nothing else. */
export function narrationFor(phase: Phase): NarrationCard {
  return NARRATION_SCRIPT[phase];
}

/**
 * Phases the GM talks the room INTO. Only these carry the sleep beat: a tap
 * that opens the day or ends the game is one sentence, not two.
 */
const NIGHTFALL: ReadonlySet<Phase> = new Set<Phase>([
  'NIGHT_MAFIA',
  'NIGHT_DOCTOR',
  'NIGHT_DETECTIVE',
  'DAWN',
]);

/**
 * The whole line on the button, for a move from one phase to another.
 *
 * Composed from both ends rather than stored per phase, because advancePhase
 * skips any night role nobody alive is holding — with no doctor in the game the
 * mafia hand straight over to the detective, and a label fixed to the
 * destination would have the GM saying "Doctor, sleep" to an empty chair.
 */
export function advanceLabelFor(from: Phase, to: Phase): string {
  const wake = narrationFor(to).advanceLabel;
  const sleep = NIGHTFALL.has(to) ? narrationFor(from).sleepLabel : null;

  return sleep === null ? wake : `${sleep}${BEAT_SEPARATOR}${wake}`;
}

const BEAT_SEPARATOR = ' · ';

/**
 * The label back apart into the sentences it was built from, so the button can
 * keep each one unbroken and wrap between them instead of through them.
 */
export function advanceBeats(label: string): string[] {
  return label.split(BEAT_SEPARATOR);
}
