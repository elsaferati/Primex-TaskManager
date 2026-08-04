type ApiPrefetch = (path: string, init?: RequestInit) => Promise<Response>

type DepartmentPrefetchConfig = {
  names: string[]
  codes: string[]
  usersPath: "/users" | "/users/lookup"
  paths: (departmentId: string, dateKey: string) => string[]
}

const configs: Record<string, DepartmentPrefetchConfig> = {
  "/departments/development": {
    names: ["development"],
    codes: ["dev"],
    usersPath: "/users/lookup",
    paths: (departmentId, dateKey) => [
      `/projects?department_id=${departmentId}`,
      `/system-tasks?department_id=${departmentId}&occurrence_date=${dateKey}&include_overdue=true`,
      `/system-tasks?department_id=${departmentId}`,
      `/tasks?include_done=true&department_id=${departmentId}`,
      `/internal-notes?department_id=${departmentId}`,
      `/meetings?department_id=${departmentId}`,
    ],
  },
  "/departments/project-content-manager": {
    names: ["project content manager"],
    codes: ["pcm"],
    usersPath: "/users/lookup",
    paths: (departmentId, dateKey) => [
      `/projects?department_id=${departmentId}`,
      `/system-tasks?department_id=${departmentId}&occurrence_date=${dateKey}&include_overdue=true`,
      `/system-tasks?department_id=${departmentId}`,
      `/tasks?include_done=true&department_id=${departmentId}`,
      `/internal-notes?department_id=${departmentId}`,
      `/meetings?department_id=${departmentId}`,
    ],
  },
  "/departments/graphic-design": {
    names: ["graphic design"],
    codes: ["gd"],
    usersPath: "/users/lookup",
    paths: (departmentId, dateKey) => [
      `/projects?department_id=${departmentId}&include_templates=true`,
      `/system-tasks?department_id=${departmentId}&occurrence_date=${dateKey}&include_overdue=true`,
      `/system-tasks?department_id=${departmentId}`,
      `/tasks?include_done=true&department_id=${departmentId}`,
      `/internal-notes?department_id=${departmentId}`,
      `/meetings?department_id=${departmentId}`,
    ],
  },
  "/departments/finance": {
    names: ["finance"],
    codes: ["fin"],
    usersPath: "/users",
    paths: (departmentId) => [
      `/tasks?department_id=${encodeURIComponent(departmentId)}&include_done=true&include_all_done=true`,
      `/system-tasks?department_id=${encodeURIComponent(departmentId)}`,
    ],
  },
}

const inFlight = new Map<string, Promise<void>>()

function currentDateKey() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function prefetchDepartmentData(
  href: string,
  userId: string,
  prefetchApiFetch: ApiPrefetch
) {
  const config = configs[href]
  if (!config) return
  const prefetchKey = `${userId}|${href}`
  if (inFlight.has(prefetchKey)) return

  const request = (async () => {
    const [departmentsRes] = await Promise.all([
      prefetchApiFetch("/departments"),
      prefetchApiFetch(config.usersPath),
    ])
    if (!departmentsRes.ok) return
    const departments = (await departmentsRes.json()) as Array<{
      id: string
      name: string
      code?: string | null
    }>
    const department = departments.find((entry) => {
      const name = entry.name.trim().toLowerCase()
      const code = (entry.code || "").trim().toLowerCase()
      return config.names.includes(name) || config.codes.includes(code)
    })
    if (!department) return
    await Promise.all(
      config.paths(department.id, currentDateKey()).map((path) => prefetchApiFetch(path))
    )
  })().catch(() => {
    // Prefetching is opportunistic; normal page loading remains the fallback.
  })

  inFlight.set(prefetchKey, request)
  void request.finally(() => {
    if (inFlight.get(prefetchKey) === request) inFlight.delete(prefetchKey)
  })
}
