import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string): string =>
  readFileSync(join('src', 'app', 'c', '[code]', name), 'utf8');

/** Assert against what ships, never against a comment describing it. */
const strip = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const LOBBY = strip(read('Lobby.tsx'));
const PLAYER = strip(read('PlayerScreen.tsx'));
const GM = strip(read('GmConsole.tsx'));

/**
 * Six people were seated in a room and exactly one of them was on the call.
 * The other five never opened voice, and the control that opens it was the last
 * element on the card, under a list of six names, below the fold on a phone.
 *
 * This is a voice product. The control that turns voice on cannot be something
 * you scroll to find.
 */
describe('the way into voice is the first thing on the screen', () => {
  it('offers voice before the roster in the lobby', () => {
    const mic = LOBBY.indexOf('<MicRow');
    const roster = LOBBY.indexOf('nf-roster');

    expect(mic, 'MicRow is rendered in the lobby').toBeGreaterThan(-1);
    expect(mic, 'MicRow comes before the member list').toBeLessThan(roster);
  });

  it('offers voice before the roster on a player screen', () => {
    const mic = PLAYER.indexOf('<MicRow');
    const roster = PLAYER.indexOf('nf-roster');

    expect(mic).toBeGreaterThan(-1);
    expect(mic).toBeLessThan(roster);
  });

  it('keeps it above the phase card for the GM, who narrates over everything', () => {
    const mic = GM.indexOf('<MicRow');
    const phase = GM.indexOf('<PhaseCard');

    expect(mic).toBeGreaterThan(-1);
    expect(mic).toBeLessThan(phase);
  });

  it('says out loud that nobody can hear you yet', () => {
    // A button somebody has not noticed is the same as a button that is not
    // there. The lobby states the consequence, not just the affordance.
    expect(LOBBY).toMatch(/nobody can hear you|not on the call|no one can hear/i);
  });
});
