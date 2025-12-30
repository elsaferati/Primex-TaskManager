export function normalizeDueDateInput(value: string): string {
  if (!value) return ""
  const base = new Date(`${value}T00:00:00`)
  if (Number.isNaN(base.getTime())) return value

  const adjusted = new Date(base)
  const weekday = adjusted.getDay()
  if (weekday === 6) {
    adjusted.setDate(adjusted.getDate() - 1)
  } else if (weekday === 0) {
    adjusted.setDate(adjusted.getDate() - 2)
  }

  const local = new Date(adjusted.getTime() - adjusted.getTimezoneOffset() * 60 * 1000)
  return local.toISOString().slice(0, 10)
}
