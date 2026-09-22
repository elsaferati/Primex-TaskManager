export type WeeklyPlannerOrderedUser = {
  user_id: string
  user_name: string
}

export type WeeklyPlannerSortOrder = Record<string, number | null | undefined>

export function compareWeeklyPlannerUsers(
  a: WeeklyPlannerOrderedUser,
  b: WeeklyPlannerOrderedUser,
  orderByUserId: WeeklyPlannerSortOrder,
) {
  const aOrder = orderByUserId[a.user_id]
  const bOrder = orderByUserId[b.user_id]
  const aHasOrder = aOrder != null
  const bHasOrder = bOrder != null

  if (aHasOrder !== bHasOrder) return aHasOrder ? -1 : 1
  if (aHasOrder && bHasOrder && aOrder !== bOrder) return aOrder - bOrder
  return a.user_name.localeCompare(b.user_name)
}
