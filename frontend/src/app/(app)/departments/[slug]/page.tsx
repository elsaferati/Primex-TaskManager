"use client"

import type { ComponentType } from "react"
import dynamic from "next/dynamic"
import { useParams } from "next/navigation"

const loadingFallback = () => (
  <div className="flex h-screen items-center justify-center text-sm text-slate-500 animate-pulse">
    Loading department...
  </div>
)

const DevelopmentKanban = dynamic(() => import("../development/department-kanban"), { loading: loadingFallback })
const GraphicDesignKanban = dynamic(() => import("../graphic-design/department-kanban"), { loading: loadingFallback })
const ProjectContentManagerKanban = dynamic(() => import("../project-content-manager/department-kanban"), {
  loading: loadingFallback,
})
const HumanResourceKanban = dynamic(() => import("../human-resource/department-kanban"), { loading: loadingFallback })
const FinanceKanban = dynamic(() => import("../finance/department-kanban"), { loading: loadingFallback })

const componentMap: Record<string, ComponentType> = {
  development: DevelopmentKanban,
  "graphic-design": GraphicDesignKanban,
  pcm: ProjectContentManagerKanban,
  "project-content-manager": ProjectContentManagerKanban,
  "human-resource": HumanResourceKanban,
  finance: FinanceKanban,
}

export default function DepartmentPage() {
  const params = useParams<{ slug: string }>()
  const Component = componentMap[String(params.slug)]
  return Component ? <Component /> : <div>Department not found.</div>
}


