"use client"

import * as React from "react"
import { CheckCircle2, CircleDashed, Save, Sparkles, UserRoundSearch } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth"
import { RATING_LABEL, RATING_OPTIONS, RATING_SCORE, SKILL_CATEGORIES, SKILL_QUESTIONS } from "@/lib/skills"
import type { SkillCategory, SkillRating, TeamSkillsMatrixItem, UserSkillsProfile } from "@/lib/types"
import { cn } from "@/lib/utils"

function RatingBadge({ rating }: { rating?: SkillRating | null }) {
  if (!rating) return <span className="text-muted-foreground">—</span>
  return (
    <Badge
      variant={rating === "A_PLUS" ? "default" : rating === "A" ? "secondary" : "outline"}
      className={cn("min-w-9 justify-center tabular-nums", rating === "C" && "text-muted-foreground")}
    >
      {RATING_LABEL[rating]}
    </Badge>
  )
}

function ProfileForm() {
  const { apiFetch } = useAuth()
  const [profile, setProfile] = React.useState<UserSkillsProfile | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    let active = true
    void apiFetch("/skills/me").then(async (res) => {
      if (active && res.ok) setProfile((await res.json()) as UserSkillsProfile)
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [apiFetch])

  const completed = SKILL_CATEGORIES.filter((category) => profile?.[category.id]).length
  const setField = (field: string, value: string | null) => {
    setProfile((current) => current ? { ...current, [field]: value } : current)
  }
  const save = async () => {
    if (!profile) return
    setSaving(true)
    const body = Object.fromEntries([
      ...SKILL_CATEGORIES.map((item) => [item.id, profile[item.id] || null]),
      ...SKILL_QUESTIONS.map((item) => [item.id, profile[item.id] || null]),
    ])
    const res = await apiFetch("/skills/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      setProfile((await res.json()) as UserSkillsProfile)
      toast.success("Task preferences saved")
    } else toast.error("Could not save your task preferences")
    setSaving(false)
  }

  if (loading) return <div className="py-12 text-center text-sm text-muted-foreground">Loading your profile…</div>
  if (!profile) return <div className="py-12 text-center text-sm text-destructive">Your profile could not be loaded.</div>

  return (
    <div className="space-y-6">
      {!profile.exists ? (
        <Card className="border-dashed shadow-none"><CardContent className="flex items-center gap-3 p-4 text-sm"><CircleDashed className="h-5 w-5 text-muted-foreground" /><span>Your Skills Matrix has not been completed yet. Choose a rating for each category below.</span></CardContent></Card>
      ) : null}
      <Card className="shadow-none">
        <CardContent className="p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">{completed} / 9 categories completed</p>
              <p className="text-sm text-muted-foreground">Written answers are optional, but help managers understand your interests.</p>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted sm:w-48"><div className="h-full bg-primary transition-all" style={{ width: `${(completed / 9) * 100}%` }} /></div>
          </div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {RATING_OPTIONS.map((option) => <div key={option.value} className="rounded-lg border p-3"><span className="font-semibold">{option.label}</span><p className="text-xs text-muted-foreground">{option.explanation}</p></div>)}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {SKILL_CATEGORIES.map((category) => (
          <Card key={category.id} className="shadow-none">
            <CardHeader className="pb-3"><CardTitle className="text-base">{category.label}</CardTitle><p className="text-sm text-muted-foreground">{category.description}</p></CardHeader>
            <CardContent className="grid grid-cols-4 gap-2">
              {RATING_OPTIONS.map((option) => (
                <Button key={option.value} type="button" variant={profile[category.id] === option.value ? "default" : "outline"} onClick={() => setField(category.id, option.value)} aria-pressed={profile[category.id] === option.value}>
                  {option.label}
                </Button>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-none">
        <CardHeader><CardTitle>Tell us more</CardTitle><p className="text-sm text-muted-foreground">Optional self-reflection that improves future work allocation.</p></CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          {SKILL_QUESTIONS.map((question, index) => (
            <div key={question.id} className={cn("space-y-2", index === SKILL_QUESTIONS.length - 1 && "lg:col-span-2")}>
              <Label htmlFor={question.id}>{question.label}</Label>
              <Textarea id={question.id} value={profile[question.id] || ""} onChange={(event) => setField(question.id, event.target.value)} maxLength={5000} rows={4} placeholder="Optional — add context about your preferences and experience" />
            </div>
          ))}
        </CardContent>
      </Card>
      <div className="sticky bottom-4 flex justify-end"><Button size="lg" onClick={() => void save()} disabled={saving}><Save className="h-4 w-4" />{saving ? "Saving…" : "Save preferences"}</Button></div>
    </div>
  )
}

function ProfileDetail({ item, onClose }: { item: TeamSkillsMatrixItem | null; onClose: () => void }) {
  const strengths = item ? SKILL_CATEGORIES.filter((category) => item[category.id] === "A_PLUS" || item[category.id] === "A").sort((a, b) => RATING_SCORE[item[b.id]!] - RATING_SCORE[item[a.id]!]).slice(0, 3) : []
  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {item ? <><DialogHeader><DialogTitle>{item.name}</DialogTitle><DialogDescription>{item.department || "No department"} · Self-reported task preferences</DialogDescription></DialogHeader>
          {!item.exists ? <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">This team member has not started their Skills Matrix profile.</div> : <div className="space-y-6">
            <section><h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Top strengths</h3><div className="flex flex-wrap gap-2">{strengths.length ? strengths.map((category) => <Badge key={category.id} variant="secondary" className="gap-2 px-3 py-1.5">{category.label}<RatingBadge rating={item[category.id]} /></Badge>) : <p className="text-sm text-muted-foreground">No A+ or A preferences selected.</p>}</div></section>
            <section><h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">All preferences</h3><div className="grid gap-2 sm:grid-cols-2">{SKILL_CATEGORIES.map((category) => <div key={category.id} className="flex items-center justify-between rounded-lg border p-3 text-sm"><span>{category.label}</span><RatingBadge rating={item[category.id]} /></div>)}</div></section>
            <section className="space-y-4">{SKILL_QUESTIONS.map((question) => <div key={question.id}><h4 className="text-sm font-semibold">{question.shortLabel}</h4><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item[question.id] || "Not answered yet."}</p></div>)}</section>
          </div>}
        </> : null}
      </DialogContent>
    </Dialog>
  )
}

function TeamMatrix() {
  const { apiFetch } = useAuth()
  const [items, setItems] = React.useState<TeamSkillsMatrixItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [category, setCategory] = React.useState<SkillCategory>("analysis")
  const [minimum, setMinimum] = React.useState<SkillRating | "all">("all")
  const [department, setDepartment] = React.useState("all")
  const [completion, setCompletion] = React.useState("all")
  const [selected, setSelected] = React.useState<TeamSkillsMatrixItem | null>(null)

  React.useEffect(() => { void apiFetch("/skills/matrix").then(async (res) => { if (res.ok) setItems((await res.json()) as TeamSkillsMatrixItem[]); setLoading(false) }) }, [apiFetch])
  const departments = [...new Set(items.map((item) => item.department).filter(Boolean) as string[])].sort()
  const filtered = items.filter((item) => {
    if (department !== "all" && item.department !== department) return false
    if (completion === "complete" && !item.is_complete) return false
    if (completion === "incomplete" && item.is_complete) return false
    if (minimum !== "all" && (!item[category] || RATING_SCORE[item[category]!] < RATING_SCORE[minimum])) return false
    return true
  })
  const best = items.filter((item) => item[category]).sort((a, b) => RATING_SCORE[b[category]!] - RATING_SCORE[a[category]!] || a.name.localeCompare(b.name)).slice(0, 5)

  if (loading) return <div className="py-12 text-center text-sm text-muted-foreground">Loading team matrix…</div>
  return <div className="space-y-6">
    <Card className="shadow-none"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><UserRoundSearch className="h-5 w-5" />Matrix filters</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-2"><Label>Category</Label><Select value={category} onValueChange={(value) => setCategory(value as SkillCategory)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{SKILL_CATEGORIES.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Minimum rating</Label><Select value={minimum} onValueChange={(value) => setMinimum(value as SkillRating | "all")}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Any rating</SelectItem>{RATING_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label} or stronger</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Department</Label><Select value={department} onValueChange={setDepartment}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All departments</SelectItem>{departments.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Completion</Label><Select value={completion} onValueChange={setCompletion}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All profiles</SelectItem><SelectItem value="complete">Complete</SelectItem><SelectItem value="incomplete">Incomplete</SelectItem></SelectContent></Select></div>
    </CardContent></Card>

    <Card className="shadow-none"><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="h-5 w-5" />Best Fit · {SKILL_CATEGORIES.find((item) => item.id === category)?.label}</CardTitle><p className="text-sm text-muted-foreground">Deterministic ranking from self-reported preferences. Equal ratings are sorted alphabetically.</p></CardHeader><CardContent>{best.length ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{best.map((item, index) => <button key={item.user_id} onClick={() => setSelected(item)} className="flex items-center gap-3 rounded-lg border p-3 text-left hover:bg-muted/50"><span className="text-sm font-bold text-muted-foreground">{index + 1}</span><span className="min-w-0 flex-1 truncate text-sm font-medium">{item.name}</span><RatingBadge rating={item[category]} /></button>)}</div> : <p className="text-sm text-muted-foreground">No one has rated this category yet.</p>}</CardContent></Card>

    <Card className="overflow-hidden shadow-none"><CardHeader><CardTitle>Team Skills Matrix</CardTitle><p className="text-sm text-muted-foreground">{filtered.length} team member{filtered.length === 1 ? "" : "s"}. Ratings reflect personal self-assessment, not performance scores.</p></CardHeader><CardContent className="p-0">{items.length === 0 || items.every((item) => !item.exists) ? <div className="p-10 text-center"><p className="font-medium">No team skills profiles have been completed yet.</p><p className="mt-1 text-sm text-muted-foreground">Profiles will appear as team members begin responding.</p></div> : filtered.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">No team members match these filters.</div> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead className="sticky left-0 z-10 min-w-48 bg-card">Team member</TableHead>{SKILL_CATEGORIES.map((item) => <TableHead key={item.id} className="min-w-32 text-center">{item.label}</TableHead>)}<TableHead>Complete</TableHead></TableRow></TableHeader><TableBody>{filtered.map((item) => <TableRow key={item.user_id} className="cursor-pointer" onClick={() => setSelected(item)}><TableCell className="sticky left-0 z-10 bg-card"><div className="font-medium">{item.name}</div><div className="text-xs text-muted-foreground">{item.department || "No department"}</div></TableCell>{SKILL_CATEGORIES.map((skill) => <TableCell key={skill.id} className="text-center"><RatingBadge rating={item[skill.id]} /></TableCell>)}<TableCell>{item.is_complete ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <span className="text-xs text-muted-foreground">{item.completed_count}/9</span>}</TableCell></TableRow>)}</TableBody></Table></div>}</CardContent></Card>
    <ProfileDetail item={selected} onClose={() => setSelected(null)} />
  </div>
}

export default function SkillsPage() {
  const { user } = useAuth()
  const canViewTeam = user?.role === "ADMIN" || user?.role === "MANAGER"
  return <div className="mx-auto max-w-[1600px] space-y-6"><div><h1 className="text-2xl font-bold tracking-tight">Skills Matrix</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">Classify the types of work you prefer and where you believe you perform best. This information helps the team assign work and create stronger project teams.</p></div>{canViewTeam ? <Tabs defaultValue="team"><TabsList><TabsTrigger value="team">Team Matrix</TabsTrigger><TabsTrigger value="mine">My Preferences</TabsTrigger></TabsList><TabsContent value="team" className="mt-6"><TeamMatrix /></TabsContent><TabsContent value="mine" className="mt-6"><ProfileForm /></TabsContent></Tabs> : <ProfileForm />}</div>
}
