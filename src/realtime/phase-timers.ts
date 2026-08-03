/**
 * One timer per room, and only ever a fast path: it exists so a night ends on
 * time without waiting for someone to read the room. Correctness lives in the
 * reconciliation that runs on every read — if this never fires, or fires after
 * a reader already resolved the phase, the game is still right.
 */
export class PhaseTimers {
  readonly #timers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Replaces any timer already held for this room. */
  schedule(crewCode: string, phaseEndsAt: number, now: number, onExpiry: () => void): void {
    this.clear(crewCode);

    const delay = Math.max(0, phaseEndsAt - now);
    const timer = setTimeout(() => {
      this.#timers.delete(crewCode);
      onExpiry();
    }, delay);

    // Never hold the process open for a room nobody is waiting on.
    timer.unref?.();
    this.#timers.set(crewCode, timer);
  }

  clear(crewCode: string): void {
    const existing = this.#timers.get(crewCode);
    if (existing !== undefined) {
      clearTimeout(existing);
      this.#timers.delete(crewCode);
    }
  }

  get size(): number {
    return this.#timers.size;
  }

  clearAll(): void {
    for (const timer of this.#timers.values()) clearTimeout(timer);
    this.#timers.clear();
  }
}
