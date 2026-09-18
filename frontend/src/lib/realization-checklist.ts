export const manualChecklistBooleanKeys = new Set([
  "requested_extra_tasks", "helped_colleague", "extra_engagement", "gave_proposal",
  "respected_meetings", "week_positive", "week_problems", "affected_other_plan", "repeated_after_clarification",
])

export const dailyChecklistLabels: Record<string, string> = {
  requested_extra_tasks: "A kërkoi detyra shtesë sot?",
  helped_colleague: "A ndihmoi ndonjë koleg sot?",
  extra_engagement: "A pati angazhim ekstra sot?",
  gave_proposal: "A dha propozim për përmirësim sot?",
  respected_meetings: "A i respektoi oraret e takimeve sot?",
  week_positive: "A solli diçka pozitive sot?",
  week_problems: "A shkaktoi problem te kolegu ose në punë sot?",
  affected_other_plan: "A ia prishi planin dikujt tjetër sot?",
  repeated_after_clarification: "A pati përsëritje të problemit pas sqarimit sot?",
}

export const checklistAnswerOptions: Record<string, { value: string; label: string }[]> = {
  requested_extra_tasks: [{ value: "YES", label: "Po" }, { value: "NO", label: "Jo" }],
  helped_colleague: [{ value: "YES", label: "Po" }, { value: "NO", label: "Jo" }],
  extra_engagement: [{ value: "YES", label: "Po" }, { value: "NO", label: "Jo" }],
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
