import { randomInt } from 'node:crypto';

/**
 * The game's only source of randomness. `assignRoles` takes an injected rng so
 * a finished game can be replayed from the seed stored on its room document —
 * which is the whole reason Math.random never appears in the game path.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh seed for a new game. Minted once, then persisted and never re-rolled. */
export function newSeed(): number {
  return randomInt(0, 0x100000000);
}
