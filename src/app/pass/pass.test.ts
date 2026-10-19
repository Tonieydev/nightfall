import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const PAGE = stripComments(readFileSync(join('src', 'app', 'pass', 'page.tsx'), 'utf8'));
const LANDING = stripComments(readFileSync(join('src', 'app', 'page.tsx'), 'utf8'));

describe('the pass-the-phone page', () => {
  it('never touches the network: roles stay on this one phone', () => {
    expect(PAGE).not.toMatch(/fetch\(|socket|io\(|\/api\//);
  });

  it('deals through game-core with an injected rng, and records the round', () => {
    expect(PAGE).toMatch(/dealCards\([^)]*Math\.random/s);
    expect(PAGE).toContain('recordRound');
  });

  it('hides the role again before the phone moves on', () => {
    // Next must clear the revealed flag in the same handler that advances.
    expect(PAGE).toMatch(/setRevealed\(false\)/);
  });

  it('keeps the dealt roles in memory only, never in storage', () => {
    expect(PAGE).not.toMatch(/setItem\([^)]*cards/);
  });

  it('is not a second primary action on the landing page', () => {
    expect(LANDING).toContain('href="/pass"');
    expect(LANDING.match(/btn-primary/g) ?? []).toHaveLength(1);
  });
});
