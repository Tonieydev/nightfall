import { MIN_PLAYERS_TO_START, ROOM_TTL_SECONDS } from './keys.js';
import type { GameConfig } from '../game-core/index.js';

/** Enough to say a name; short enough that the clock is still pressure. */
export const MAFIA_NIGHT_MIN_MS = 15_000;
export const MAFIA_NIGHT_MAX_MS = 120_000;

export const MAFIA_NIGHT_CHOICES = [30_000, 45_000, 60_000, 90_000] as const;

/** Null is a real choice: not every GM wants a clock on the conversation. */
export const DAY_TARGET_CHOICES = [null, 180_000, 300_000, 420_000, 600_000] as const;

/**
 * How many names the mafia's ballot may settle on in one night. One is the game
 * everybody knows; more is for rooms big enough that a single kill a night makes
 * the day drag. Three is the ceiling because a room this size runs out of town
 * before it runs out of conversation.
 */
export const NIGHT_KILL_CHOICES = [1, 2, 3] as const;

/** The count in force, given a GM who never touched the setting. */
export function nightKillsFor(config: GameConfig): number {
  return config.nightKills ?? 1;
}

/**
 * The same derivation game-core uses when the GM does not override it. Copied
 * rather than imported because it is not exported from there, and game-core is
 * not being touched — the test asserts the two agree for every room size, which
 * is what keeps the copy honest.
 */
export function mafiaCountFor(playerCount: number, override: number | null): number {
  return override ?? Math.max(1, Math.round(playerCount / 4));
}

/**
 * What is wrong with this lineup, in words the GM can act on.
 *
 * game-core already throws on an impossible lineup — but it throws at Start,
 * after the GM has committed, and the message is written for a developer. This
 * runs the same rules before the button is pressed. A test walks every lineup a
 * room can hold and asserts this flags exactly what assignRoles rejects, so the
 * two cannot drift into warning about different things.
 *
 * `playerCount` is the players, not the seats: the GM narrates and holds no role.
 */
export function configProblems(
  config: GameConfig,
  playerCount: number,
  dayTargetMs: number | null,
): string[] {
  const problems: string[] = [];

  if (playerCount < MIN_PLAYERS_TO_START) {
    problems.push(
      `You need ${String(MIN_PLAYERS_TO_START)} players besides yourself to start — there are ${String(playerCount)}.`,
    );
  }

  const mafia = mafiaCountFor(playerCount, config.mafiaCount);
  if (mafia > playerCount) {
    problems.push(
      `That is more mafia than there are players: ${String(mafia)} of ${String(playerCount)}.`,
    );
  } else if (mafia >= playerCount - mafia) {
    problems.push(
      `${String(mafia)} mafia against ${String(playerCount - mafia)} town starts at or above parity — the town cannot win from there.`,
    );
  }

  const kills = nightKillsFor(config);
  const town = playerCount - mafia;
  if (kills < 1) {
    problems.push('A night the mafia cannot take anybody from is a stalemate, not a game.');
  } else if (kills > mafia) {
    problems.push(
      `Each mafia names one person, so ${String(mafia)} of them can never settle on ${String(kills)}.`,
    );
  } else if (kills > 1 && town - kills <= mafia) {
    // The win condition is mafia >= town. If one night gets there, the game is
    // decided before anybody has said anything worth hearing.
    //
    // Only checked once the GM has raised the count. A one-kill game that ends
    // on the first night is a tight lineup, not a misconfiguration, and it is
    // how this has always been allowed to play — a guard rail on a new setting
    // must not start refusing old ones.
    problems.push(
      `${String(kills)} a night against ${String(town)} town ends it on the first night.`,
    );
  }

  if (config.mafiaNightMs < MAFIA_NIGHT_MIN_MS) {
    problems.push(
      `The mafia need at least ${String(MAFIA_NIGHT_MIN_MS / 1000)} seconds to agree on somebody.`,
    );
  }
  if (config.mafiaNightMs > MAFIA_NIGHT_MAX_MS) {
    problems.push(
      `A night longer than ${String(MAFIA_NIGHT_MAX_MS / 1000)} seconds stops being pressure.`,
    );
  }

  if (dayTargetMs !== null) {
    if (dayTargetMs <= 0) {
      problems.push('A day target has to be longer than nothing.');
    } else if (dayTargetMs > ROOM_TTL_SECONDS * 1000) {
      problems.push(
        `The room itself closes after ${String(ROOM_TTL_SECONDS / 60)} minutes, so a longer day cannot happen.`,
      );
    }
  }

  return problems;
}
