import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PAGE = readFileSync(join('src', 'app', 'page.tsx'), 'utf8');
const CSS = readFileSync(join('src', 'app', 'globals.css'), 'utf8');

/**
 * Comments say what the page deliberately does NOT do, so scanning raw source
 * for a forbidden phrase finds the note explaining its absence. Only what
 * ships is under test here.
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SHIPPED = stripComments(PAGE);
const SHIPPED_CSS = stripComments(CSS);

describe('the landing page has exactly one job', () => {
  it('offers exactly one primary action, and it creates a crew', () => {
    // Counted by weight, not by tag. Joining with a code you were told aloud
    // is a real need — it just must never compete with Create for the eye.
    const primary = SHIPPED.match(/btn-primary/g) ?? [];

    expect(primary).toHaveLength(1);
    expect(SHIPPED).toContain('Create a crew');
  });

  it('calls the real crew route and lands in the lobby', () => {
    // The step-3 route, not a mock: creating a crew and arriving at its
    // permanent link is the entire loop this page exists to start.
    expect(PAGE).toContain(`fetch('/api/crew', { method: 'POST' })`);
    expect(PAGE).toContain('router.push(`/c/${code}`)');
  });

  it('captures nothing — there are no accounts to capture for', () => {
    // This forbids a FUNNEL, not every input. The first version banned inputs
    // outright and would have blocked joining by code, which is not capture at
    // all — nothing here is stored, and a crew code is not personal data.
    expect(SHIPPED).not.toMatch(/type="email"/);
    expect(SHIPPED).not.toMatch(/type="password"/);
    expect(SHIPPED).not.toMatch(/autoComplete="email"/);
    expect(SHIPPED.toLowerCase()).not.toContain('waitlist');
    expect(SHIPPED.toLowerCase()).not.toContain('sign up');
    expect(SHIPPED.toLowerCase()).not.toContain('password');
    expect(SHIPPED.toLowerCase()).not.toContain('your email');
  });

  it('lets somebody who was told a code get in', () => {
    // The pinned link is the front door, but codes get read aloud on calls and
    // typed into chats. Without this the only way in is guessing that /c/CODE
    // is a URL, which nobody does.
    // Only a real control satisfies this: somewhere to type the code, and
    // something to press that is NOT the primary action.
    expect(SHIPPED).toMatch(/<input/);
    expect(SHIPPED).toMatch(/Join/);
    expect(SHIPPED).toMatch(/btn-secondary|btn-ghost/);
    expect(SHIPPED).toMatch(/router\.push\(`\/c\/\$\{[a-zA-Z]+\}`\)/);
  });

  it('promises nothing the product refuses to do', () => {
    // The comp's landing surfaces were built around a paid host and an account,
    // both now non-goals. This checks for BILLING language, not for the word
    // "subscription" — that appears twice in the audio-graph copy, where it
    // means a LiveKit track subscription and has nothing to do with money.
    for (const billing of [
      'per session',
      'per player',
      'upgrade',
      'pricing',
      'free trial',
      'checkout',
      'billing',
      'card details',
      // Not "subscription" or "paid tier": the page says there are none of
      // either, and the denial is the point. The affirmatives below pin that.
    ]) {
      expect(SHIPPED.toLowerCase(), billing).not.toContain(billing);
    }
    // No figure, no currency, no rate.
    expect(SHIPPED).not.toMatch(
      /[$₦€£]\s?\d|\d+\s?(?:\/|per )\s?(?:month|session|seat)/i,
    );

    // And it says so plainly, because for this audience that is a differentiator.
    expect(SHIPPED).toContain('Free, permanently');
    expect(SHIPPED.toLowerCase()).toContain('no charges');
  });

  it('does not describe a dead chat, which the product does not have', () => {
    // The comp says the eliminated are "moved to dead chat". They are not —
    // they stay and listen. Shipping the comp's line would have been a lie.
    expect(SHIPPED.toLowerCase()).not.toContain('dead chat');
    expect(SHIPPED).toContain('They stay and listen');
  });
});

describe('the landing page stays inside Nocturne', () => {
  it('hard-codes no colour, size or font', () => {
    const landing = CSS.slice(CSS.indexOf('/* — the front door —'), CSS.indexOf('/* Motion competes'));

    expect(landing).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(landing).not.toMatch(/font-family/);
    // Every colour, space and radius resolves back to a token.
    expect(landing).toMatch(/var\(--color-accent-900\)/);
    expect(landing).toMatch(/var\(--space-/);
  });

  it('reaches for no second colour and no costume', () => {
    const landing = stripComments(
      CSS.slice(CSS.indexOf('/* — the front door —'), CSS.indexOf('/* Motion competes')),
    );

    // The refuse-list from spec section 6 bites hardest on a landing page.
    for (const costume of ['grain', 'vignette', 'blur(', 'sepia', 'accent-2', 'url(']) {
      expect(landing, costume).not.toContain(costume);
    }
    expect(SHIPPED).not.toMatch(/<img|background-image/);
  });

  it('respects a reader who has asked for less motion', () => {
    const reduced = SHIPPED_CSS.slice(
      SHIPPED_CSS.indexOf('@media (prefers-reduced-motion: reduce)'),
    );

    expect(reduced).toContain('.nf-arrive');
  });

  it('fits the hero and its action on a phone before any scroll', () => {
    // svh, not vh: mobile browser chrome makes vh taller than the visible page,
    // which is exactly how a primary action ends up below the fold.
    expect(CSS).toMatch(/\.nf-hero\s*\{[^}]*min-height:\s*88svh/);
  });
});
