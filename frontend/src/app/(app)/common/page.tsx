"use client"

import * as React from "react"
import { useAuth } from "@/lib/auth"
import type { User } from "@/lib/types"

type CommonEntryItem = { id?: string; title: string; description?: string; date: string; category?: string }
type GaNote = { date: string; department: string; note: string }

export default function CommonViewPage() {
  const { apiFetch, user } = useAuth()

  // users from backend (for person select / assignments)
  const [users, setUsers] = React.useState<User[]>([])

  // Utils
  const pad2 = (n: number) => String(n).padStart(2, "0")
  const toISODate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  const fromISODate = (s: string) => {
    const [y, m, d] = s.split("-").map(Number)
    return new Date(y, m - 1, d)
  }
  const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
  const getMonday = (d: Date) => {
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const day = date.getDay()
    const diff = (day === 0 ? -6 : 1) - day
    date.setDate(date.getDate() + diff)
    return date
  }
  const getWeekdays = (monday: Date) => [0,1,2,3,4].map(i => addDays(monday, i))
  const formatDateHuman = (s: string) => { const d = fromISODate(s); return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}` }
  const weekdayShort = (d: Date) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]

  // map backend category strings to our UI buckets
  const mapCategory = (cat: string) => {
    const s = (cat || "").toLowerCase()
    if (s.includes("delays")) return "delays"
    if (s.includes("absences")) return "absences"
    if (s.includes("annual") || s.includes("leave")) return "annualLeave"
    if (s.includes("blocks")) return "blocks"
    if (s.includes("external")) return "externalTasks"
    if (s.includes("complaints")) return "complaints"
    if (s.includes("requests")) return "requests"
    if (s.includes("proposals")) return "proposals"
    return "delays"
  }

  const mapUITypeToCategory = (t: string) => {
    if (t === "delays") return "Delays"
    if (t === "absences") return "Absences"
    if (t === "annualLeave") return "Annual Leave"
    if (t === "blocks") return "Blocks"
    if (t === "externalTasks") return "External Tasks"
    if (t === "complaints") return "Complaints"
    if (t === "requests") return "Requests"
    if (t === "proposals") return "Proposals"
    return "Delays"
  }

  const normalizeEntry = (e: any) => {
    const createdAt = e.created_at || e.createdAt || e.date || Date.now()
    const base = {
      id: e.id,
      title: e.title || "",
      description: e.description || "",
      date: toISODate(new Date(createdAt)),
      category: String(e.category || ""),
      raw: e,
    }
    return base
  }

  // State
  const [commonData, setCommonData] = React.useState(() => ({
    delays: [] as CommonEntryItem[],
    absences: [] as CommonEntryItem[],
    annualLeave: [] as CommonEntryItem[],
    blocks: [] as CommonEntryItem[],
    externalTasks: [] as CommonEntryItem[],
    complaints: [] as CommonEntryItem[],
    requests: [] as CommonEntryItem[],
    proposals: [] as CommonEntryItem[],
    gaNotes: [] as GaNote[],
  }))

  const [weekStart, setWeekStart] = React.useState<Date>(() => getMonday(new Date()))
  const [selectedDates, setSelectedDates] = React.useState<Set<string>>(new Set())
  const [multiMode, setMultiMode] = React.useState(false)

  // Modal state / form
  const [modalOpen, setModalOpen] = React.useState(false)
  const [formType, setFormType] = React.useState("delays")
  const [formTitle, setFormTitle] = React.useState("")
  const [formNote, setFormNote] = React.useState("")

  // Load data from backend
  React.useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const res = await apiFetch("/common-entries")
        if (!res.ok) return
        const data = (await res.json()) as any[]
        // map backend entries into our buckets and normalize
        const buckets: any = {
          delays: [],
          absences: [],
          annualLeave: [],
          blocks: [],
          externalTasks: [],
          complaints: [],
          requests: [],
          proposals: [],
          gaNotes: [],
        }
        for (const e of data) {
          const k = mapCategory(e.category || "")
          buckets[k] = buckets[k] || []
          buckets[k].push(normalizeEntry(e))
        }
        if (mounted) setCommonData(buckets)

        // load users and other reference data for managers
        if (user?.role !== "STAFF") {
          const [uRes] = await Promise.all([apiFetch("/users")])
          if (uRes && uRes.ok) {
            const us = (await uRes.json()) as User[]
            if (mounted) setUsers(us)
          }
        }
        // load all GA notes
        try {
          const gRes = await apiFetch("/ga-notes")
          if (gRes && gRes.ok) {
            const gaData = (await gRes.json()) as any[]
            const gaNotes = gaData.map(n => ({
              id: n.id,
              note: n.content || n.note || '',
              date: toISODate(new Date(n.start_date || n.created_at || Date.now())),
              department: n.department_id || n.department || '',
              raw: n,
            }))
            if (mounted) setCommonData((prev: any) => ({ ...prev, gaNotes }))
          }
        } catch {
          // ignore ga notes errors
        }
        // select today by default
        if (mounted) setSelectedDates(new Set([toISODate(new Date())]))
      } catch (err) {
        // ignore
      }
    }
    void load()
    return () => { mounted = false }
  }, [apiFetch, user])

  // Derived week ISO strings
  const weekISOs = React.useMemo(() => getWeekdays(weekStart).map(toISODate), [weekStart])

  // Render helpers
  const inSelectedDates = (iso: string) => !selectedDates.size || selectedDates.has(iso)

  const toggleDay = (iso: string) => {
    setSelectedDates(prev => {
      const s = new Set(prev)
      if (!multiMode) s.clear()
      if (s.has(iso)) s.delete(iso)
      else s.add(iso)
      return s
    })
  }

  const selectToday = () => {
    const t = toISODate(new Date())
    setWeekStart(getMonday(new Date()))
    setSelectedDates(new Set([t]))
  }
  const selectAll = () => setSelectedDates(new Set())

  // Add item from modal
  const submitForm = (e?: React.FormEvent) => {
    e?.preventDefault()
    ;(async () => {
      try {
        const category = mapUITypeToCategory(formType)
        const body: any = { category, title: formTitle || formNote || "", description: formNote || null }
        const res = await apiFetch("/common-entries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        if (res.ok) {
          // reload lists (normalized)
          const reload = await apiFetch("/common-entries")
          if (reload.ok) {
            const data2 = (await reload.json()) as any[]
            const buckets: any = {
              delays: [],
              absences: [],
              annualLeave: [],
              blocks: [],
              externalTasks: [],
              complaints: [],
              requests: [],
              proposals: [],
              gaNotes: [],
            }
            for (const e of data2) {
              const k = mapCategory(e.category || "")
              buckets[k] = buckets[k] || []
              buckets[k].push(normalizeEntry(e))
            }
            setCommonData(buckets)
          }
        }
      } catch (err) {
        // ignore
      }
    })()
    setModalOpen(false)
  }

  // Filtered lists for rendering
  const delays = commonData.delays.filter(x => inSelectedDates(x.date))
  const absences = commonData.absences.filter(x => inSelectedDates(x.date))
  const annualLeave = commonData.annualLeave.filter(x => inSelectedDates(x.date))
  const ga = commonData.gaNotes.filter(x => inSelectedDates(x.date))
  const blocks = commonData.blocks.filter(x => inSelectedDates(x.date))
  const externalTasks = commonData.externalTasks.filter(x => inSelectedDates(x.date))
  const complaints = commonData.complaints.filter(x => inSelectedDates(x.date))
  const requests = commonData.requests.filter(x => inSelectedDates(x.date))
  const proposals = commonData.proposals.filter(x => inSelectedDates(x.date))

  return (
    <div className="common-page">
      <style>{`
        /* scoped minimal styles from your design */
        *{box-sizing:border-box}
        .common-page{min-height:100%;background:radial-gradient(circle at top,#eef2ff 0%,#f8fafc 45%,#ffffff 100%)}
        .top-header{background:#fff;border-bottom:1px solid #e5e7eb;padding:18px 24px;display:flex;justify-content:space-between;align-items:center}
        .page-title h1{font-size:20px;margin:0}
        .page-title p{margin:6px 0 0}
        .common-toolbar{background:#fff;padding:12px 24px;border-bottom:1px solid #e5e7eb;display:flex;flex-wrap:wrap;gap:10px;align-items:center}
        .chip{border:none;padding:7px 12px;border-radius:999px;background:#f1f5f9;color:#1f2937;font-weight:700;cursor:pointer}
        .chip.active{background:#111827;color:#fff;box-shadow:0 6px 14px rgba(15,23,42,0.12)}
        .common-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px;padding:24px}
        .common-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;max-height:420px;box-shadow:0 10px 20px rgba(15,23,42,0.06)}
        .common-card-header{padding:10px 14px;background:#f8fafc;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;font-weight:700}
        .common-card-body{padding:12px 14px;overflow:auto}
        .common-item{padding:8px 10px;border-radius:10px;background:#f9fafb;border:1px solid #eef2f7;margin-bottom:8px}
        .common-item-title{font-weight:800}
        .common-item-meta{color:#6b7280;font-size:12px;margin-top:4px}
        .common-empty{color:#6b7280;padding:12px;border:1px dashed #cbd5f5;border-radius:10px;text-align:center;background:#f8fafc}
        .modal{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:40}
        .modal-backdrop{position:absolute;inset:0;background:rgba(0,0,0,0.45)}
        .modal-card{position:relative;width:600px;background:#fff;border-radius:14px;padding:18px;z-index:41}
        .btn{padding:8px 12px;border-radius:999px;border:1px solid #d1d5db;background:#fff;cursor:pointer;font-weight:700}
      `}</style>

      <header className="top-header">
        <div className="page-title">
          <h1>Common View</h1>
          <p style={{ fontSize: 12, color: '#6b7280' }}>Daily/weekly overview for key updates and team priorities.</p>
        </div>
        <div>
          <button className="btn" onClick={() => setModalOpen(true)}>+ Add entry</button>
        </div>
      </header>

      <div className="common-toolbar">
        <div style={{ display: 'flex', gap: 8 }}>
          {weekISOs.map(iso => (
            <button key={iso} className={selectedDates.has(iso) ? 'chip active' : 'chip'} onClick={() => toggleDay(iso)}>{`${weekdayShort(fromISODate(iso))} ${formatDateHuman(iso)}`}</button>
          ))}
        </div>
        <label style={{ marginLeft: 12 }}><input type="checkbox" checked={multiMode} onChange={e => setMultiMode(e.target.checked)} /> Multi-select (days)</label>
        <input type="date" style={{ marginLeft: 'auto' }} value={toISODate(weekStart)} onChange={e => setWeekStart(getMonday(fromISODate(e.target.value)))} />
        <button className="chip" onClick={selectAll} style={{ marginLeft: 8 }}>All days</button>
        <button className="chip" onClick={selectToday} style={{ marginLeft: 8 }}>Today</button>
      </div>

      <div className="common-grid">
        <div className="common-card" data-common-type="delays">
          <div className="common-card-header"><div>Delays</div><div>{delays.length}</div></div>
          <div className="common-card-body">
            {delays.length ? delays.map((x, i) => (
              <div key={i} className="common-item">
                <div className="common-item-title">{x.title}</div>
                {x.description ? <div className="common-item-meta">{x.description}</div> : null}
                <div className="common-item-meta">{formatDateHuman(x.date)}</div>
              </div>
            )) : <div className="common-empty">No data yet.</div>}
          </div>
        </div>

        <div className="common-card" data-common-type="absences">
          <div className="common-card-header"><div>Absences</div><div>{absences.length}</div></div>
          <div className="common-card-body">
            {absences.length ? absences.map((x,i) => (
              <div key={i} className="common-item">
                <div className="common-item-title">{x.title}</div>
                {x.description ? <div className="common-item-meta">{x.description}</div> : null}
                <div className="common-item-meta">{formatDateHuman(x.date)}</div>
              </div>
            )) : <div className="common-empty">No data yet.</div>}
          </div>
        </div>

        <div className="common-card" data-common-type="annual-leave">
          <div className="common-card-header"><div>Annual Leave</div><div>{annualLeave.length}</div></div>
          <div className="common-card-body">
            {annualLeave.length ? annualLeave.map((x,i) => (
              <div key={i} className="common-item">
                <div className="common-item-title">{x.title}</div>
                {x.description ? <div className="common-item-meta">{x.description}</div> : null}
                <div className="common-item-meta">{formatDateHuman(x.date)}</div>
              </div>
            )) : <div className="common-empty">No data yet.</div>}
          </div>
        </div>

        <div className="common-card" data-common-type="ga">
          <div className="common-card-header"><div>GA Notes</div><div>{ga.length}</div></div>
          <div className="common-card-body">
            {ga.length ? ga.map((x,i) => (
              <div key={i} className="common-item">
                <div className="common-item-title">{x.note}</div>
                <div className="common-item-meta">{formatDateHuman(x.date)} - {x.department}</div>
              </div>
            )) : <div className="common-empty">No data yet.</div>}
          </div>
        </div>

        <div className="common-card" data-common-type="blocks">
          <div className="common-card-header"><div>Blocks</div><div>{blocks.length}</div></div>
          <div className="common-card-body">
            {blocks.length ? blocks.map((x,i) => (
              <div key={i} className="common-item">
                <div className="common-item-title">{x.title}</div>
                {x.description ? <div className="common-item-meta">{x.description}</div> : null}
                <div className="common-item-meta">{formatDateHuman(x.date)}</div>
              </div>
            )) : <div className="common-empty">No data yet.</div>}
          </div>
        </div>

        <div className="common-card" data-common-type="external">
          <div className="common-card-header"><div>External Tasks</div><div>{externalTasks.length}</div></div>
          <div className="common-card-body">
            {externalTasks.length ? externalTasks.map((x,i) => (
              <div key={i} className="common-item">
                <div className="common-item-title">{x.title}</div>
                {x.description ? <div className="common-item-meta">{x.description}</div> : null}
                <div className="common-item-meta">{formatDateHuman(x.date)}</div>
              </div>
            )) : <div className="common-empty">No data yet.</div>}
          </div>
        </div>

        <div className="common-card" data-common-type="complaints">
          <div className="common-card-header"><div>Complaints</div><div>{complaints.length}</div></div>
          <div className="common-card-body">
            {complaints.length ? complaints.map((x,i) => (
              <div key={i} className="common-item">
                <div className="common-item-title">{x.title}</div>
                {x.description ? <div className="common-item-meta">{x.description}</div> : null}
                <div className="common-item-meta">{formatDateHuman(x.date)}</div>
              </div>
            )) : <div className="common-empty">No data yet.</div>}
          </div>
        </div>

        <div className="common-card" data-common-type="requests">
          <div className="common-card-header"><div>Requests</div><div>{requests.length}</div></div>
          <div className="common-card-body">
            {requests.length ? requests.map((x,i) => (
              <div key={i} className="common-item">
                <div className="common-item-title">{x.title}</div>
                {x.description ? <div className="common-item-meta">{x.description}</div> : null}
                <div className="common-item-meta">{formatDateHuman(x.date)}</div>
              </div>
            )) : <div className="common-empty">No data yet.</div>}
          </div>
        </div>

        <div className="common-card" data-common-type="proposals">
          <div className="common-card-header"><div>Proposals</div><div>{proposals.length}</div></div>
          <div className="common-card-body">
            {proposals.length ? proposals.map((x,i) => (
              <div key={i} className="common-item">
                <div className="common-item-title">{x.title}</div>
                {x.description ? <div className="common-item-meta">{x.description}</div> : null}
                <div className="common-item-meta">{formatDateHuman(x.date)}</div>
              </div>
            )) : <div className="common-empty">No data yet.</div>}
          </div>
        </div>
      </div>

      {modalOpen ? (
        <div className="modal">
          <div className="modal-backdrop" onClick={() => setModalOpen(false)} />
          <div className="modal-card">
            <h4>Add to Common View</h4>
            <form onSubmit={submitForm} style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label>Type</label>
                  <select value={formType} onChange={e => setFormType(e.target.value)} style={{ width: '100%', padding: 8 }}>
                    <option value="delays">Delays</option>
                    <option value="absences">Absences</option>
                    <option value="annualLeave">Annual Leave</option>
                    <option value="blocks">Blocks</option>
                    <option value="externalTasks">External Tasks</option>
                    <option value="complaints">Complaints</option>
                    <option value="requests">Requests</option>
                    <option value="proposals">Proposals</option>
                  </select>
                </div>
                <div>
                  <label>Title / Person</label>
                  <select value={formTitle} onChange={e=>setFormTitle(e.target.value)} style={{ width: '100%', padding: 8 }}>
                    <option value="">--</option>
                    {users.map(u => <option key={u.id || u.email || u.name} value={u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim()}>{u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim()}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label>Note</label>
                  <textarea value={formNote} onChange={e=>setFormNote(e.target.value)} style={{ width: '100%', padding: 8, minHeight: 80 }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn">Save</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}



