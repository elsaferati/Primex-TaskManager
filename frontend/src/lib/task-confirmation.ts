import type { UserLookup } from "@/lib/types"

export const WAITING_CONFIRMATION_STATUS = "WAITING_CONFIRMATION"

type ConfirmerUser = Pick<UserLookup, "id" | "role" | "full_name" | "username">

export function isWaitingConfirmation(status?: string | null): boolean {
  return (status || "").toUpperCase() === WAITING_CONFIRMATION_STATUS
}

export function getConfirmerCandidates<T extends ConfirmerUser>(users: T[]): T[] {
  return users.filter((u) => u.role === "ADMIN" || u.role === "MANAGER")
}

export function validateWaitingConfirmation(
  status?: string | null,
  confirmationAssigneeId?: string | null
): string | null {
  if (!isWaitingConfirmation(status)) return null
  if ((confirmationAssigneeId || "").trim()) return null
  return "Please select a manager/admin confirmer for Waiting Confirmation."
}

export function confirmerLabel(user?: { full_name?: string | null; username?: string | null } | null): string {
  if (!user) return "-"
  return user.full_name || user.username || "-"
}
