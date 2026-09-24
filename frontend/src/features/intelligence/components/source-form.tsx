"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { NewsSource, NewsSourceInput, SourcePriority, SourceStatus, SourceType } from "../types"

const categories = ["Grants", "Tenders", "Funding", "Business", "Events", "Technology", "Regulations", "Partnerships", "General News"]
const sourceTypes: { value: SourceType; label: string }[] = [
  { value: "WEBSITE", label: "Website" }, { value: "RSS", label: "RSS" }, { value: "LINKEDIN", label: "LinkedIn" }, { value: "FACEBOOK", label: "Facebook" }, { value: "API", label: "API" }, { value: "OTHER", label: "Other" },
]

const blankSource: NewsSourceInput = {
  name: "", url: "", type: "LINKEDIN", status: "ACTIVE", priority: "NORMAL", categories: [], ai_instructions: "", fetch_interval_minutes: 60,
}

export function toSourceInput(source: NewsSource): NewsSourceInput {
  return {
    name: source.name, url: source.url, type: source.type, status: source.status,
    priority: source.priority, categories: [...source.categories],
    ai_instructions: source.ai_instructions, fetch_interval_minutes: source.fetch_interval_minutes,
  }
}

export function SourceForm({ open, source, onOpenChange, onSave }: { open: boolean; source: NewsSource | null; onOpenChange: (open: boolean) => void; onSave: (input: NewsSourceInput) => Promise<void> }) {
  const [form, setForm] = React.useState<NewsSourceInput>(source ? toSourceInput(source) : blankSource)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState("")

  React.useEffect(() => { if (open) { setForm(source ? toSourceInput(source) : { ...blankSource, categories: [] }); setError("") } }, [open, source])

  const update = <K extends keyof NewsSourceInput>(key: K, value: NewsSourceInput[K]) => setForm((current) => ({ ...current, [key]: value }))
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError("")
    try { await onSave({ ...form, name: form.name.trim(), url: form.url.trim(), ai_instructions: form.ai_instructions?.trim() || null }); onOpenChange(false) }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save source.") }
    finally { setSaving(false) }
  }

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
    <DialogHeader><DialogTitle>{source ? "Edit source" : "Add source"}</DialogTitle><DialogDescription>{form.type === "LINKEDIN" ? "Monitor public posts from a LinkedIn profile or company page." : "Save this source for a future connector. Collection currently supports LinkedIn posts."}</DialogDescription></DialogHeader>
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5 sm:col-span-2"><Label htmlFor="source-name">Source name</Label><Input id="source-name" value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="e.g. Company or person name" required maxLength={160} /></div><div className="space-y-1.5 sm:col-span-2"><Label htmlFor="source-url">URL</Label><Input id="source-url" type="url" value={form.url} onChange={(event) => update("url", event.target.value)} placeholder={form.type === "LINKEDIN" ? "https://www.linkedin.com/in/profile-name/" : "https://example.com"} required maxLength={2000} />{form.type === "LINKEDIN" ? <p className="text-xs text-muted-foreground">Use a personal profile (/in/) or company page (/company/) URL.</p> : null}</div>
      <div className="space-y-1.5"><Label>Source type</Label><Select value={form.type} onValueChange={(value) => update("type", value as SourceType)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{sourceTypes.map((type) => <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label>Priority</Label><Select value={form.priority} onValueChange={(value) => update("priority", value as SourcePriority)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="HIGH">High</SelectItem><SelectItem value="NORMAL">Normal</SelectItem><SelectItem value="LOW">Low</SelectItem></SelectContent></Select></div></div>
      <fieldset><legend className="text-sm font-medium">Categories of interest</legend><div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-3 rounded-lg bg-[#f7f9f6] p-4 sm:grid-cols-3">{categories.map((category) => <label key={category} className="flex cursor-pointer items-center gap-2 text-xs text-[#4e6053]"><Checkbox checked={form.categories.includes(category)} onCheckedChange={(checked) => update("categories", checked ? [...form.categories, category] : form.categories.filter((value) => value !== category))} />{category}</label>)}</div></fieldset>
      <div className="space-y-1.5"><Label htmlFor="source-ai">AI instructions</Label><Textarea id="source-ai" value={form.ai_instructions || ""} onChange={(event) => update("ai_instructions", event.target.value)} maxLength={4000} rows={3} placeholder="Prioritize grants, tenders and opportunities relevant to Kosovo technology companies." /><p className="text-xs text-muted-foreground">Used when new LinkedIn posts are analyzed on the server.</p></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label>Status</Label><Select value={form.status} onValueChange={(value) => update("status", value as SourceStatus)}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ACTIVE">Active</SelectItem><SelectItem value="PAUSED">Paused</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><Label htmlFor="source-interval">Check interval · minutes</Label><Input id="source-interval" type="number" min={5} max={10080} value={form.fetch_interval_minutes} onChange={(event) => update("fetch_interval_minutes", Number(event.target.value))} required /></div></div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving…" : source ? "Save changes" : "Add source"}</Button></DialogFooter>
    </form>
  </DialogContent></Dialog>
}
