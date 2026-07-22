import type { Task } from "@/lib/types"

type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>

export async function loadGaNoteTaskAssigneeIds(
  apiFetch: ApiFetch,
  gaNoteOriginId: string
): Promise<string[]> {
  const res = await apiFetch("/tasks/by-ga-notes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ga_note_origin_ids: [gaNoteOriginId],
      include_done: true,
      include_all_done: true,
    }),
  })
  if (!res.ok) {
    throw new Error("Failed to load GA task assignees")
  }

  const tasks = (await res.json()) as Task[]
  const ids = new Set<string>()
  for (const task of tasks) {
    // The endpoint returns active rows only; TaskOut intentionally does not expose is_active.
    if (task.ga_note_origin_id !== gaNoteOriginId) continue
    if (task.assigned_to) {
      ids.add(task.assigned_to)
      continue
    }
    for (const assignee of task.assignees || []) {
      if (assignee.id) ids.add(assignee.id)
    }
  }
  return Array.from(ids)
}

export async function replaceGaNoteTaskAssignees(
  apiFetch: ApiFetch,
  gaNoteOriginId: string,
  assigneeIds: string[]
): Promise<Response> {
  return apiFetch(`/ga-notes/${gaNoteOriginId}/task-bundle`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assignee_ids: Array.from(new Set(assigneeIds)) }),
  })
}
