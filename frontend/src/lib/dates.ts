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

function toLocalDate(value?: string | Date | null): Date | null {
  if (!value) return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === "string") {
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (isoMatch) {
      const year = Number(isoMatch[1])
      const month = Number(isoMatch[2])
      const day = Number(isoMatch[3])
      const date = new Date(year, month - 1, day)
      return Number.isNaN(date.getTime()) ? null : date
    }
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const DMY_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

const DMY_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

export function formatDateDMY(value?: string | Date | null, fallback = "-"): string {
  const date = toLocalDate(value)
  if (!date) return fallback
  return DMY_FORMATTER.format(date)
}

export function formatDateTimeDMY(value?: string | Date | null, fallback = "-"): string {
  const date = toLocalDate(value)
  if (!date) return fallback
  return DMY_TIME_FORMATTER.format(date)
}
