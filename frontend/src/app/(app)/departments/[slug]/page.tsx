"use client"

import type { ComponentType } from "react"
import { useParams } from "next/navigation"

import DevelopmentKanban from "../development/department-kanban"
import GraphicDesignKanban from "../graphic-design/department-kanban"
import ProjectContentManagerKanban from "../project-content-manager/department-kanban"

const componentMap: Record<string, ComponentType> = {
  development: DevelopmentKanban,
  "graphic-design": GraphicDesignKanban,
  pcm: ProjectContentManagerKanban,
  "project-content-manager": ProjectContentManagerKanban,
}

export default function DepartmentPage() {
  const params = useParams<{ slug: string }>()
  const Component = componentMap[String(params.slug)]
  return Component ? <Component /> : <div>Department not found.</div>
}


