type ProjectIdentity = {
  title?: string | null
  name?: string | null
  display_title?: string | null
  project_type?: string | null
}

const TT_TITLE_PREFIXES = ["TT ", "TT-", "TT:"] as const

export function normalizeProjectTitle(title?: string | null): string {
  return (title || "").trim().toUpperCase()
}

export function isTtProjectTitle(title?: string | null): boolean {
  const normalized = normalizeProjectTitle(title)
  return normalized === "TT" || TT_TITLE_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

export function hasMstProjectIdentity(project?: ProjectIdentity | null, titleOverride?: string | null): boolean {
  if (!project) return false
  const title = normalizeProjectTitle(
    titleOverride ?? project.display_title ?? project.title ?? project.name,
  )
  return normalizeProjectTitle(project.project_type) === "MST" || title.includes("MST")
}

export function isMstOrTtProject(project?: ProjectIdentity | null, titleOverride?: string | null): boolean {
  if (!project) return false
  const title = titleOverride ?? project.display_title ?? project.title ?? project.name
  return hasMstProjectIdentity(project, title) || isTtProjectTitle(title)
}

export function isVsOrVlProjectTitle(title?: string | null): boolean {
  const normalized = normalizeProjectTitle(title)
  return normalized.includes("VS") || normalized.includes("VL")
}
