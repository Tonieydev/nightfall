import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PhaseTimers } from './phase-timers.js';

const NOW = 1_700_000_000_000;

describe('PhaseTimers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires when the deadline arrives', () => {
    const timers = new PhaseTimers();
    const onExpiry = vi.fn();
    timers.schedule('ABC234', NOW + 45_000, NOW, onExpiry);

    vi.advanceTimersByTime(44_999);
    expect(onExpiry).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onExpiry).toHaveBeenCalledTimes(1);
  });

  it('fires immediately for a deadline already in the past', () => {
    const timers = new PhaseTimers();
    const onExpiry = vi.fn();

    timers.schedule('ABC234', NOW - 5_000, NOW, onExpiry);
    vi.advanceTimersByTime(0);

    expect(onExpiry).toHaveBeenCalledTimes(1);
  });

  it('keeps one timer per room, replacing the old one', () => {
    const timers = new PhaseTimers();
    const stale = vi.fn();
    const fresh = vi.fn();

    timers.schedule('ABC234', NOW + 10_000, NOW, stale);
    timers.schedule('ABC234', NOW + 20_000, NOW, fresh);
    vi.advanceTimersByTime(30_000);

    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledTimes(1);
    expect(timers.size).toBe(0);
  });

  it('keeps rooms independent', () => {
    const timers = new PhaseTimers();
    const a = vi.fn();
    const b = vi.fn();

    timers.schedule('AAA222', NOW + 10_000, NOW, a);
    timers.schedule('BBB333', NOW + 20_000, NOW, b);
    vi.advanceTimersByTime(10_000);

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });

  it('does not fire once cleared', () => {
    const timers = new PhaseTimers();
    const onExpiry = vi.fn();

    timers.schedule('ABC234', NOW + 10_000, NOW, onExpiry);
    timers.clear('ABC234');
    vi.advanceTimersByTime(60_000);

    expect(onExpiry).not.toHaveBeenCalled();
    expect(timers.size).toBe(0);
  });

  it('clearAll drops every room', () => {
    const timers = new PhaseTimers();
    const onExpiry = vi.fn();
    timers.schedule('AAA222', NOW + 1_000, NOW, onExpiry);
    timers.schedule('BBB333', NOW + 1_000, NOW, onExpiry);

    timers.clearAll();
    vi.advanceTimersByTime(60_000);

    expect(onExpiry).not.toHaveBeenCalled();
    expect(timers.size).toBe(0);
  });
});
