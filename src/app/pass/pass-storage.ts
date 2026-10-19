// Relative, not '@/game-core': this file is imported by a plain vitest run.
import { HISTORY_ROUNDS } from '../../game-core/index.js';
import type { DealHistory } from '../../game-core/index.js';

const HISTORY_KEY = 'nightfall.pass.history';
const NAMES_KEY = 'nightfall.pass.names';

function parseJson(raw: unknown): unknown {
  if (typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/** Anything that is not a list of lists of names is treated as no history. */
export function parseHistory(raw: unknown): DealHistory {
  const parsed = parseJson(raw);
  if (!Array.isArray(parsed) || !parsed.every(isStringList)) return [];
  return (parsed as string[][]).slice(-HISTORY_ROUNDS);
}

export function parseNames(raw: unknown): string[] {
  const parsed = parseJson(raw);
  return isStringList(parsed) ? parsed : [];
}

// Storage can be absent or throw (private windows, blocked site data); the
// game works without it and simply forgets who was mafia.
function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Nothing to do: see above.
  }
}

export const readHistory = (): DealHistory => parseHistory(read(HISTORY_KEY));
export const writeHistory = (history: DealHistory): void => write(HISTORY_KEY, history);
export const readNames = (): string[] => parseNames(read(NAMES_KEY));
export const writeNames = (names: string[]): void => write(NAMES_KEY, names);
