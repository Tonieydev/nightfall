import { describe, expect, it } from 'vitest';
import { advancePhase } from './advance-phase.js';
import { computeAudioGraph } from './compute-audio-graph.js';
import { projectState } from './project-state.js';
import { dead, gameState, player } from './state.fixture.js';
import type { GameState, Player } from './types.js';

const cast = (): Player[] => [
  player('m1', 'MAFIA'),
  player('m2', 'MAFIA'),
  player('v1', 'VILLAGER'),
  player('v2', 'VILLAGER'),
  player('doc', 'DOCTOR'),
  player('det', 'DETECTIVE'),
];

const at = (phase: GameState['phase'], players: Player[] = cast()): GameState =>
  gameState(players, { phase, phaseNumber: 2 });

/**
 * The day had no equivalent of DAWN. One press tallied the ballot, eliminated
 * somebody and dropped the room into night, so the room never saw the outcome
 * of its own vote. VERDICT is that missing beat.
 */
describe('the verdict phase', () => {
  it('sits between the vote and the night', () => {
    expect(advancePhase(at('VOTE'), 0).phase).toBe('VERDICT');
    expect(advancePhase(at('VERDICT'), 0).phase).toBe('NIGHT_MAFIA');
  });

  it('opens the next night when it is left, not when the vote is locked', () => {
    // The night's clock starts at VERDICT -> NIGHT_MAFIA. Starting it a press
    // earlier would run the mafia's timer while the GM is still reading a card.
    const opened = advancePhase(at('VERDICT'), 1_000);

    expect(opened.phaseEndsAt).toBe(1_000 + opened.config.mafiaNightMs);
    expect(advancePhase(at('VOTE'), 1_000).phaseEndsAt).toBeNull();
  });

  it('counts as the same round as the day it closes', () => {
    // phaseNumber ticks when a night opens, so the verdict belongs to the day
    // that produced it and not to the night that follows.
    const verdict = advancePhase(at('VOTE'), 0);

    expect(verdict.phaseNumber).toBe(2);
    expect(advancePhase(verdict, 0).phaseNumber).toBe(3);
  });

  it('is skipped when the vote itself ends the game', () => {
    // checkWinCondition runs first: with no mafia left there is nothing to
    // reveal that the debrief will not reveal better.
    const noMafia = [
      dead('m1', 'MAFIA'),
      dead('m2', 'MAFIA'),
      player('v1', 'VILLAGER'),
      player('v2', 'VILLAGER'),
      player('doc', 'DOCTOR'),
      player('det', 'DETECTIVE'),
    ];

    expect(advancePhase(at('VOTE', noMafia), 0).phase).toBe('GAME_OVER');
  });

  it('keeps the room talking, the way the day does', () => {
    // The GM says what happened and the room reacts to it. Silence here would
    // read as the call dropping at the most charged moment of the round.
    const state = at('VERDICT');
    const graph = computeAudioGraph(state);

    expect(graph.get('v1')?.has('v2')).toBe(true);
    expect(graph.get('gm')?.size).toBe(state.players.length);
  });

  it('does not let the eliminated speak into it', () => {
    const players = cast();
    players[2] = dead('v1', 'VILLAGER');

    expect(computeAudioGraph(at('VERDICT', players)).get('v1')?.size).toBe(0);
  });
});

/**
 * The point of the whole phase: the room learns whether it caught anybody. A
 * day vote that returns no information leaves town guessing blind every round.
 */
describe('a card the room voted out is turned face up', () => {
  const lynched = (): Player[] => {
    const players = cast();
    players[0] = player('m1', 'MAFIA', {
      alive: false,
      eliminatedAtPhase: 2,
      eliminatedBy: 'VOTE',
    });
    return players;
  };

  it('shows the elected player’s role to every living player', () => {
    const view = projectState(at('VERDICT', lynched()), 'v1');

    expect(view.players.find((p) => p.id === 'm1')?.role).toBe('MAFIA');
  });

  it('shows it to the dead as well', () => {
    const players = lynched();
    players[3] = dead('v2', 'VILLAGER');

    expect(
      projectState(at('VERDICT', players), 'v2').players.find((p) => p.id === 'm1')?.role,
    ).toBe('MAFIA');
  });

  it('stays face up for the rest of the game, because everyone saw it', () => {
    for (const phase of ['VERDICT', 'NIGHT_MAFIA', 'DAY', 'VOTE'] as GameState['phase'][]) {
      expect(
        projectState(at(phase, lynched()), 'v1').players.find((p) => p.id === 'm1')?.role,
        phase,
      ).toBe('MAFIA');
    }
  });

  it('leaves a night kill face down', () => {
    // Only the vote turns a card over. A mafia kill that revealed a card would
    // hand town a free true read every single night.
    const players = cast();
    players[2] = player('v1', 'VILLAGER', {
      alive: false,
      eliminatedAtPhase: 1,
      eliminatedBy: 'MAFIA',
    });

    expect(projectState(at('VERDICT', players), 'v2').players.find((p) => p.id === 'v1')?.role)
      .toBeNull();
  });

  it('still hides every living player’s card', () => {
    // The relaxation is exactly one rule wide. Asserted on the wire, because a
    // field can be present in JSON while the type says otherwise.
    const wire = JSON.stringify(projectState(at('VERDICT', lynched()), 'v1'));

    expect(wire).not.toContain('DOCTOR');
    expect(wire).not.toContain('DETECTIVE');
    expect(wire.match(/MAFIA/g)?.length ?? 0).toBe(1);
  });
});
