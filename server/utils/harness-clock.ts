/**
 * The suite's one clock (iam-integration's architecture §7). In test mode,
 * the harness supplies every member the same clock, which a test probe may
 * move forward so that safety periods, delays, grace periods and holds pass;
 * it never moves back. Outside test mode no clock is composed and every
 * member uses the system clock, as a production host does until the
 * proposed clock-service exists.
 */
let offsetMs = 0

export const harnessClock = { now: (): Date => new Date(Date.now() + offsetMs) }

/** Moves the clock forward by `ms` (test mode only). */
export function advanceHarnessClock(ms: number): Date {
  if (process.env.HARNESS_TEST_MODE !== '1') throw new Error('The harness clock moves only in test mode.')
  if (!Number.isFinite(ms) || ms < 0) throw new RangeError('The harness clock only moves forward.')
  offsetMs += ms
  return harnessClock.now()
}
