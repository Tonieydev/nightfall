import type { Phase } from '../game-core/index.js';

/**
 * What the GM says, and what the GM needs to know. Two different things, kept
 * apart on purpose: `lines` are spoken aloud, `cue` never is.
 */
export interface NarrationCard {
  /** Read aloud, in the GM's own voice. They may paraphrase; it is a prompt. */
  lines: string[];
  /** Private to the GM. Explains what to wait for, never what to decide. */
  cue: string | null;
  /**
   * What the GM is about to SAY to OPEN this phase, "Mafia wake up", not
   * "Night, doctor". The console labels its one control with the next thing out
   * of the GM's mouth, so pressing it is the same gesture as saying it.
   */
  advanceLabel: string;
  /**
   * What the GM says to CLOSE this phase: "Mafia, sleep."
   *
   * This is what the advance button carries on the way into the night, because
   * it is the sentence the GM is saying at the moment they press it. Null where
   * nobody is being put under.
   */
  sleepLabel: string | null;
}

export interface PhaseScript extends Omit<NarrationCard, 'lines'> {
  /**
   * The same phase, told more than one way. One is used per round, in order,
   * wrapping when a game outlasts the script.
   *
   * The instruction inside a variant never moves: whoever the phase wakes or
   * puts under is named in all of them, so no telling can leave the doctor
   * asleep through their own turn. Only the frame around the instruction
   * changes. A GM who runs four rounds otherwise says the same eight sentences
   * four times, and by the third night nobody is listening.
   */
  variants: string[][];
}

/**
 * The script is data. It can be rewritten, extended, or grown further tone
 * variants without anyone touching the console: nothing here branches on game
 * state, and nothing here knows what a room or a socket is.
 *
 * Register comes from the spec: spare and atmospheric, the way a person
 * actually talks at a table. "Mafia, wake up. Mafia, choose. Mafia, sleep."
 * The GM performs the drama; the script only hands them the line. Anything
 * arch or theatrical here reads as costume the moment it is said out loud.
 */
