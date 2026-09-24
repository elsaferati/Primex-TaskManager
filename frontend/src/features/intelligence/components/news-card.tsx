import { ArrowUpRight, Bookmark, CalendarDays, Check, CircleDollarSign, LoaderCircle, Mail, MapPin, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { NewsEntry } from "../types"

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" })
const categoryLabels: Record<NewsEntry["analysis"]["category"], string> = {
  GRANT: "Grant", TENDER: "Tender", BUSINESS: "Business", TECHNOLOGY: "AI & Tech", EVENT: "Event", REGULATION: "Regulation", PARTNERSHIP: "Partnership", NEWS: "News",
}

export function NewsCard({ item, saved, read, canEmail, emailSending, emailBusy, onToggleSaved, onSetRead, onEmail }: { item: NewsEntry; saved: boolean; read: boolean; canEmail: boolean; emailSending: boolean; emailBusy: boolean; onToggleSaved: (id: string) => void; onSetRead: (id: string, read: boolean) => void; onEmail: (id: string) => void }) {
  const analysis = item.analysis
  const isOpportunity = analysis.category === "GRANT" || analysis.category === "TENDER"
  const markFromLink = () => { if (!read) onSetRead(item.id, true) }
  return (
    <article className="group relative rounded-xl border border-[#e8eae7] bg-white px-5 py-5 transition-[border-color,box-shadow] duration-200 hover:border-[#cfd8d1] hover:shadow-[0_8px_30px_rgba(30,40,35,0.045)] sm:px-6">
      {item.priority === "HIGH" ? <span aria-hidden="true" className="absolute bottom-5 left-0 top-5 w-[3px] rounded-r-full bg-[#758f82]" /> : null}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
          <span className="text-[#4f7161]">{categoryLabels[analysis.category]}</span>
          <span className="text-[#c1c9c3]">·</span>
          <span className={cn(item.priority === "HIGH" ? "text-[#587463]" : "text-[#8b9690]")}>{item.priority === "HIGH" ? "High priority" : item.priority === "MEDIUM" ? "Medium priority" : "Normal priority"}</span>
          <span className="text-[#c1c9c3]">·</span>
          <span className={read ? "text-[#939f96]" : "text-[#5c8265]"}>{read ? "Read" : "New"}</span>
        </div>
        <button type="button" onClick={() => onToggleSaved(item.id)} aria-label={saved ? `Remove ${item.title} from saved` : `Save ${item.title}`} aria-pressed={saved} title={saved ? "Remove from saved" : "Save item"} className={cn("-mr-2 -mt-2 rounded-lg p-2 text-[#87918b] transition-colors hover:bg-[#f3f5f2] hover:text-[#293e32] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5e806c]", saved && "text-[#4d715d]")}><Bookmark className={cn("size-[18px]", saved && "fill-current")} /></button>
      </div>
      <h3 className="mt-2 line-clamp-2 max-w-3xl text-[17px] font-semibold leading-snug tracking-[-0.02em] text-[#1e2a25] sm:text-[18px]" title={item.title}>{item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={markFromLink} onAuxClick={(event) => { if (event.button === 1) markFromLink() }} className="rounded-sm hover:text-[#3f6a4c] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5e806c]">{item.title}</a> : item.title}</h3>
      <p className="mt-2 line-clamp-3 max-w-3xl text-sm leading-6 text-[#66716a]">{analysis.summary}</p>
      {isOpportunity && (analysis.fundingAmount || analysis.deadline || analysis.eligibility || item.location) ? (
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 rounded-lg bg-[#f6f8f5] px-3.5 py-3 text-xs text-[#55635a]">
          {analysis.fundingAmount ? <span className="flex items-center gap-1.5"><CircleDollarSign className="size-3.5 text-[#789180]" /><strong className="font-medium text-[#2d3c32]">Funding</strong> {analysis.fundingAmount}</span> : null}
          {analysis.deadline ? <span className="flex items-center gap-1.5"><CalendarDays className="size-3.5 text-[#789180]" /><strong className="font-medium text-[#2d3c32]">Deadline</strong> {dateFormat.format(new Date(`${analysis.deadline}T12:00:00`))}</span> : null}
          {analysis.eligibility ? <span><strong className="font-medium text-[#2d3c32]">Eligibility</strong> {analysis.eligibility}</span> : null}
          {item.location ? <span className="flex items-center gap-1.5"><MapPin className="size-3.5 text-[#789180]" />{item.location}</span> : null}
        </div>
      ) : analysis.deadline ? <div className="mt-4 flex items-center gap-1.5 text-xs text-[#687b6d]"><CalendarDays className="size-3.5" /> Event date · {dateFormat.format(new Date(`${analysis.deadline}T12:00:00`))}</div> : null}
      {analysis.whyItMatters ? <div className="mt-4 border-l-2 border-[#b4c6b8] pl-3.5"><span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#52705d]">Why this matters</span><p className="mt-1 text-[13px] leading-5 text-[#506157]">{analysis.whyItMatters}</p></div> : null}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-[#eef0ed] pt-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#858e88]"><span className="font-medium text-[#55645a]">{item.sourceName}</span><span>·</span><time dateTime={item.publishedAt}>{dateFormat.format(new Date(item.publishedAt))}</time><span className="hidden sm:inline">·</span><span className="hidden sm:inline">{analysis.tags.slice(0, 2).join(" · ")}</span></div>
        <div className="flex items-center gap-1">
          {canEmail ? <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-[#68776b] hover:bg-[#f0f4ef]" disabled={emailBusy || Boolean(item.emailedAt)} onClick={() => onEmail(item.id)} title={item.emailedAt ? "Already sent to 180primex.eu@gmail.com" : "Send to 180primex.eu@gmail.com"} aria-label={item.emailedAt ? `${item.title} sent to 180primex.eu@gmail.com` : `Email ${item.title} to 180primex.eu@gmail.com`}>{emailSending ? <LoaderCircle className="size-3.5 animate-spin" /> : item.emailedAt ? <Check className="size-3.5" /> : <Mail className="size-3.5" />}{emailSending ? "Sending" : item.emailedAt ? "Sent" : "Email"}</Button> : null}
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-[#68776b] hover:bg-[#f0f4ef]" onClick={() => onSetRead(item.id, !read)}>{read ? <RotateCcw className="size-3.5" /> : <Check className="size-3.5" />}{read ? "Mark unread" : "Mark read"}</Button>
          {item.url ? <Button asChild variant="ghost" size="sm" className="-mr-2 h-7 gap-1 px-2 text-xs text-[#405d4b] hover:bg-[#f0f4ef]"><a href={item.url} target="_blank" rel="noopener noreferrer" onClick={markFromLink} onAuxClick={(event) => { if (event.button === 1) markFromLink() }} aria-label={`Read original ${item.sourceType === "LINKEDIN" ? "post" : "article"}: ${item.title}`}>Read {item.sourceType === "LINKEDIN" ? "post" : "article"} <ArrowUpRight className="size-3.5" /></a></Button> : <span className="text-[11px] text-[#9aa69c]">Illustrative item · no article link</span>}
        </div>
      </div>
    </article>
  )
}
