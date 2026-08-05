'use client';

import type { NarrationCard } from '@/narration/script';
import type { Phase } from '@/game-core';

/**
 * The GM's teleprompter. It prompts and nothing else: the only control on it
 * turns the script off, because advancing is the oversized button below it and
 * pacing belongs to the person narrating, not to the app.
 *
 * Keyed on the phase by its caller so the text re-enters with the 400ms ground
 * shift rather than swapping under the GM mid-sentence.
 */
export function StoryCard({
  card,
  phase,
  on,
  onToggle,
}: {
  card: NarrationCard;
  phase: Phase;
  on: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <section className="nf-story" aria-label="Narration" data-phase={phase}>
      <div className="nf-story-head">
        <p className="nf-kicker">Read aloud</p>
        {/* Some GMs have their own words and do not want a script in the way.
            Off hides the lines and keeps the card out of the layout entirely —
            it never gated anything, so switching it off costs nothing. */}
        <button
          type="button"
          className="btn btn-ghost nf-story-toggle"
          aria-pressed={on}
          onClick={() => onToggle(!on)}
        >
          {on ? 'Hide script' : 'Show script'}
        </button>
      </div>

      {!on ? null : (
        <>

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
        </>
      )}
    </section>
  );
}
