'use client';

import type { NarrationCard } from '@/narration/script';
import type { Phase } from '@/game-core';

/**
 * The GM's teleprompter. It prompts and nothing else — there is deliberately no
 * control on this card, because advancing is the one oversized button below it
 * and pacing belongs to the person narrating, not to the app.
 *
 * Keyed on the phase by its caller so the text re-enters with the 400ms ground
 * shift rather than swapping under the GM mid-sentence.
 */
export function StoryCard({ card, phase }: { card: NarrationCard; phase: Phase }) {
  return (
    <section className="nf-story" aria-label="Narration" data-phase={phase}>
      <p className="nf-kicker">Read aloud</p>

      {card.lines.map((line) => (
        <p key={line} className="nf-story-line">
          {line}
        </p>
      ))}

      {card.cue === null ? null : (
        <p className="nf-story-cue">
          <span className="nf-kicker">Only you see this</span>
          {card.cue}
        </p>
      )}
    </section>
  );
}
