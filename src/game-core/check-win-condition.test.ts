import { describe, expect, it } from 'vitest';
import { checkWinCondition } from './check-win-condition.js';
import { dead, gameState, player } from './state.fixture.js';

describe('checkWinCondition', () => {
  it('returns MAFIA when living Mafia reach parity with living Town', () => {
    const state = gameState([
      player('m1', 'MAFIA'),
      player('m2', 'MAFIA'),
      player('v1', 'VILLAGER'),
      player('d1', 'DOCTOR'),
    ]);

    expect(checkWinCondition(state)).toBe('MAFIA');
  });

  it('returns TOWN when no Mafia is left alive', () => {
    const state = gameState([
      dead('m1', 'MAFIA'),
      player('v1', 'VILLAGER'),
      player('v2', 'VILLAGER'),
      player('d1', 'DOCTOR'),
    ]);

    expect(checkWinCondition(state)).toBe('TOWN');
  });

  it('returns null while Mafia are outnumbered but alive', () => {
    const state = gameState([
      player('m1', 'MAFIA'),
      player('v1', 'VILLAGER'),
      player('v2', 'VILLAGER'),
      player('d1', 'DOCTOR'),
      player('t1', 'DETECTIVE'),
    ]);

    expect(checkWinCondition(state)).toBeNull();
  });

  it('never counts the dead on either side', () => {
    const mafiaGraveyard = gameState([
      player('m1', 'MAFIA'),
      dead('m2', 'MAFIA'),
      dead('m3', 'MAFIA'),
      player('v1', 'VILLAGER'),
      player('v2', 'VILLAGER'),
    ]);
    const townGraveyard = gameState([
      player('m1', 'MAFIA'),
      player('v1', 'VILLAGER'),
      dead('v2', 'VILLAGER'),
      dead('d1', 'DOCTOR'),
    ]);

    expect(checkWinCondition(mafiaGraveyard)).toBeNull();
    expect(checkWinCondition(townGraveyard)).toBe('MAFIA');
  });
});
