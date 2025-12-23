"use client"

import { useParams } from "next/navigation"

import { DepartmentKanban } from "@/components/department-kanban"

const map: Record<string, string> = {
  pcm: "Project Content Manager",
}

export default function DepartmentPage() {
  const params = useParams<{ slug: string }>()
  const name = map[String(params.slug)] || "Department"
  return <DepartmentKanban departmentName={name} />
}


