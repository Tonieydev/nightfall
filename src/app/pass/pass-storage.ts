// Relative, not '@/game-core': this file is imported by a plain vitest run.
import { HISTORY_ROUNDS } from '../../game-core/index.js';
import type { DealHistory } from '../../game-core/index.js';

// Keyed on seat labels. A separate key from the earlier name-based history, so
// old names are never mistaken for seats.
const HISTORY_KEY = 'nightfall.pass.seats';

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
