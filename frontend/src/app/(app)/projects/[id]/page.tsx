"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useAuth } from "@/lib/auth"
import type { Board, Project, Task, TaskStatus } from "@/lib/types"

export default function ProjectPage() {
  const params = useParams<{ id: string }>()
  const projectId = String(params.id)
  const { apiFetch } = useAuth()

  const [project, setProject] = React.useState<Project | null>(null)
  const [statuses, setStatuses] = React.useState<TaskStatus[]>([])
  const [tasks, setTasks] = React.useState<Task[]>([])

  React.useEffect(() => {
    const load = async () => {
      const pRes = await apiFetch(`/projects/${projectId}`)
      if (!pRes.ok) return
      const p = (await pRes.json()) as Project
      setProject(p)

      const bRes = await apiFetch(`/boards/${p.board_id}`)
      if (bRes.ok) {
        const b = (await bRes.json()) as Board
        const sRes = await apiFetch(`/task-statuses?department_id=${b.department_id}`)
        if (sRes.ok) setStatuses((await sRes.json()) as TaskStatus[])
      }

      const tRes = await apiFetch(`/tasks?project_id=${p.id}&include_done=false`)
      if (tRes.ok) setTasks((await tRes.json()) as Task[])
    }
    void load()
  }, [apiFetch, projectId])

  if (!project) return <div className="text-sm text-muted-foreground">Loading...</div>

  const nameByStatus = new Map(statuses.map((s) => [s.id, s.name]))

  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold">{project.name}</div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Open tasks</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {tasks.length ? (
            tasks
              .sort((a, b) => a.position - b.position)
              .map((t) => (
                <Link key={t.id} href={`/tasks/${t.id}`} className="flex justify-between gap-2 text-sm hover:underline">
                  <span className="truncate">{t.title}</span>
                  <span className="text-muted-foreground">{nameByStatus.get(t.status_id) || ""}</span>
                </Link>
              ))
          ) : (
            <div className="text-sm text-muted-foreground">No tasks.</div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
