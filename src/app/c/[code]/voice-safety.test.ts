import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (name: string): string =>
  readFileSync(join('src', 'app', 'c', '[code]', name), 'utf8');

/** Assert against what ships, never against a comment describing it. */
const strip = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const USE_VOICE = strip(read('useVoice.ts'));
const LOBBY = strip(read('Lobby.tsx'));

/**
 * The audio graph is only worth anything if the client cannot hear round it.
 */
describe('the client never subscribes to audio the server did not grant', () => {
  it('joins the voice room with auto-subscribe off', () => {
    // LiveKit subscribes a joiner to every published track by default. A player
    // opening their mic during NIGHT_MAFIA would be handed the mafia's audio by
    // the SFU and hear it until the server's next pass pruned it. Turning it
    // off makes the server's explicit subscriptions the only source, which is
    // the same rule as everywhere else: filter before the send, never after.
    expect(USE_VOICE).toMatch(/autoSubscribe:\s*false/);
  });

  it('passes those options to connect, not to the Room constructor', () => {
    // autoSubscribe is a connect option. Setting it on the Room is silently
    // ignored, which would leave the leak open while looking closed.
    const connect = USE_VOICE.slice(USE_VOICE.indexOf('room.connect('));

    expect(connect.slice(0, 200)).toMatch(/autoSubscribe/);
  });

  it('tells the server once the device has joined', () => {
    // Subscriptions are issued by walking the participants LiveKit reports, so
    // a device that joins between phase changes is invisible to the last pass
    // and hears nobody until the next one.
    expect(LOBBY).toMatch(/voiceReady/);
  });

  it('announces arrival only after the connection succeeded', () => {
    // Announcing before the join would trigger a pass that still cannot see
    // this device, which is the bug it exists to fix.
    expect(LOBBY).toMatch(/connect\(\)\s*\.then\(|await voice\.connect\(\)/);
  });
});

/**
 * The last link, and the one that was missing for the whole of this product's
 * life: LiveKit hands a subscribed track to the browser and stops there.
 *
 * livekit-client does not put remote audio on the page by itself. startAudio()
 * only resumes elements that are already attached, so with nothing attaching
 * them there is nothing to resume: publishing worked, subscriptions worked, and
 * not one person ever heard another.
 */
describe('a subscribed track is actually played', () => {
  it('listens for tracks arriving', () => {
    expect(USE_VOICE).toMatch(/TrackSubscribed/);
  });

  it('attaches remote audio to the page', () => {
    expect(USE_VOICE).toMatch(/\.attach\(/);
    expect(USE_VOICE).toMatch(/appendChild|append\(/);
  });

  it('takes it away again when the server revokes it', () => {
    // Subscriptions are revoked every night. An element left playing would be
    // the mafia channel leaking out of a page nobody is looking at.
    expect(USE_VOICE).toMatch(/TrackUnsubscribed/);
    expect(USE_VOICE).toMatch(/\.detach\(/);
  });

  it('cleans up when the room goes away', () => {
    expect(USE_VOICE).toMatch(/remove\(\)/);
  });

  it('never attaches the same track twice', () => {
    // attach() mints a NEW element on every call, and the server re-issues
    // subscribe on every graph pass, so TrackSubscribed fires again for a track
    // that is already playing. Two elements on one stream, a few milliseconds
    // apart, is reverb. Three is an echo. Guarded on the SDK's own bookkeeping,
    // which is the same array startAudio() reads.
    expect(USE_VOICE).toMatch(/attachedElements\.length/);
  });
});
