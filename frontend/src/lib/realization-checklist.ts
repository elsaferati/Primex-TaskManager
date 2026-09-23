export const manualChecklistBooleanKeys = new Set([
  "approved_postponement",
  "requested_extra_tasks", "helped_colleague", "gave_proposal",
  "respected_meetings", "week_positive", "week_problems", "affected_other_plan", "repeated_after_clarification",
])

// One answer per question per week; the manager may record it on any day.
export const weeklyChecklistLabels: Record<string, string> = {
  approved_postponement: "A ka ndryshuar prioriteti ose ka shtyrje me konfirmim?",
  requested_extra_tasks: "A kërkoi detyra shtesë këtë javë?",
  helped_colleague: "A ndihmoi ndonjë koleg këtë javë?",
  gave_proposal: "A dha propozim për përmirësim këtë javë?",
  respected_meetings: "A i respektoi oraret e takimeve këtë javë?",
  week_positive: "A solli diçka pozitive këtë javë?",
  week_problems: "A shkaktoi problem te kolegu ose në punë këtë javë?",
  affected_other_plan: "A ia prishi planin dikujt tjetër këtë javë?",
  repeated_after_clarification: "A pati përsëritje të problemit pas sqarimit këtë javë?",
}

export const checklistAnswerOptions: Record<string, { value: string; label: string }[]> = {
  approved_postponement: [{ value: "YES", label: "Po" }, { value: "NO", label: "Jo" }],
  requested_extra_tasks: [{ value: "YES", label: "Po" }, { value: "NO", label: "Jo" }],
  helped_colleague: [{ value: "YES", label: "Po" }, { value: "NO", label: "Jo" }],
  gave_proposal: [{ value: "YES", label: "Po" }, { value: "NO", label: "Jo" }],
  respected_meetings: [{ value: "YES", label: "Po" }, { value: "NO", label: "Jo" }],
  affected_other_plan: [{ value: "YES", label: "Po" }, { value: "NO", label: "Jo" }],
  repeated_after_clarification: [{ value: "YES", label: "Po" }, { value: "NO", label: "Jo" }],
  week_positive: [{ value: "YES", label: "Po" }, { value: "NO", label: "Jo" }],
  week_problems: [{ value: "YES", label: "Po" }, { value: "NO", label: "Jo" }],
}

export function checklistOptions(key: string, currentValue = "") {
  const choices = [...(checklistAnswerOptions[key] || [])]
  if (currentValue && !choices.some(choice => choice.value === currentValue)) choices.push({ value: currentValue, label: currentValue })
  return choices
}

export function checklistAnswerLabel(key: string, value: unknown) {
  if (manualChecklistBooleanKeys.has(key)) {
    if (value !== true && value !== false) return "E paplotësuar"
    return checklistOptions(key).find(option => option.value === (value ? "YES" : "NO"))?.label || "E paplotësuar"
  }
  return typeof value === "string" ? value : "—"
}
