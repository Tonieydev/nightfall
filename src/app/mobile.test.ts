import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Comments here explain what was deliberately NOT done, so scanning raw source
 * for a forbidden setting finds the note saying it was avoided. Third time this
 * has caught me: assert against what ships, never against the file.
 */
const strip = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CSS = strip(readFileSync(join('src', 'app', 'globals.css'), 'utf8'));
const LAYOUT = strip(readFileSync(join('src', 'app', 'layout.tsx'), 'utf8'));

/**
 * This whole product is opened from a WhatsApp link on a phone. These are the
 * mobile faults that are invisible on a desktop and obvious the moment a real
 * device touches them.
 */
describe('tapping something never zooms the page', () => {
  it('gives inputs a font size iOS will not zoom past', () => {
    // Safari zooms the viewport whenever a focused input is under 16px, and
    // Nocturne's .input is 14px. The zoom then sticks: the page stays scaled
    // after the keyboard closes, so the GM's console is left cropped.
    const rule = /\.input[^{]*\{[^}]*font-size:\s*(1rem|16px)/;

    expect(CSS).toMatch(rule);
  });

  it('does not disable pinch zoom to achieve it', () => {
    // maximum-scale=1 would also stop the zoom, by taking zooming away from
    // people who need it. Fixing the font size costs nobody anything.
    expect(LAYOUT).not.toMatch(/maximumScale|maximum-scale/);
    expect(LAYOUT).not.toMatch(/userScalable\s*:\s*false|user-scalable\s*=\s*no/);
  });

  it('declares a viewport at all', () => {
    expect(LAYOUT).toMatch(/export const viewport/);
    expect(LAYOUT).toMatch(/width:\s*'device-width'/);
    expect(LAYOUT).toMatch(/initialScale:\s*1/);
  });

  it('stops a double tap zooming a button', () => {
    // touch-action: manipulation drops the double-tap-to-zoom gesture on
    // controls, which also removes Safari's 300ms click delay.
    expect(CSS).toMatch(/touch-action:\s*manipulation/);
  });
});

describe('a phone can actually work the console', () => {
  it('gives every control a thumb-sized target', () => {
    // 44px is Apple's own floor. The GM taps Advance while talking.
    expect(CSS).toMatch(/min-height:\s*2\.75rem/);
  });

  it('keeps the page from scrolling sideways', () => {
    // One overflowing table or a long crew code and the whole page slides,
    // which on a phone reads as the app being broken.
    expect(CSS).toMatch(/overflow-x:\s*hidden/);
  });

  it('respects the notch and the home indicator', () => {
    expect(CSS).toMatch(/env\(safe-area-inset/);
  });

  it('does not flash a grey box on every tap', () => {
    expect(CSS).toMatch(/-webkit-tap-highlight-color/);
  });
});
