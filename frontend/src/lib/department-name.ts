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
