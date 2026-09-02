import type { SkillCategory, SkillRating } from "@/lib/types"

export const SKILL_CATEGORIES: ReadonlyArray<{
  id: SkillCategory
  label: string
  shortDescription: string
  description: string
}> = [
  { id: "analysis", label: "Analysis", shortDescription: "Requirements, structure and process improvement", description: "Analysing requirements, understanding needs, breaking projects into concrete steps, creating work structures, and improving processes." },
  { id: "research", label: "Research & New Ideas", shortDescription: "Research, experimentation and inspiration", description: "Researching markets, competitors, technologies and methodologies, experimenting with approaches, and developing ideas for new projects." },
  { id: "problem_solving", label: "Problem Solving", shortDescription: "Root causes, debugging and practical solutions", description: "Finding root causes, debugging, critical thinking, fixing ineffective processes, and making decisions in ambiguous situations." },
  { id: "creativity", label: "Creation & Creativity", shortDescription: "Concepts, content and better ways of working", description: "Creating ideas, structures, templates, content and materials, improving user experience, and finding better presentation approaches." },
  { id: "standards", label: "Standards & Templates", shortDescription: "Procedures, documentation and consistency", description: "Creating procedures, reusable templates, team guidelines and standard working methods that support consistent quality." },
  { id: "qa", label: "QA / Quality Control", shortDescription: "Testing, details and improvement feedback", description: "Checking requirements, testing results, finding errors or missing details, and assuring quality before delivery." },
  { id: "management", label: "Management, Organisation & Planning", shortDescription: "Priorities, capacity, coordination and progress", description: "Planning and allocating work, coordinating people, tracking progress, resolving blockers, adjusting plans, and maintaining project structure." },
  { id: "communication", label: "Communication & Presentation", shortDescription: "Clear explanations, meetings and feedback", description: "Presenting internally or externally, explaining solutions, preparing materials, managing discussions, and handling feedback." },
  { id: "fast_tasks", label: "Fast Tasks", shortDescription: "Quick reactions and short-deadline work", description: "Handling urgent requests, practical short tasks, team support, rapid changes, and short deadlines." },
] as const

export const RATING_OPTIONS: ReadonlyArray<{ value: SkillRating; label: string; explanation: string }> = [
  { value: "A_PLUS", label: "A+", explanation: "Favourite / strongest area" },
  { value: "A", label: "A", explanation: "Enjoy and perform well" },
  { value: "B", label: "B", explanation: "Can do when needed" },
  { value: "C", label: "C", explanation: "Lower preference" },
] as const

export const RATING_LABEL: Record<SkillRating, string> = { A_PLUS: "A+", A: "A", B: "B", C: "C" }
export const RATING_SCORE: Record<SkillRating, number> = { A_PLUS: 4, A: 3, B: 2, C: 1 }

export const SKILL_QUESTIONS = [
  { id: "above_average", label: "Which types of tasks do you think you perform better than average?", shortLabel: "Better than average" },
  { id: "experience", label: "In which areas do you think you have the most experience?", shortLabel: "Experience" },
  { id: "development", label: "In which areas would you like to develop further?", shortLabel: "Development goals" },
  { id: "ideal_projects", label: "For which types of projects do you think you would be the ideal choice?", shortLabel: "Ideal projects" },
  { id: "motivation", label: "Which tasks give you the most motivation and energy during work?", shortLabel: "Motivation" },
] as const
