/** Extras earn completion credit; unfinished postponed plan tasks deduct up to 25 points. */
export function weeklyRealizationPercent(planned: number, completed: number, extra: number, postponed: number): number {
  const denominator = planned || extra
  const base = denominator ? Math.min(100, completed * 100 / denominator) : 0
  const penalty = planned ? postponed * 25 / planned : 0
  return Math.round(Math.max(0, base - penalty) * 10) / 10
}
