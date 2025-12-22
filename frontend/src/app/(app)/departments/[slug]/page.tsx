"use client"

import { useParams } from "next/navigation"

import { DepartmentKanban } from "@/components/department-kanban"

const map: Record<string, string> = {
  development: "Development",
  pcm: "Project Content Manager",
  "graphic-design": "Graphic Design",
}

export default function DepartmentPage() {
  const params = useParams<{ slug: string }>()
  const name = map[String(params.slug)] || "Department"
  return <DepartmentKanban departmentName={name} />
}


