import { describe, expect, it } from 'vitest';
import { HEARS_LABEL, MIC_LABEL } from './audio-state.js';
import { ROLE_BLURB, ROLE_LABEL } from '@/narration/roles';
import type { Role } from '@/game-core';

const ROLES: Role[] = ['VILLAGER', 'MAFIA', 'DOCTOR', 'DETECTIVE'];

describe('the card tells you the job, not only the name', () => {
  it('has a line for every role', () => {
    for (const role of ROLES) {
      expect(ROLE_BLURB[role].trim(), role).not.toBe('');
      expect(ROLE_BLURB[role], role).toMatch(/[.?!]$/);
    }
  });

  it('never names another role on your card', () => {
    // The blurb sits under your own name in a card only you can see, so the
    // only role it may mention is the one it belongs to.
    for (const role of ROLES) {
      for (const other of ROLES.filter((r) => r !== role && r !== 'VILLAGER')) {
        expect(ROLE_BLURB[role], `${role} named ${other}`).not.toContain(ROLE_LABEL[other]);
      }
    }
  });
});

/**
 * The comp states the channel and the consequence on two lines: what your mic
 * is doing, and who that reaches. "Heard by 3" was mine and said neither.
 */
describe('the mic bar names the channel and who it reaches', () => {
  it('covers every channel', () => {
    for (const channel of ['open', 'mafia', 'dead', 'silenced'] as const) {
      expect(MIC_LABEL[channel].trim(), channel).not.toBe('');
      expect(HEARS_LABEL[channel].trim(), channel).not.toBe('');
    }
  });

  it('says nobody can hear a silenced player', () => {
    expect(MIC_LABEL.silenced).toBe('Muted by the game master');
    expect(HEARS_LABEL.silenced).toBe('No one can hear you');
  });

  it('tells a mafia speaker their channel is private', () => {
    // Reading "Mic live" during the night, with the whole town listening in
    // their imagination, is the single most costly thing this row could get
    // wrong.
    expect(MIC_LABEL.mafia).toContain('private');
    expect(HEARS_LABEL.mafia).toBe('Only the mafia can hear you');
  });

  it('tells the dead their channel is their own', () => {
    expect(HEARS_LABEL.dead).toBe('Only the eliminated can hear you');
  });

  it('tells the living the floor is open', () => {
    expect(HEARS_LABEL.open).toBe('Everyone alive can hear you');
  });
});
