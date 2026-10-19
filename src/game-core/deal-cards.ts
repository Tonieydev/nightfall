import { MIN_PLAYERS } from './assign-roles.js';
import type { Role } from './types.js';

export interface DealConfig {
  mafia: number;
  doctors: number;
}

export interface DealtCard {
  name: string;
  role: Role;
}

/** Past rounds, oldest first; each entry is the names that were mafia that round. */
export type DealHistory = string[][];

export const HISTORY_ROUNDS = 3;

// Each recent round as mafia cuts a person's weight to a fifth. Low, not zero:
// a hard zero would tell last round's mafia they are safe this round.
const REPEAT_PENALTY = 0.2;

const normalise = (name: string): string => name.trim().toLowerCase();

function weightOf(name: string, history: DealHistory): number {
  const key = normalise(name);
  const recent = history.slice(-HISTORY_ROUNDS);
  const served = recent.filter((round) => round.some((n) => normalise(n) === key)).length;
  return REPEAT_PENALTY ** served;
}

/**
 * Weighted draw without replacement (Efraimidis–Spirakis): each candidate gets
 * the key `u ** (1 / weight)` and the largest keys win. Low weight, small key.
 */
function drawWeighted<T>(
  items: T[],
  weightFor: (item: T) => number,
  count: number,
  rng: () => number,
): T[] {
  return items
    .map((item) => ({ item, key: rng() ** (1 / weightFor(item)) }))
    .sort((a, b) => b.key - a.key)
    .slice(0, count)
    .map(({ item }) => item);
}

/** Deals for a table sharing one phone. Pure: randomness is injected. */
export function dealCards(
  names: string[],
  config: DealConfig,
  history: DealHistory,
  rng: () => number,
): DealtCard[] {
  if (names.length < MIN_PLAYERS) {
    throw new Error(`a round needs at least ${MIN_PLAYERS} players, got ${names.length}`);
  }
  if (names.some((name) => name.trim() === '')) throw new Error('a player name is blank');
  if (new Set(names.map(normalise)).size !== names.length) {
    throw new Error('duplicate player names');
  }
  if (config.mafia < 1) throw new Error('a round needs at least 1 Mafia');
  if (config.mafia >= names.length - config.mafia) {
    throw new Error(
      `${config.mafia} Mafia in ${names.length} players starts at or above parity with Town`,
    );
  }
  if (config.doctors < 0 || config.doctors > names.length - config.mafia) {
    throw new Error(`${config.doctors} doctors do not fit beside ${config.mafia} Mafia`);
  }

  const mafia = new Set(
    drawWeighted(names, (name) => weightOf(name, history), config.mafia, rng),
  );
  const rest = names.filter((name) => !mafia.has(name));
  const doctors = new Set(drawWeighted(rest, () => 1, config.doctors, rng));

  return names.map((name) => ({
    name,
    role: mafia.has(name) ? 'MAFIA' : doctors.has(name) ? 'DOCTOR' : 'VILLAGER',
  }));
}

/** History after a round: the mafia names appended, trimmed to the window. */
export function recordRound(history: DealHistory, cards: DealtCard[]): DealHistory {
  const mafia = cards.filter((card) => card.role === 'MAFIA').map((card) => card.name);
  return [...history, mafia].slice(-HISTORY_ROUNDS);
}
