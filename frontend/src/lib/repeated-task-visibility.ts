export type RepeatedTaskCandidate = {
  taskId?: string | null
  task_id?: string | null
}

export const getRepeatedTaskId = (entry: RepeatedTaskCandidate | null | undefined) =>
  (entry?.taskId || entry?.task_id || "").trim()

export const buildRepeatedTaskFirstDateMap = <T extends RepeatedTaskCandidate>(
  orderedDates: string[],
  entriesForDate: (dateIso: string) => readonly T[]
) => {
  const firstDateByTaskId = new Map<string, string>()

  for (const dateIso of orderedDates) {
    for (const entry of entriesForDate(dateIso)) {
      const taskId = getRepeatedTaskId(entry)
      if (taskId && !firstDateByTaskId.has(taskId)) {
        firstDateByTaskId.set(taskId, dateIso)
      }
    }
  }

  return firstDateByTaskId
}

export const isRepeatedTaskInstance = (
  entry: RepeatedTaskCandidate | null | undefined,
  dateIso: string,
  firstDateByTaskId: Map<string, string>
) => {
  const taskId = getRepeatedTaskId(entry)
  const firstDate = taskId ? firstDateByTaskId.get(taskId) : undefined
  return Boolean(firstDate && firstDate < dateIso)
}
