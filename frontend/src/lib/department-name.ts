import type { Department } from "@/lib/types"

export function formatDepartmentName(name?: string | null) {
  if (!name) return ""
  return name === "Project Content Manager" ? "Product Content" : name
}

/** Compact lowercase tags for dense tables (e.g. dev, pcm, gds). */
export function departmentTableTag(department: Department | null | undefined): string {
  if (!department) return "—"
  const name = (department.name || "").toLowerCase()
  const code = (department.code || "").trim().toLowerCase()

  if (code === "dev" || name.includes("development") || name.includes("zhvillim")) return "dev"
  if (name.includes("graphic") && name.includes("design")) return "gds"
  if (
    name.includes("project content") ||
    (name.includes("product") && name.includes("content"))
  ) {
    return "pcm"
  }

  if (code && code.length <= 4 && /^[a-z0-9]+$/i.test(code)) return code.toLowerCase()
  return (department.name || "?").slice(0, 3).toLowerCase()
}

/** Department abbreviations used in Realization's DEP column. */
export function realizationDepartmentTag(department: { name?: string | null; code?: string | null } | null | undefined): string {
  if (!department) return "—"
  const name = (department.name || "").toLowerCase()
  const code = (department.code || "").trim().toUpperCase()
  if (code === "DEV" || name.includes("development") || name.includes("zhvillim")) return "DEV"
  if (["GD", "GDS"].includes(code) || (name.includes("graphic") && name.includes("design"))) return "GD"
  if (code === "PCM" || name.includes("project content") || (name.includes("product") && name.includes("content"))) return "PCM"
  return code || (department.name || "—").slice(0, 3).toUpperCase()
}

export function compareRealizationDepartments(
  first: Parameters<typeof realizationDepartmentTag>[0],
  second: Parameters<typeof realizationDepartmentTag>[0]
) {
  const firstTag = realizationDepartmentTag(first)
  const secondTag = realizationDepartmentTag(second)
  const order: Record<string, number> = { DEV: 0, GD: 1, PCM: 2 }
  return (order[firstTag] ?? 3) - (order[secondTag] ?? 3) || firstTag.localeCompare(secondTag)
}
