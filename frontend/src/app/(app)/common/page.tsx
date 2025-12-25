"use client"

import * as React from "react"
import { useAuth } from "@/lib/auth"
import type { User } from "@/lib/types"

type Person = { name: string; department: string }
type Late = { person: string; date: string; until?: string; note?: string }
type Absent = { person: string; date: string; from?: string; to?: string; note?: string }
type Leave = { person: string; startDate: string; endDate?: string; fullDay?: boolean; from?: string; to?: string; note?: string }
type GaNote = { date: string; department: string; note: string }
type Blocked = { title: string; person: string; date: string; note?: string }
type PriorityItem = { person: string; date: string; items: { project: string; task: string; level?: string }[] }

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
  const alWeekdayShort = (d: Date) => ["Die","Hën","Mar","Mër","Enj","Pre","Sht"][d.getDay()]

  // map backend category/type strings to our UI buckets
  const mapCategory = (cat: string) => {
    const s = (cat || "").toLowerCase()
    if (s.includes('late') || s.includes('von')) return 'late'
    if (s.includes('absent') || s.includes('mung')) return 'absent'
    if (s.includes('leave') || s.includes('pushim') || s.includes('vakanc')) return 'leave'
    if (s.includes('ga') || s.includes('ga_note') || s.includes('ga-note')) return 'gaNotes'
    if (s.includes('block') || s.includes('blocked')) return 'blocked'
    if (s.includes('external') || s.includes('meeting') || s.includes('takim')) return 'external'
    if (s.includes('r1')) return 'r1'
    if (s.includes('feedback') || s.includes('complaint') || s.includes('proposal')) return 'feedback'
    if (s.includes('priority') || s.includes('project-priority')) return 'priority'
    return 'oneH'
  }

  const mapUITypeToCategory = (t: string) => {
    if (t === 'late') return 'Late'
    if (t === 'absent') return 'Absent'
    if (t === 'leave') return 'AnnualLeave'
    if (t === 'feedback') return 'Feedback'
    if (t === 'gaNote') return 'GA_NOTE'
    return t
  }

  const normalizeEntry = (e: any) => {
    // produce a lightweight object tailored for our UI rendering
    const base = {
      id: e.id,
      person: (e.user && (e.user.name || `${e.user.first_name || ''} ${e.user.last_name || ''}`.trim())) || e.title || (e.meta && e.meta.person) || '—',
      date: e.date || (e.meta && e.meta.date) || toISODate(new Date(e.created_at || Date.now())),
      note: e.description || e.note || (e.meta && e.meta.note) || '',
      meta: e.meta || {},
      title: e.title || '',
      raw: e,
    }
    return base
  }

  // State
  const [commonData, setCommonData] = React.useState(() => ({
    late: [] as Late[], absent: [] as Absent[], leave: [] as Leave[], gaNotes: [] as GaNote[], blocked: [] as Blocked[],
    oneH: [] as any[], external: [] as any[], r1: [] as any[], feedback: [] as any[], priority: [] as PriorityItem[],
  }))

  const [weekStart, setWeekStart] = React.useState<Date>(() => getMonday(new Date()))
  const [selectedDates, setSelectedDates] = React.useState<Set<string>>(new Set())
  const [multiMode, setMultiMode] = React.useState(false)
  const [typeFilters, setTypeFilters] = React.useState<Set<string>>(new Set())
  const [typeMultiMode, setTypeMultiMode] = React.useState(false)

  // Modal state / form
  const [modalOpen, setModalOpen] = React.useState(false)
  const [formType, setFormType] = React.useState("late")
  const [formPerson, setFormPerson] = React.useState("")
  const [formDate, setFormDate] = React.useState(() => toISODate(new Date()))
  const [formNote, setFormNote] = React.useState("")
  const [formUntil, setFormUntil] = React.useState("09:00")
  const [formFrom, setFormFrom] = React.useState("08:00")
  const [formTo, setFormTo] = React.useState("12:00")
  const [formFullDay, setFormFullDay] = React.useState(false)

  // Load data from backend
  React.useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const res = await apiFetch("/common-entries")
        if (!res.ok) return
        const data = (await res.json()) as any[]
        // map backend entries into our buckets and normalize
        const buckets: any = { late: [], absent: [], leave: [], gaNotes: [], blocked: [], oneH: [], external: [], r1: [], feedback: [], priority: [] }
        for (const e of data) {
          const k = mapCategory(e.category || e.type || "")
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
        // load GA notes for the user's department if available
        try {
          const deptId = (user as any)?.department_id || (user as any)?.departmentId || null
          if (deptId) {
            const gRes = await apiFetch(`/ga-notes?department_id=${deptId}`)
            if (gRes && gRes.ok) {
              const gaData = (await gRes.json()) as any[]
              const gaNotes = gaData.map(n => ({
                id: n.id,
                note: n.content || n.note || '',
                date: n.start_date || n.created_at || toISODate(new Date()),
                department: n.department_id || n.department || '',
                raw: n,
              }))
              if (mounted) setCommonData((prev: any) => ({ ...prev, gaNotes }))
            }
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

  const setTypeFilter = (type: string) => {
    setTypeFilters(prev => {
      const s = new Set(prev)
      if (type === "all") { s.clear(); return s }
      if (!typeMultiMode) { s.clear(); s.add(type); return s }
      if (s.has(type)) s.delete(type); else s.add(type)
      return s
    })
  }

  // Add item from modal
  const submitForm = (e?: React.FormEvent) => {
    e?.preventDefault()
    ;(async () => {
      try {
        const category = mapUITypeToCategory(formType)
        const body: any = { category, title: formPerson || formNote || "", description: formNote || null }
        // additional fields for some types
        if (formType === "late") body.meta = { until: formUntil }
        if (formType === "absent") body.meta = { from: formFrom, to: formTo }
        const res = await apiFetch("/common-entries", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        if (res.ok) {
          // reload lists (normalized)
          const reload = await apiFetch("/common-entries")
          if (reload.ok) {
            const data2 = (await reload.json()) as any[]
            const buckets: any = { late: [], absent: [], leave: [], gaNotes: [], blocked: [], oneH: [], external: [], r1: [], feedback: [], priority: [] }
            for (const e of data2) {
              const k = mapCategory(e.category || e.type || "")
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
  const late = commonData.late.filter(x => inSelectedDates(x.date))
  const absent = commonData.absent.filter(x => inSelectedDates(x.date))
  const leave = commonData.leave.filter(x => inSelectedDates(x.startDate))
  const ga = commonData.gaNotes.filter(x => inSelectedDates(x.date))
  const blocked = commonData.blocked.filter(x => inSelectedDates(x.date))
  const priorityItems = commonData.priority.filter(p => inSelectedDates(p.date))

  return (
    <div>
      <style>{`
        /* scoped minimal styles from your design */
        *{box-sizing:border-box}
        .top-header{background:#fff;border-bottom:1px solid #e5e7eb;padding:16px 24px;display:flex;justify-content:space-between;align-items:center}
        .page-title h1{font-size:20px}
        .common-toolbar{background:#fff;padding:10px 24px;border-bottom:1px solid #e5e7eb;display:flex;flex-wrap:wrap;gap:10px;align-items:center}
        .chip{border:none;padding:7px 10px;border-radius:8px;background:transparent;color:#6b7280;font-weight:700;cursor:pointer}
        .chip.active{background:#fff;color:#111827;box-shadow:0 1px 3px rgba(0,0,0,0.08)}
        .common-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:24px}
        .common-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;display:flex;flex-direction:column;max-height:420px}
        .common-card-header{padding:10px 14px;background:#f9fafb;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between}
        .common-card-body{padding:12px 14px;overflow:auto}
        .common-empty{color:#6b7280;padding:12px;border:1px dashed #d1d5db;border-radius:10px;text-align:center}
        .modal{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:40}
        .modal-backdrop{position:absolute;inset:0;background:rgba(0,0,0,0.45)}
        .modal-card{position:relative;width:600px;background:#fff;border-radius:12px;padding:16px;z-index:41}
        .btn{padding:8px 12px;border-radius:8px;border:1px solid #d1d5db;background:#fff;cursor:pointer}
      `}</style>

      <header className="top-header">
        <div className="page-title">
          <h1>Common View</h1>
          <p style={{ fontSize: 12, color: '#6b7280' }}>Pamje ditore/javore për statuset kryesore dhe prioritetet e ekipit.</p>
        </div>
        <div>
          <button className="btn" onClick={() => setModalOpen(true)}>+ Shto</button>
        </div>
      </header>

      <div className="common-toolbar">
        <div style={{ display: 'flex', gap: 8 }}>
          {weekISOs.map(iso => (
            <button key={iso} className={selectedDates.has(iso) ? 'chip active' : 'chip'} onClick={() => toggleDay(iso)}>{`${alWeekdayShort(fromISODate(iso))} ${formatDateHuman(iso)}`}</button>
          ))}
        </div>
        <label style={{ marginLeft: 12 }}><input type="checkbox" checked={multiMode} onChange={e => setMultiMode(e.target.checked)} /> Multi-select (Ditët)</label>
        <label style={{ marginLeft: 12 }}><input type="checkbox" checked={typeMultiMode} onChange={e => setTypeMultiMode(e.target.checked)} /> Multi-select (Llojet)</label>
        <input type="date" style={{ marginLeft: 'auto' }} value={toISODate(weekStart)} onChange={e => setWeekStart(getMonday(fromISODate(e.target.value)))} />
        <button className="chip" onClick={selectAll} style={{ marginLeft: 8 }}>Të gjitha</button>
        <button className="chip" onClick={selectToday} style={{ marginLeft: 8 }}>Sot</button>
      </div>

      <div className="common-grid">
        <div className="common-card" data-common-type="late">
          <div className="common-card-header"><div>Vonesat</div><div>{late.length}</div></div>
          <div className="common-card-body">
            {late.length ? late.map((x, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 800 }}>{x.person} <small style={{ color: '#6b7280', fontWeight: 400 }}>– deri {x.until}</small></div>
                <div style={{ color: '#6b7280', fontSize: 13 }}>{x.note}</div>
              </div>
            )) : <div className="common-empty">Nuk ka të dhëna.</div>}
          </div>
        </div>

        <div className="common-card" data-common-type="absent">
          <div className="common-card-header"><div>Mungesat</div><div>{absent.length}</div></div>
          <div className="common-card-body">
            {absent.length ? absent.map((x,i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 800 }}>{x.person}</div>
                <div style={{ color: '#6b7280', fontSize: 13 }}>{formatDateHuman(x.date)} • {x.from}-{x.to}</div>
              </div>
            )) : <div className="common-empty">Nuk ka të dhëna.</div>}
          </div>
        </div>

        <div className="common-card" data-common-type="leave">
          <div className="common-card-header"><div>Pushim Vjetor</div><div>{leave.length}</div></div>
          <div className="common-card-body">
            {leave.length ? leave.map((x,i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 800 }}>{x.person}</div>
                <div style={{ color: '#6b7280', fontSize: 13 }}>{formatDateHuman(x.startDate)} • {x.fullDay ? 'Full Day' : 'Me orë'}</div>
              </div>
            )) : <div className="common-empty">Nuk ka të dhëna.</div>}
          </div>
        </div>

        <div className="common-card" data-common-type="ga">
          <div className="common-card-header"><div>Shënime GA</div><div>{ga.length}</div></div>
          <div className="common-card-body">
            {ga.length ? ga.map((x,i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 800 }}>{x.note}</div>
                <div style={{ color: '#6b7280', fontSize: 13 }}>{formatDateHuman(x.date)} • {x.department}</div>
              </div>
            )) : <div className="common-empty">Nuk ka të dhëna.</div>}
          </div>
        </div>

        <div className="common-card" data-common-type="blocked">
          <div className="common-card-header"><div>BLLOK</div><div>{blocked.length}</div></div>
          <div className="common-card-body">
            {blocked.length ? blocked.map((x,i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 800 }}>{x.title}</div>
                <div style={{ color: '#6b7280', fontSize: 13 }}>{formatDateHuman(x.date)} • <b>{x.person}</b></div>
              </div>
            )) : <div className="common-empty">Nuk ka të dhëna.</div>}
          </div>
        </div>

        <div className="common-card" data-common-type="external">
          <div className="common-card-header"><div>Takime Externe</div><div>{commonData.external.length}</div></div>
          <div className="common-card-body"><div className="common-empty">Nuk ka të dhëna.</div></div>
        </div>

        <div className="common-card" data-common-type="r1">
          <div className="common-card-header"><div>R1</div><div>{commonData.r1.length}</div></div>
          <div className="common-card-body"><div className="common-empty">Nuk ka të dhëna.</div></div>
        </div>

        <div className="common-card" data-common-type="feedback">
          <div className="common-card-header"><div>Ankesa/Propozime</div><div>{commonData.feedback.length}</div></div>
          <div className="common-card-body"><div className="common-empty">Nuk ka të dhëna.</div></div>
        </div>

        <div className="common-card common-priority" style={{ gridColumn: '1 / -1' }} data-common-type="priority">
          <div className="common-card-header"><div>Projekte me Prioritet (për të gjithë)</div><div>{priorityItems.reduce((acc,c)=>acc + c.items.length,0)}</div></div>
          <div className="common-card-body">
            {priorityItems.length ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {[...new Set(priorityItems.map(p=>p.person))].map(person => {
                  const userItems = priorityItems.filter(p=>p.person===person).flatMap(p=>p.items)
                  return (
                    <div key={person} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 10 }}>
                      <div style={{ fontWeight: 900 }}>{person} <span style={{ float: 'right', fontWeight: 700 }}>{userItems.length}</span></div>
                      <ul style={{ marginTop: 8 }}>{userItems.map((t,i)=>(<li key={i}><b>{t.project}</b>: {t.task}</li>))}</ul>
                    </div>
                  )
                })}
              </div>
            ) : <div className="common-empty">Pa prioritet për filtrin aktual.</div>}
          </div>
        </div>
      </div>

      {modalOpen ? (
        <div className="modal">
          <div className="modal-backdrop" onClick={() => setModalOpen(false)} />
          <div className="modal-card">
            <h4>Shto në Common View</h4>
            <form onSubmit={submitForm} style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label>Lloji</label>
                  <select value={formType} onChange={e => setFormType(e.target.value)} style={{ width: '100%', padding: 8 }}>
                    <option value="late">Vonesë</option>
                    <option value="absent">Mungesë</option>
                    <option value="leave">Pushim Vjetor</option>
                    <option value="feedback">Ankesë/Propozim</option>
                    <option value="gaNote">Shënim GA</option>
                  </select>
                </div>
                <div>
                  <label>Personi / Titulli</label>
                  <select value={formPerson} onChange={e=>setFormPerson(e.target.value)} style={{ width: '100%', padding: 8 }}>
                    <option value="">--</option>
                    {users.map(u => <option key={u.id || u.email || u.name} value={u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim()}>{u.name || `${u.first_name || ''} ${u.last_name || ''}`.trim()}</option>)}
                  </select>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label>Shënim</label>
                  <textarea value={formNote} onChange={e=>setFormNote(e.target.value)} style={{ width: '100%', padding: 8, minHeight: 80 }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button type="button" className="btn" onClick={() => setModalOpen(false)}>Anulo</button>
                <button type="submit" className="btn">Ruaj</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}



