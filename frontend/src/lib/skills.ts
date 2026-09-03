import type { SkillCategory, SkillRating } from "@/lib/types"

export const SKILL_CATEGORIES: ReadonlyArray<{
  id: SkillCategory
  label: string
  shortDescription: string
  description: string
}> = [
  { id: "analysis", label: "Analizë", shortDescription: "Kërkesa, strukturë dhe përmirësim procesesh", description: "Analizimi i kërkesave, kuptimi i nevojave, ndarja e projekteve në hapa konkretë, krijimi i strukturave të punës dhe përmirësimi i proceseve." },
  { id: "research", label: "Hulumtim dhe Ide të Reja", shortDescription: "Hulumtim, eksperimentim dhe frymëzim", description: "Hulumtimi i tregut, konkurrentëve, teknologjive dhe metodologjive, eksperimentimi me qasje të ndryshme dhe zhvillimi i ideve për projekte të reja." },
  { id: "problem_solving", label: "Zgjidhje Problemesh", shortDescription: "Shkaqe rrënjësore, korrigjim dhe zgjidhje praktike", description: "Gjetja e shkaqeve rrënjësore, korrigjimi i gabimeve, mendimi kritik, përmirësimi i proceseve joefektive dhe vendimmarrja në situata të paqarta." },
  { id: "creativity", label: "Krijim dhe Kreativitet", shortDescription: "Koncepte, përmbajtje dhe mënyra më të mira pune", description: "Krijimi i ideve, strukturave, shablloneve, përmbajtjeve dhe materialeve, përmirësimi i përvojës së përdoruesit dhe mënyrave të prezantimit." },
  { id: "standards", label: "Standarde dhe Shabllone", shortDescription: "Procedura, dokumentim dhe qëndrueshmëri", description: "Krijimi i procedurave, shablloneve të ripërdorshme, udhëzimeve të ekipit dhe metodave standarde që sigurojnë cilësi të njëtrajtshme." },
  { id: "qa", label: "QA / Kontroll Cilësie", shortDescription: "Testim, hollësi dhe sugjerime për përmirësim", description: "Kontrollimi i kërkesave, testimi i rezultateve, gjetja e gabimeve ose hollësive që mungojnë dhe sigurimi i cilësisë para dorëzimit." },
  { id: "management", label: "Menaxhim, Organizim dhe Planifikim", shortDescription: "Prioritete, kapacitet, koordinim dhe progres", description: "Planifikimi dhe ndarja e punës, koordinimi i njerëzve, ndjekja e progresit, zgjidhja e pengesave, përshtatja e planeve dhe ruajtja e strukturës së projektit." },
  { id: "communication", label: "Komunikim dhe Prezantim", shortDescription: "Shpjegime të qarta, takime dhe reagime", description: "Prezantimi brenda ose jashtë kompanisë, shpjegimi i zgjidhjeve, përgatitja e materialeve, drejtimi i diskutimeve dhe menaxhimi i reagimeve." },
  { id: "fast_tasks", label: "Detyra të Shpejta", shortDescription: "Reagim i shpejtë dhe afate të shkurtra", description: "Trajtimi i kërkesave urgjente, detyrave të shkurtra praktike, ndihma ndaj ekipit, përshtatja e shpejtë dhe puna me afate të shkurtra." },
] as const

export const RATING_OPTIONS: ReadonlyArray<{ value: SkillRating; label: string; explanation: string }> = [
  { value: "A_PLUS", label: "A+", explanation: "E preferuara / fusha më e fortë" },
  { value: "A", label: "A", explanation: "Më pëlqen dhe e bëj mirë" },
  { value: "B", label: "B", explanation: "Mund ta bëj kur nevojitet" },
  { value: "C", label: "C", explanation: "Preferencë më e ulët" },
] as const

export const RATING_LABEL: Record<SkillRating, string> = { A_PLUS: "A+", A: "A", B: "B", C: "C" }
export const RATING_SCORE: Record<SkillRating, number> = { A_PLUS: 4, A: 3, B: 2, C: 1 }

export const SKILL_QUESTIONS = [
  { id: "above_average", label: "Cilat lloje detyrash mendoni se i kryeni më mirë se mesatarja?", shortLabel: "Më mirë se mesatarja" },
  { id: "experience", label: "Në cilat fusha mendoni se keni më shumë përvojë?", shortLabel: "Përvoja" },
  { id: "development", label: "Në cilat fusha dëshironi të zhvilloheni më tej?", shortLabel: "Synimet e zhvillimit" },
  { id: "ideal_projects", label: "Për cilat lloje projektesh mendoni se do të ishit zgjedhja ideale?", shortLabel: "Projektet ideale" },
  { id: "motivation", label: "Cilat detyra ju japin më shumë motivim dhe energji gjatë punës?", shortLabel: "Motivimi" },
] as const
