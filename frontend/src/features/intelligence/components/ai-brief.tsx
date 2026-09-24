"use client"

import * as React from "react"
import { ArrowUpRight, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { DailyBrief, NewsEntry } from "../types"

export function AIBrief({ brief, items }: { brief: DailyBrief; items: NewsEntry[] }) {
  const [open, setOpen] = React.useState(false)
  const featured = brief.itemIds.map((id) => items.find((item) => item.id === id)).filter((item): item is NewsEntry => Boolean(item))
  const generatedDate = new Date(brief.generatedAt)
  const dateLabel = generatedDate.toDateString() === new Date().toDateString()
    ? "today"
    : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(generatedDate)
  const generatedLabel = `Generated ${dateLabel} · ${new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(generatedDate)}`
  return (
    <>
    <section aria-labelledby="ai-brief-heading" className="relative overflow-hidden rounded-2xl bg-[#202b36] px-6 py-6 text-white shadow-sm sm:px-8 sm:py-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#c9d6dc]"><Sparkles className="size-4 text-[#b8dfd1]" /> AI Brief <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 font-medium normal-case tracking-normal">Preview</span></div>
        <span className="text-xs text-[#b7c5cb]">{generatedLabel}</span>
      </div>
      <h2 id="ai-brief-heading" className="mt-5 max-w-2xl text-xl font-semibold tracking-tight sm:text-2xl">{brief.headline}</h2>
      <div className="mt-5 grid gap-4 lg:grid-cols-3 lg:gap-7">
        {featured.map((item, index) => (
          <div key={item.id} className="flex gap-3 border-t border-white/15 pt-4">
            <span className="text-xs font-semibold tabular-nums text-[#a9b9be]">0{index + 1}</span>
            <p className="max-w-sm text-sm leading-6 text-[#eef4f2]">{item.title}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-[#aebfc3]">{brief.closingNote}</span>
        <Button size="sm" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={() => setOpen(true)}>View full briefing <ArrowUpRight className="size-4" /></Button>
      </div>
    </section>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>AI Brief</DialogTitle><DialogDescription>Sample briefing · {generatedLabel}</DialogDescription></DialogHeader><p className="text-sm text-muted-foreground">{brief.closingNote}</p><div className="space-y-5">{featured.map((item, index) => <div key={item.id} className="border-t pt-4"><div className="text-xs font-semibold uppercase tracking-wide text-[#5f8068]">0{index + 1} · {item.analysis.category.toLowerCase()}</div><h3 className="mt-1 text-base font-semibold">{item.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{item.analysis.summary}</p>{item.analysis.whyItMatters ? <p className="mt-2 text-sm leading-6"><strong>Why it matters:</strong> {item.analysis.whyItMatters}</p> : null}{item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#4f765b] hover:underline">Read original article <ArrowUpRight className="size-3" /></a> : <p className="mt-2 text-xs text-muted-foreground">Illustrative item · no article link</p>}</div>)}</div></DialogContent></Dialog>
    </>
  )
}