export const NARRATION_SCRIPT: Record<Phase, PhaseScript> = {
  LOBBY: {
    variants: [
      [
        'Everyone find a seat. Check your mic, say something so we know you are there.',
        'Once we start, the only thing you can trust is what someone says out loud.',
      ],
      [
        'Settle in. Say a word each so I know your mic is live.',
        'After this, everything you hear is somebody making a choice about you.',
      ],
      [
        'Find a seat, test your mic, and get comfortable.',
        'Some of you will be lying to this room in about a minute.',
      ],
    ],
    cue: 'Six in the room before you can start, and you will not hold a role: you narrate the whole night.',
    advanceLabel: 'Take your seats',
    sleepLabel: null,
  },

  ROLE_REVEAL: {
    variants: [
      [
        'Your card is on your screen. Look at it once, remember it, and show no one.',
        'Some of you are about to spend the night lying to your friends. Be good at it.',
      ],
      [
        'Cards are dealt. Read yours, then put your face back the way it was.',
        'Whatever it says, act like it says villager.',
      ],
      [
        'Check your screen. That is who you are tonight.',
        'Nobody sees anybody else. That is the whole game.',
      ],
    ],
    cue: 'Give them a moment with it. Advance when the room goes quiet again.',
    advanceLabel: 'Deal the cards',
    sleepLabel: 'Everyone sleep',
  },

  NIGHT_MAFIA: {
    variants: [
      [
        'Night falls. Everyone, sleep. Close your eyes.',
        'Mafia, wake up. Look at each other. Agree on who does not see the morning.',
      ],
      [
        'The lights go out again. Everyone, sleep.',
        'Mafia, wake up. One name between you. Take your time, the town is not going anywhere.',
      ],
      [
        'Eyes closed. Everyone, sleep.',
        'Mafia, wake up. You know the question by now. Answer it quietly.',
      ],
      [
        'The village puts itself to bed. Everyone, sleep.',
        'Mafia, wake up. Somebody at this table has run out of mornings. Decide who.',
      ],
    ],
    cue: 'Only the mafia hear each other now; the town hears you. Let them settle on a name or let the clock run out. A tie kills nobody, and that is allowed to happen.',
    advanceLabel: 'Mafia wake up',
    sleepLabel: 'Mafia sleep',
  },

  NIGHT_DOCTOR: {
    variants: [
      ['Mafia, sleep.', 'Doctor, wake up. One person lives through tonight if you choose them. Point.'],
      ['Mafia, sleep.', 'Doctor, wake up. Somebody gets to see the morning. Choose them.'],
      ['Mafia, sleep.', 'Doctor, wake up. One name, and you may say your own. Point.'],
    ],
    cue: 'The doctor does not speak, they tap. Advance once they have chosen. They may choose themselves.',
    advanceLabel: 'Doctor wake up',
    sleepLabel: 'Doctor sleep',
  },

  NIGHT_DETECTIVE: {
    variants: [
      [
        'Doctor, sleep.',
        'Detective, wake up. Choose one face. You will learn what they are, and no one else will.',
      ],
      [
        'Doctor, sleep.',
        'Detective, wake up. One question, one answer, and you keep it to yourself. Point.',
      ],
      [
        'Doctor, sleep.',
        'Detective, wake up. Pick someone you cannot read. Nobody but you sees what comes back.',
      ],
    ],
    cue: 'The answer lands on their screen the instant they tap. You never say it aloud, tonight or any night.',
    advanceLabel: 'Detective wake up',
    sleepLabel: 'Detective sleep',
  },

  DAWN: {
    variants: [
      ['Detective, sleep.', 'Everyone, wake up. The village opens its eyes.'],
      ['Detective, sleep.', 'Everyone, wake up. Let us see who is still with us.'],
      ['Detective, sleep.', 'Everyone, wake up. Morning, for most of you.'],
      ['Detective, sleep.', 'Everyone, wake up. Count the room before you say anything.'],
    ],
    cue: 'Read what happened off the roster, then say who did not make it, or tell them everyone did.',
    advanceLabel: 'Everyone wake up',
    sleepLabel: null,
  },

  DAY: {
    variants: [
      ['It is morning, and somebody at this table is lying to you.', 'Talk. Work out who.'],
      ['One of the voices you are about to hear did that. Talk.', 'Listen to who is loudest, and to who is not.'],
      ['You have the room and each other. That is all you get.', 'Talk. Somebody has to be wrong.'],
    ],
    cue: 'This one is theirs. Listen, keep time, and advance when the room has said what it needs to.',
    advanceLabel: 'Open the day',
    sleepLabel: null,
  },

  VOTE: {
    variants: [
      ['Enough. Choose someone.'],
      ['That is the talking done. Choose.'],
      ['Hands on names. Choose someone.'],
    ],
    cue: 'Votes appear live on every screen and can be pulled until you advance. A tie eliminates nobody.',
    advanceLabel: 'Call the vote',
    sleepLabel: null,
  },

  VERDICT: {
    variants: [
      ['The room has decided. Their card is face up.', 'Look at what you chose.'],
      ['That is your answer. Turn it over.', 'See what the room just did.'],
      ['The vote stands. Here is what they were.', 'Sit with it.'],
    ],
    cue: 'Everyone sees this one, living and dead. Give them the beat to react before you put them under.',
    advanceLabel: 'Confirm election',
    // The night is entered from here now, so this is where the whole room goes
    // down before the mafia open their eyes.
    sleepLabel: 'Everyone sleep',
  },

  GAME_OVER: {
    variants: [
      ['It is over. Every card is face up.', 'Go on then. Tell each other what you were.'],
      ['That is the game. Nothing left to hide.', 'Say what you were, and how close you came.'],
      ['Done. Everything is on the table now.', 'Argue about it. That is the best part.'],
    ],
    cue: null,
    advanceLabel: 'End the game',
    sleepLabel: null,
  },
};

/**
 * The card for a phase, told the way this round tells it.
 *
 * Rounds are one-based and wrap, because a room can outlast the script and an
 * empty card at round nine is worse than a repeat. Everything except the spoken
 * lines is steady: the cue is instruction and the button is a control, and
 * rotating either would make the console itself unreliable.
 */
export function narrationFor(phase: Phase, round = 1): NarrationCard {
  const script = NARRATION_SCRIPT[phase];
  const index = (Math.max(1, Math.trunc(round)) - 1) % script.variants.length;

  return {
    lines: script.variants[index] ?? script.variants[0] ?? [],
    cue: script.cue,
    advanceLabel: script.advanceLabel,
    sleepLabel: script.sleepLabel,
  };
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
 * skips any night role nobody alive is holding: with no doctor in the game the
 * mafia hand straight over to the detective, and a label fixed to the
 * destination would have the GM saying "Doctor, sleep" to an empty chair.
 */
export function advanceLabelFor(from: Phase, to: Phase): string {
  // Going into the night, the button is the sentence that CLOSES the phase the
  // GM is standing in: "Mafia, sleep." Naming the waking half here as well put
  // two sentences on one control, and the GM reads the button mid-narration,
  // not between narrations. The card carries the waking half.
  const sleep = NIGHTFALL.has(to) ? narrationFor(from).sleepLabel : null;

  return sleep ?? narrationFor(to).advanceLabel;
}
