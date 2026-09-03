/**
 * Injectable time.
 *
 * detailed-design.md: "Nothing calls `new Date()` inline. Without this,
 * TS-01-09 — the exact seven-day boundary, the definition of the primary
 * metric — cannot be written, and the metric ships untested."
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** A clock frozen at a chosen instant, for tests that assert window boundaries. */
export function fixedClock(at: Date): Clock {
  return { now: () => new Date(at.getTime()) };
}

let current: Clock = systemClock;

export function getClock(): Clock {
  return current;
}

/** Test seam only. Never called from request handling. */
export function setClock(clock: Clock): void {
  current = clock;
}
