import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NARRATION_SCRIPT, narrationFor } from './script.js';
import type { Phase } from '../game-core/index.js';

const PHASES: Phase[] = [
  'LOBBY',
  'ROLE_REVEAL',
  'NIGHT_MAFIA',
  'NIGHT_DOCTOR',
  'NIGHT_DETECTIVE',
  'DAWN',
  'DAY',
  'VOTE',
  'VERDICT',
  'GAME_OVER',
];

describe('the narration script', () => {
  it('has real content for every phase', () => {
    expect(Object.keys(NARRATION_SCRIPT).sort()).toEqual([...PHASES].sort());

    for (const phase of PHASES) {
      const card = narrationFor(phase);
      expect(card.lines.length, phase).toBeGreaterThan(0);

      for (const line of card.lines) {
        // A real spoken line: has words, and ends the way a sentence does.
        expect(line.trim(), phase).not.toBe('');
        expect(line.trim(), `${phase}: "${line}"`).toMatch(/[.?!…]$/);
      }
      // Measured across the whole card, never per line. "Mafia, sleep." is
      // thirteen characters and "Enough. Choose someone." is twenty-three —
      // both are exactly the register the spec asks for. What this catches is
      // a phase left as a stub, not a line that is deliberately curt.
      const whole = [...card.lines, card.cue ?? ''].join(' ').trim();
      expect(whole.length, `${phase}: "${whole}"`).toBeGreaterThan(60);
    }
  });

  it('gives the GM a private cue wherever the phase asks something of them', () => {
    // Every phase but the last is waiting on the GM to do or judge something.
    for (const phase of PHASES.filter((p) => p !== 'GAME_OVER')) {
      expect(narrationFor(phase).cue, phase).not.toBeNull();
    }
  });

  it('keeps the spoken lines and the private cue apart', () => {
    for (const phase of PHASES) {
      const card = narrationFor(phase);
      // A cue read aloud would tell the table how the machinery works.
      expect(card.lines, phase).not.toContain(card.cue);
    }
  });

  it('stays out of costume', () => {
    // The refuse-list in spec section 6 applies to words too. The GM performs
    // the drama; the script only has to hand them the line.
    const all = JSON.stringify(NARRATION_SCRIPT).toLowerCase();

    for (const camp of [
      'mwahaha',
      'muahaha',
      'cackle',
      'sinister',
      'evil',
      'dastardly',
      'fedora',
      'wise guy',
      'capisce',
      'bwahaha',
      '!!',
    ]) {
      expect(all, camp).not.toContain(camp);
    }
  });

  it('never tells the GM to adjudicate', () => {
    // Voice persuades, tap decides. A cue that invited the GM to rule on an
    // outcome would contradict the one rule the phase engine is built around.
    const cues = PHASES.map((p) => narrationFor(p).cue ?? '').join(' ').toLowerCase();

    for (const forbidden of ['you decide', 'choose who dies', 'pick the winner', 'overrule']) {
      expect(cues, forbidden).not.toContain(forbidden);
    }
  });

  it('is data, not logic', () => {
    const source = readFileSync(join('src', 'narration', 'script.ts'), 'utf8');

    // Rewritable, extendable, and open to tone variants later without anyone
    // touching the console. Nothing here may branch on game state.
    expect(source).not.toMatch(/\bif\s*\(|\bfor\s*\(|\bwhile\s*\(/);
    expect(source).not.toMatch(/import .*(room-store|realtime|app)/);
  });
});
