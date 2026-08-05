import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (...parts: string[]): string => readFileSync(join(...parts), 'utf8');

const strip = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const WORDMARK = strip(read('src', 'app', 'Wordmark.tsx'));
const CSS = strip(read('src', 'app', 'globals.css'));

/**
 * The lockup is the one piece of the product a player sees before they trust it
 * with their voice, so it is worth a guard. Asserted against what ships, never
 * against a comment describing it.
 */
describe('the Nightfall lockup', () => {
  it('carries the name and what the product is', () => {
    expect(WORDMARK).toContain('Nightfall');
    expect(WORDMARK).toContain('Moderated voice mafia');
  });

  it('draws its mark with a Phosphor icon, not an image file', () => {
    // Nocturne is Phosphor only, and an <img> would need an asset the CSP and
    // the offline-first shell both have to care about.
    expect(WORDMARK).toMatch(/@phosphor-icons\/react/);
    expect(WORDMARK).not.toMatch(/<img|\.svg|\.png/);
  });

  it('takes every value from a token', () => {
    // No hex, no hard-coded font, no raw pixel the ramps already carry.
    const brand = CSS.slice(CSS.indexOf('.nf-wordmark'));
    const block = brand.slice(0, brand.indexOf('\n.nf-') === -1 ? 400 : 1200);

    expect(block).toMatch(/var\(--/);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('is styled at all', () => {
    expect(CSS).toContain('.nf-wordmark');
    expect(CSS).toContain('.nf-wordmark-mark');
  });
});

describe('the writing has no em dashes left in it', () => {
  /** Every file whose strings a player or GM can actually read. */
  const COPY = [
    ['src', 'narration', 'script.ts'],
    ['src', 'narration', 'verdict.ts'],
    ['src', 'app', 'page.tsx'],
    ['src', 'app', 'Wordmark.tsx'],
    ['src', 'app', 'c', '[code]', 'PhaseCard.tsx'],
    ['src', 'app', 'c', '[code]', 'SetupPanel.tsx'],
    ['src', 'app', 'c', '[code]', 'NightActions.tsx'],
    ['src', 'app', 'c', '[code]', 'Roster.tsx'],
    ['src', 'app', 'c', '[code]', 'VoteTally.tsx'],
    ['src', 'app', 'c', '[code]', 'Verdict.tsx'],
    ['src', 'app', 'c', '[code]', 'Lobby.tsx'],
    ['src', 'app', 'c', '[code]', 'PlayerScreen.tsx'],
    ['src', 'app', 'c', '[code]', 'GmConsole.tsx'],
    ['src', 'app', 'c', '[code]', 'StoryCard.tsx'],
    ['src', 'app', 'c', '[code]', 'Debrief.tsx'],
    ['src', 'app', 'c', '[code]', 'ClaimCard.tsx'],
    ['src', 'app', 'c', '[code]', 'audio-state.ts'],
    ['src', 'app', 'c', '[code]', 'phase-labels.ts'],
    ['src', 'room-store', 'game-config.ts'],
  ];

  for (const parts of COPY) {
    it(`has none in ${parts[parts.length - 1] ?? ''}`, () => {
      // Comments stripped first: what ships is the string, and a note in the
      // margin is not something anybody reads on a phone.
      const shipped = strip(read(...parts));

      expect(shipped).not.toContain('—');
    });
  }
});
