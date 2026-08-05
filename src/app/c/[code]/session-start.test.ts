import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string): string =>
  readFileSync(join('src', 'app', 'c', '[code]', name), 'utf8');

/** Assert against what ships, never against a comment describing it. */
const strip = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const LOBBY = strip(read('Lobby.tsx'));
const GM_CONSOLE = strip(read('GmConsole.tsx'));
const SETUP = strip(read('SetupPanel.tsx'));

/** The exact words on the control that takes the GM seat. */
const CLAIM_COPY = 'I will moderate';

/**
 * Both of these were found by real users on a real call, not by a test. The
 * first game with strangers in it started before anybody meant it to, and
 * nobody was ever asked for their microphone.
 */
describe('nobody becomes the moderator by accident', () => {
  it('does not hand every arrival a primary Start button', () => {
    // The setup panel used to render for every member the moment the room was
    // startable, with a full-width primary button on it. With seats already
    // filled, the first stranger to open the link tapped the biggest thing on
    // the screen and took the GM seat, mid-arrival, from everyone else.
    // Keyed on the shipped copy, not on an identifier: `claimAvailable` is the
    // email identity claim and has nothing to do with moderating, and matching
    // it made this test pass while the bug was still there.
    expect(LOBBY).toContain(CLAIM_COPY);
  });

  it('keeps the claim quieter than the game itself', () => {
    // Whoever presses Start still becomes the GM: that is the spec's rule and
    // it has not changed. It just may not be the loudest control in the lobby.
    const at = LOBBY.indexOf(CLAIM_COPY);
    const control = LOBBY.slice(Math.max(0, at - 300), at);

    expect(control).toContain('btn-secondary');
    expect(control).not.toContain('btn-primary');
  });

  it('shows the setup only once somebody has claimed it', () => {
    // The panel carries the Start button, so gating the panel gates the seat.
    const gate = LOBBY.slice(0, LOBBY.indexOf('<SetupPanel'));

    expect(gate).toMatch(/moderating\s*\?/);
  });

  it('still tells everyone else what is happening', () => {
    expect(LOBBY).toMatch(/session has started|is moderating/i);
  });
});

describe('every microphone gets asked for', () => {
  it('offers voice in the lobby, before the game is under way', () => {
    // The only route to voice.connect() was the player screen, which does not
    // exist until the game has started. So the permission prompt arrived mid
    // narration if it arrived at all, and iOS wants that gesture early.
    expect(LOBBY).toMatch(/MicRow|onEnableVoice|voice\.connect/);
    const beforeGame = LOBBY.slice(LOBBY.indexOf('const seated'));

    expect(beforeGame, 'the lobby body offers voice').toMatch(/MicRow|voice\.connect/);
  });

  it('gives the GM a microphone at all', () => {
    // The GM is audible to every player in every phase, and had no control to
    // turn their own microphone on. They were the one person guaranteed to be
    // silent.
    expect(GM_CONSOLE).toMatch(/MicRow|onEnableVoice/);
    expect(GM_CONSOLE).toMatch(/voiceStatus|VoiceStatus/);
  });

  it('does not connect voice without a tap', () => {
    // iOS Safari needs a user gesture for capture AND playback. An automatic
    // connect on mount spends neither and silently fails.
    for (const [name, source] of [
      ['Lobby', LOBBY],
      ['GmConsole', GM_CONSOLE],
      ['SetupPanel', SETUP],
    ] as const) {
      expect(source, name).not.toMatch(/useEffect\([^)]*voice\.connect/);
    }
  });
});
