export function formatDepartmentName(name?: string | null) {
  if (!name) return ""
  return name === "Project Content Manager" ? "Product Content" : name
}
