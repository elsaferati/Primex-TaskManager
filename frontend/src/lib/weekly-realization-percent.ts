/** Credit (planned done, multi-day shares, extras) capped at 100, then penalty points per plan task deducted. */
export function realizationPercent(credit: number, planWeight: number, extra: number, penaltyPoints: number, penaltyBase: number): number | null {
  const denominator = planWeight || extra
  if (!denominator) return null
  const base = Math.min(100, credit * 100 / denominator)
  const penalty = penaltyBase ? penaltyPoints / penaltyBase : 0
  return Math.round(Math.max(0, base - penalty) * 10) / 10
}

/** Extras earn completion credit; unfinished tasks deduct their penalty points (25 postponed or untouched, more with a deadline). */
export function weeklyRealizationPercent(planned: number, completed: number, extra: number, penaltyPoints: number): number {
  return realizationPercent(completed, planned, extra, penaltyPoints, planned || extra) ?? 0
}
