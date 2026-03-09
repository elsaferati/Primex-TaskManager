import type { SystemTaskTemplate } from "@/lib/types"

export function isGeneratedSystemTaskRow(task: Pick<SystemTaskTemplate, "id" | "template_id">): boolean {
  return Boolean(task.template_id) && task.id !== task.template_id
}

export function filterGeneratedSystemTaskRows<T extends Pick<SystemTaskTemplate, "id" | "template_id">>(
  tasks: T[]
): T[] {
  return tasks.filter(isGeneratedSystemTaskRow)
}
