"use client"

import * as React from "react"
import { useAuth } from "@/lib/auth"
import { formatDepartmentName } from "@/lib/department-name"
import type { User, Task, CommonEntry, GaNote, Department, Project } from "@/lib/types"

type CommonType = "late" | "absent" | "leave" | "ga" | "blocked" | "oneH" | "external" | "r1" | "feedback" | "priority"

type LateItem = { person: string; date: string; until: string; start?: string; note?: string }
type AbsentItem = { person: string; date: string; from: string; to: string; note?: string }
type LeaveItem = { person: string; startDate: string; endDate: string; fullDay: boolean; from?: string; to?: string; note?: string }
type GaNoteItem = { id: string; date: string; department: string; person?: string; note: string }
type BlockedItem = { title: string; person: string; date: string; note?: string }
type OneHItem = { title: string; person: string; date: string; note?: string }
type ExternalItem = { title: string; date: string; time: string; platform: string; owner: string }
type R1Item = { title: string; date: string; owner: string; note?: string }
type FeedbackItem = { title: string; person: string; date: string; note?: string }
type PriorityItem = { person: string; date: string; items: Array<{ project: string; task: string; level: string }> }

type SwimlaneCell = { title: string; subtitle?: string; accentClass?: string; placeholder?: boolean }
type SwimlaneRow = {
  id: CommonType
  label: string
  count: number
  headerClass: string
  badgeClass: string
  items: SwimlaneCell[]
}

type MeetingColumnKey = "nr" | "day" | "topic" | "check" | "owner" | "time"
type MeetingColumn = { key: MeetingColumnKey; label: string; width?: string }
type MeetingRow = { nr: number; day?: string; topic: string; owner?: string; time?: string }
type MeetingTemplate = {
  id: string
  title: string
  note?: string
  columns: MeetingColumn[]
  rows: MeetingRow[]
  defaultOwner?: string
  defaultTime?: string
}

const MEETING_TEMPLATES: MeetingTemplate[] = [
  {
    id: "tak-bord-ga",
    title: "TAK BORD/GA",
    defaultOwner: "DV",
    defaultTime: "8:00",
    columns: [
      { key: "nr", label: "NR", width: "52px" },
      { key: "topic", label: "M1 PIKAT" },
      { key: "check", label: "", width: "48px" },
      { key: "owner", label: "WHO", width: "90px" },
      { key: "time", label: "WHEN", width: "90px" },
    ],
    rows: [
      { nr: 1, topic: "MUNGESA/VONESA? A KEMI NDONJE MUNGESE QE E PRISH PLANIN?" },
      { nr: 2, topic: "A KA NDRYSHIME TE PLANIT/PRIORITETEVE?" },
      { nr: 3, topic: "KUSH ME CKA VAZHDON?" },
      { nr: 4, topic: "EMAIL PX? primex.eu@gmail.com (KONTROLLO EDHE SPAM)" },
      { nr: 5, topic: "EMAIL INFO PX? (KONTROLLO EDHE SPAM)" },
      { nr: 6, topic: "EMAIL HF? (KONTROLLO EDHE SPAM)" },
      { nr: 7, topic: "KOMENTET SHENIME GA" },
      { nr: 8, topic: "KOMENTET BORD" },
    ],
  },
  {
    id: "orders-0805",
    title: "ORDERS 08:05",
    note: "!!! MOS HARRO, SEND/RECEIVE MENJEHERE PAS HAPJES SE OUTLOOK! poczta.zenbox.pl",
    defaultOwner: "DM",
    defaultTime: "8:05",
    columns: [
      { key: "nr", label: "NR", width: "52px" },
      { key: "topic", label: "M1 PIKAT" },
      { key: "check", label: "", width: "48px" },
      { key: "owner", label: "WHO", width: "90px" },
      { key: "time", label: "WHEN", width: "90px" },
    ],
    rows: [
      { nr: 1, topic: "PIKAT NGA TEAMS DJE DHE SOT (!08:05-08:45 ORDERS HC)" },
      { nr: 2, topic: "A KA DET TE REJA DHE TAKIM TE RI NGA TAKIMI DHE A JANE SHPERNDARE DETYRAT? NESE PO, KERKO DATE???" },
      { nr: 3, topic: "CKA KEMI ME PERGADIT NGA PREZANTIMET SOT DHE NESER?" },
      { nr: 4, topic: "A ESHTE PRANUAR TAKIMI NGA TE GJITHE PARTICIPANTET?" },
      { nr: 5, topic: "A JANE VENDOSUR NE VEND PREZANTIMET NE CANVA/FILES?" },
      { nr: 6, topic: "A KEMI POROSI TE RE PER INTERLINE, CILI PRODUKT ESHTE, A ESHTE KRIJUAR ZO DHE TE PERCILLET PRODHIMI?" },
      { nr: 7, topic: "DISKUTOHEN EMAILAT E REJA" },
    ],
  },
  {
    id: "permbl-m1",
    title: "PERMBLEDHJA M1",
    defaultOwner: "LM/DM",
    defaultTime: "8:15",
    columns: [
      { key: "nr", label: "NR", width: "52px" },
      { key: "day", label: "DITA", width: "90px" },
      { key: "topic", label: "M1 PIKAT" },
      { key: "check", label: "", width: "48px" },
      { key: "owner", label: "WHO", width: "90px" },
      { key: "time", label: "WHEN", width: "90px" },
    ],
    rows: [
      { nr: 1, day: "E HENE", topic: "A ESHTE BERE KONTROLLI I TRANSFERIT TE THIRRJEVE NGA DE NE PRIMEX SIPAS TEMPLATE-IT" },
      { nr: 2, day: "E HENE", topic: "ME MUR?" },
      { nr: 3, day: "E HENE", topic: "A ESHTE BILANCI I GJENDJES X2 NE RREGULL?" },
      { nr: 4, day: "E HENE", topic: "MUNGESA/VONESA SOT: PX-NESE PO?" },
      { nr: 5, day: "CDO DITE", topic: "PUSHIM SOT: PX/HC/FD/HF" },
      { nr: 6, day: "CDO DITE", topic: "FESTA: PASNESER/NESER/SOT: PX/HC/FD/HF/USA - NESE PO? / NESE KA DUHET TE" },
      { nr: 7, day: "CDO DITE", topic: "LAJMROHEN KLIENTAT 1 JAVE ME HERET" },
      { nr: 8, day: "CDO DITE", topic: "FESTA JAVA E ARDHSHME PX/PL/DE/USA" },
      { nr: 9, day: "CDO DITE", topic: "TAKIME NGA KALENDARI SOT / NESER (A KA TAKIME TE JASHTME?)" },
      { nr: 10, day: "E HENE", topic: "PRINTERI COLOR B&W" },
      { nr: 11, day: "CDO DITE", topic: "ANKESA" },
      { nr: 12, day: "CDO DITE", topic: "KERKESA" },
      { nr: 13, day: "CDO DITE", topic: "PROPOZIME" },
      { nr: 14, day: "CDO DITE", topic: "PIKA TE PERBASHKETA" },
    ],
  },
  {
    id: "takim-staf",
    title: "TAKIMI ME STAF PER SQARIMIN E DET & NE FUND ME GA",
    defaultOwner: "DV",
    defaultTime: "8:30",
    columns: [
      { key: "nr", label: "NR", width: "52px" },
      { key: "topic", label: "M1 PIKAT" },
      { key: "check", label: "", width: "48px" },
      { key: "owner", label: "WHO", width: "90px" },
      { key: "time", label: "WHEN", width: "90px" },
    ],
    rows: [
      { nr: 1, topic: "BZ PROJEKTET/SECILI INDIVIDUALISHT (BLIC DETYRAT)" },
      { nr: 2, topic: "TT/VS/MST PRJK/MST FOTO/SMM" },
      { nr: 3, topic: "KUSH NUK ESHTE BRENDA PLANIT & A KA PASUR PROBLEME?" },
      { nr: 4, topic: "BZ PERMBLEDHJA ME GA (FIZIKISHT)- A KA DICKA TE RE QE KA SHTU GA NE PERMBLEDHJE?" },
      { nr: 5, topic: "SOT/R1/1H, BLOK?" },
      { nr: 6, topic: "SQARO DETYRA TE REJA TE SHPEJTA QE KRYHEN BRENDA DITES?" },
      { nr: 7, topic: "A PRITET DICKA NE PAUZE PER KONTROLLE GA NGA ZHVILLIMI/PROJEKTET?" },
    ],
  },
  {
    id: "permbl-m2",
    title: "PERMBLEDHJA M2",
    defaultOwner: "DV",
    defaultTime: "11:50",
    columns: [
      { key: "nr", label: "NR", width: "52px" },
      { key: "topic", label: "M2 PIKAT" },
      { key: "check", label: "", width: "48px" },
      { key: "owner", label: "WHO", width: "90px" },
      { key: "time", label: "WHEN", width: "90px" },
    ],
    rows: [
      { nr: 1, topic: "PERSONALISHT SHENIMET GA?" },
      { nr: 2, topic: "DETYRAT PERSONALISHT 1H/R1/SOT TE KRYERA DHE TE BZ" },
      { nr: 3, topic: "URGJENCA/PROBLEME/1H!!!" },
      { nr: 4, topic: "A JEMI BRENDA PLANIT ME PROJEKTE/DIZAJN?" },
      { nr: 5, topic: "A KA DETYRA TE SHPEJTA QE KRYHEN BRENDA DITES, PER BARAZIM AM?" },
      { nr: 6, topic: "A KA DETYRA TE REJA NGA TAKIMET EKSTERNE DHE A JANE SHPERNDARE DETYRA DHE A JANE VENDOSUR NE VEND PREZANTIMET NE CANVA/FILES?" },
      { nr: 7, topic: "A KA TAKIME TE REJA, KERKO DATEN E TAKIMIT TE RI?" },
      { nr: 8, topic: "EMAIL/TAKIME A KA KERKESA TE REJA DICKA JASHTE STANDARDEVE" },
      { nr: 9, topic: "PIKAT E BORDIT" },
    ],
  },
  {
    id: "permbl-pauze",
    title: "PERMBLEDHJA PAS PAUZES",
    defaultOwner: "DV",
    defaultTime: "13:15",
    columns: [
      { key: "nr", label: "NR", width: "52px" },
      { key: "topic", label: "PIKAT" },
      { key: "check", label: "", width: "48px" },
      { key: "owner", label: "WHO", width: "90px" },
      { key: "time", label: "WHEN", width: "90px" },
    ],
    rows: [
      { nr: 1, topic: "(GA) DET NGA EMAIL/ PX INFO" },
      { nr: 2, topic: "PROJEKTET: ATO QE KEMI PUNU DHE SKEMI PUNU" },
      { nr: 3, topic: "A JEMI BRENDA PLANIT ME PROJEKTE/DIZAJN?" },
      { nr: 4, topic: "(GA)SHENIME GA- PIKAT PAS PAUZE" },
      { nr: 5, topic: "REPLY GA (DET. NGA STAFI) KOMENTE" },
      { nr: 6, topic: "(GA) A KA REPLY NGA GA TEK DETYRAT NGA STAFI PER GA?" },
      { nr: 7, topic: "(GA) PIKAT E BORDIT" },
      { nr: 8, topic: "(GA) PIKAT E BORDIT" },
    ],
  },
  {
    id: "permbl-1530",
    title: "PERMBLEDHJA 15:30",
    defaultOwner: "DV ME GA",
    defaultTime: "15:45",
    columns: [
      { key: "nr", label: "NR", width: "52px" },
      { key: "topic", label: "M3 PIKAT" },
      { key: "check", label: "", width: "48px" },
      { key: "owner", label: "WHO", width: "90px" },
      { key: "time", label: "WHEN", width: "90px" },
    ],
    rows: [
      {
        nr: 1,
        topic:
          "BZ INDIVIDUALISHT ME SECILIN: 1. A JEMI BRENDA PLANIT? 2. SA PRODUKTE KOLONA JANE KRYER? 3. A KA PASUR NDRYSHIM TE PLANIT? 4. ME CKA VAZHDOHET NESER? 5. A JANE BERE DONE DETYRAT SE BASHKU ME PERGJEGJES?",
        owner: "DV ME STAF",
        time: "3:30 PM",
      },
      { nr: 2, topic: "PARREGULLSITE DHE DETYRAT SOT PER SOT (DISKUTOHEN EDHE WHEN ESHTE GA E NXENE)" },
      { nr: 3, topic: "URGJENCAT" },
      { nr: 4, topic: "MUST SOT" },
      { nr: 5, topic: "BZ SHENIME \\ DETYRAT PERSONALISHT" },
      { nr: 6, topic: "BZ PROGRESI TEK PROJEKTET? SA PRODUKTE/KOLONA JANE PERFUNDUAR?" },
      { nr: 7, topic: "A KA DETYRA TE SHPEJTA QE KRYHEN BRENDA DITES, PER BARAZIM PM?" },
      { nr: 8, topic: "A KA DETYRA TE REJA NGA TAKIMET EKSTERNE DHE A JANE SHPERNDARE DETYRA DHE A JANE VENDOSUR NE VEND PREZANTIMET NE CANVA/FILES?" },
      { nr: 9, topic: "NESE NUK MBAHET TAKIMI 16:20, DISKUTOHEN EDHE DET CKA JANE ME RENDESI PER NESER?" },
      { nr: 10, topic: "EMAIL/TAKIME A KA KERKESA TE REJA DICKA JASHTE STANDARDEVE" },
    ],
  },
  {
    id: "mbyllja-dites",
    title: "MBYLLJA E DITES",
    defaultOwner: "DV",
    defaultTime: "16:20",
    columns: [
      { key: "nr", label: "NR", width: "52px" },
      { key: "topic", label: "PIKAT" },
      { key: "check", label: "", width: "48px" },
      { key: "owner", label: "WHO", width: "90px" },
      { key: "time", label: "WHEN", width: "90px" },
    ],
    rows: [
      { nr: 1, topic: "MBINGARKESE NESER (NESE PO PROPOZIM PER RIORGANIZIM)" },
      { nr: 2, topic: "NENGARKESE NESER" },
      { nr: 3, topic: "MUST NESER + DET. PERSONALSHT(TRELLO)" },
      { nr: 4, topic: "DET PER NESER ME PRIORITET: PSH JAVORET, TAKIMET EXT" },
      { nr: 5, topic: "DET NE PROCES SISTEMIT (RD/93)" },
      { nr: 6, topic: "DET. PA PROGRES (TRELLO NOT DONE?)" },
      { nr: 7, topic: "TAKIMET PA KRY (KONTROLLO TRELLO)" },
      { nr: 8, topic: "NESER ME GA (KOF/takime/ankesa/kerkesa/propozime):" },
    ],
  },
]

export default function CommonViewPage() {
  const { apiFetch, user } = useAuth()

  // Utils
  const pad2 = (n: number) => String(n).padStart(2, "0")
  const toISODate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  const fromISODate = (s: string) => {
    const [y, m, d] = s.split("-").map(Number)
    return new Date(y, m - 1, d)
  }
  const addDays = (d: Date, n: number) => {
    const x = new Date(d)
    x.setDate(x.getDate() + n)
    return x
  }
  const getMonday = (d: Date) => {
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const day = date.getDay()
    const diff = (day === 0 ? -6 : 1) - day
    date.setDate(date.getDate() + diff)
    return date
  }
  const getWeekdays = (monday: Date) => [0, 1, 2, 3, 4].map((i) => addDays(monday, i))
  const formatDateHuman = (s: string) => {
    const d = fromISODate(s)
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`
  }
  const alWeekdayShort = (d: Date) => {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    return days[d.getDay()]
  }

  // State
  const [users, setUsers] = React.useState<User[]>([])
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [commonData, setCommonData] = React.useState({
    late: [] as LateItem[],
    absent: [] as AbsentItem[],
    leave: [] as LeaveItem[],
    gaNotes: [] as GaNoteItem[],
    blocked: [] as BlockedItem[],
    oneH: [] as OneHItem[],
    external: [] as ExternalItem[],
    r1: [] as R1Item[],
    feedback: [] as FeedbackItem[],
    priority: [] as PriorityItem[],
  })
  const [dataLoaded, setDataLoaded] = React.useState(false)

  const [weekStart, setWeekStart] = React.useState<Date>(() => getMonday(new Date()))
  const [selectedDates, setSelectedDates] = React.useState<Set<string>>(new Set())
  const [multiMode, setMultiMode] = React.useState(false)
  const [typeFilters, setTypeFilters] = React.useState<Set<CommonType>>(new Set())
  const [typeMultiMode, setTypeMultiMode] = React.useState(false)

  // Modal state
  const [modalOpen, setModalOpen] = React.useState(false)
  const [gaModalOpen, setGaModalOpen] = React.useState(false)
  const [formType, setFormType] = React.useState<"late" | "absent" | "leave" | "feedback" | "gaNote">("late")
  const [formPerson, setFormPerson] = React.useState("")
  const [formDate, setFormDate] = React.useState(toISODate(new Date()))
  const [formDelayStart, setFormDelayStart] = React.useState("08:00")
  const [formUntil, setFormUntil] = React.useState("09:00")
  const [formFrom, setFormFrom] = React.useState("08:00")
  const [formTo, setFormTo] = React.useState("12:00")
  const [formEndDate, setFormEndDate] = React.useState("")
  const [formFullDay, setFormFullDay] = React.useState(true)
  const [formTitle, setFormTitle] = React.useState("")
  const [formNote, setFormNote] = React.useState("")
  const [formDept, setFormDept] = React.useState("All")
  const [gaAudience, setGaAudience] = React.useState<"all" | "department" | "person">("department")
  const [meetingPanelOpen, setMeetingPanelOpen] = React.useState(false)
  const [activeMeetingId, setActiveMeetingId] = React.useState(() => MEETING_TEMPLATES[0]?.id || "")

  // Derived
  const weekISOs = React.useMemo(() => getWeekdays(weekStart).map(toISODate), [weekStart])
  const resolveUserByLabel = React.useCallback(
    (label: string) =>
      users.find(
        (u) => u.full_name === label || u.username === label || u.email === label || `${u.full_name || ""}`.trim() === label
      ),
    [users]
  )
  const activeMeeting = React.useMemo(
    () => MEETING_TEMPLATES.find((template) => template.id === activeMeetingId) || null,
    [activeMeetingId]
  )
  const boardMeetingIds = React.useMemo(() => {
    if (!MEETING_TEMPLATES.length) return []
    const firstId = MEETING_TEMPLATES[0]?.id
    const lastId = MEETING_TEMPLATES[MEETING_TEMPLATES.length - 1]?.id
    const boardIds = new Set([firstId, lastId, "permbl-pauze"])
    return MEETING_TEMPLATES.map((m) => m.id).filter((id) => boardIds.has(id))
  }, [])
  const staffMeetingIds = React.useMemo(
    () => MEETING_TEMPLATES.map((m) => m.id).filter((id) => !boardMeetingIds.includes(id)),
    [boardMeetingIds]
  )
  const mergeOwnerColumn = React.useMemo(() => {
    if (!activeMeeting) return false
    const hasOwner = Boolean(activeMeeting.defaultOwner) || activeMeeting.rows.some((row) => row.owner)
    if (!hasOwner) return false
    return activeMeeting.rows.every((row, idx) => !row.owner || idx === 0)
  }, [activeMeeting])

  // Load data on mount
  React.useEffect(() => {
    let mounted = true
    async function load() {
      try {
        // Initialize all data buckets
        const allData = {
          late: [] as LateItem[],
          absent: [] as AbsentItem[],
          leave: [] as LeaveItem[],
          gaNotes: [] as GaNoteItem[],
          blocked: [] as BlockedItem[],
          oneH: [] as OneHItem[],
          external: [] as ExternalItem[],
          r1: [] as R1Item[],
          feedback: [] as FeedbackItem[],
          priority: [] as PriorityItem[],
        }

        // Load users and departments first
        const [uRes, depsRes] = await Promise.all([
          apiFetch("/users"),
          apiFetch("/departments")
        ])
        let loadedUsers: User[] = []
        let loadedDepartments: Department[] = []
        let projectNameById = new Map<string, string>()
        if (uRes?.ok) {
          loadedUsers = (await uRes.json()) as User[]
          if (mounted) setUsers(loadedUsers)
        }
        if (depsRes?.ok) {
          loadedDepartments = (await depsRes.json()) as Department[]
          if (mounted) setDepartments(loadedDepartments)
        }
        const projectsEndpoint =
          user?.role && user.role !== "STAFF"
            ? "/projects?include_all_departments=true"
            : "/projects"
        const projectsRes = await apiFetch(projectsEndpoint)
        if (projectsRes?.ok) {
          const projects = (await projectsRes.json()) as Project[]
          projectNameById = new Map(
            projects.map((p) => [p.id, (p.title || p.name || "").trim()]).filter(([, label]) => label)
          )
        }

        // Load common entries
        const ceRes = await apiFetch("/common-entries")
        if (ceRes?.ok) {
          const entries = (await ceRes.json()) as CommonEntry[]

          for (const e of entries) {
            // Prioritize assigned user, fallback to creator, then title
            let user = loadedUsers.find((u) => u.id === e.assigned_to_user_id)
            if (!user) {
              user = loadedUsers.find((u) => u.id === e.created_by_user_id)
            }
            const personName = user?.full_name || user?.username || e.title || "Unknown"
            const date = toISODate(new Date(e.created_at))

            if (e.category === "Delays") {
              // Parse until time from description
              let until = "09:00"
              let start = "08:00"
              let note = e.description || ""
              const startMatch = note.match(/Start:\s*(\d{1,2}:\d{2})/i)
              if (startMatch) {
                start = startMatch[1]
                note = note.replace(/Start:\s*\d{1,2}:\d{2}/i, "").trim()
              }
              const untilMatch = note.match(/Until:\s*(\d{1,2}:\d{2})/i)
              if (untilMatch) {
                until = untilMatch[1]
                note = note.replace(/Until:\s*\d{1,2}:\d{2}/i, "").trim()
              }
              // Remove date from note if present
              note = note.replace(/Date:\s*\d{4}-\d{2}-\d{2}/i, "").trim()
              
              allData.late.push({
                person: personName,
                date,
                until,
                start,
                note: note || undefined,
              })
            } else if (e.category === "Absences") {
              // Parse from/to times from description
              let from = "08:00"
              let to = "23:00"
              let note = e.description || ""
              const fromToMatch = note.match(/From:\s*(\d{1,2}:\d{2})\s*-\s*To:\s*(\d{1,2}:\d{2})/i)
              if (fromToMatch) {
                from = fromToMatch[1]
                to = fromToMatch[2]
                note = note.replace(/From:\s*\d{1,2}:\d{2}\s*-\s*To:\s*\d{1,2}:\d{2}/i, "").trim()
              }
              // Remove date from note if present
              note = note.replace(/Date:\s*\d{4}-\d{2}-\d{2}/i, "").trim()
              
              allData.absent.push({
                person: personName,
                date,
                from,
                to,
                note: note || undefined,
              })
            } else if (e.category === "Annual Leave") {
              // Parse leave information from description
              let startDate = date
              let endDate = date
              let fullDay = true
              let from = ""
              let to = ""
              let note = e.description || ""
              const dateMatches = note.match(/\d{4}-\d{2}-\d{2}/g) || []
              
              // Parse date range
              const dateRangeMatch = note.match(/Date range:\s*(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/i)
              if (dateRangeMatch) {
                startDate = dateRangeMatch[1]
                endDate = dateRangeMatch[2]
                note = note.replace(/Date range:\s*\d{4}-\d{2}-\d{2}\s+to\s+\d{4}-\d{2}-\d{2}/i, "").trim()
              } else {
                const dateMatch = note.match(/Date:\s*(\d{4}-\d{2}-\d{2})/i)
                if (dateMatch) {
                  startDate = dateMatch[1]
                  endDate = dateMatch[1]
                  note = note.replace(/Date:\s*\d{4}-\d{2}-\d{2}/i, "").trim()
                } else if (dateMatches.length) {
                  const firstDate = dateMatches[0] ?? date
                  const secondDate = dateMatches[1] ?? firstDate
                  startDate = firstDate
                  endDate = secondDate
                }
              }
              
              // Parse full day or time range
              if (note.includes("Full day")) {
                fullDay = true
                note = note.replace(/\(Full day\)/i, "").trim()
              } else {
                const timeMatch = note.match(/\((\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\)/i)
                if (timeMatch) {
                  fullDay = false
                  from = timeMatch[1]
                  to = timeMatch[2]
                  note = note.replace(/\(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\)/i, "").trim()
                }
              }
              
              allData.leave.push({
                person: personName,
                startDate,
                endDate,
                fullDay,
                from: from || undefined,
                to: to || undefined,
                note: note || undefined,
              })
            } else if (e.category === "Blocks") {
              allData.blocked.push({
                title: e.title,
                person: personName,
                date,
                note: e.description || undefined,
              })
            } else if (e.category === "External Tasks") {
              allData.external.push({
                title: e.title,
                date,
                time: "14:00",
                platform: "Zoom",
                owner: personName,
              })
            } else if (e.category === "Complaints" || e.category === "Requests" || e.category === "Proposals") {
              allData.feedback.push({
                title: e.title,
                person: personName,
                date,
                note: e.description || undefined,
              })
            }
          }
        }

        // Load GA notes
        const gaRes = await apiFetch("/ga-notes")
        if (gaRes?.ok) {
          const gaData = (await gaRes.json()) as GaNote[]
          allData.gaNotes = gaData.map((n) => {
            const user = n.created_by ? loadedUsers.find((u) => u.id === n.created_by) : null
            const dateStr = n.start_date ? toISODate(new Date(n.start_date)) : toISODate(new Date(n.created_at))
            const departmentName = n.department_id
              ? loadedDepartments.find((d) => d.id === n.department_id)?.name || n.department_id
              : "All"
            
            return {
              id: n.id,
              date: dateStr,
              department: departmentName,
              person: user?.full_name || user?.username || undefined,
              note: n.content || "",
            }
          })
        }

        // Load tasks for blocked, 1H, R1, external, and priority
        const tasksEndpoint =
          user?.role && user.role !== "STAFF"
            ? "/tasks?include_done=true&include_all_departments=true"
            : "/tasks?include_done=true"
        const tasksRes = await apiFetch(tasksEndpoint)
        if (tasksRes?.ok) {
          const tasks = (await tasksRes.json()) as Task[]
          const today = toISODate(new Date())

          const priorityMap = new Map<string, PriorityItem>()

          for (const t of tasks) {
            const assigneeId = t.assigned_to || t.assignees?.[0]?.id || t.assigned_to_user_id || null
            const assignee = t.assignees?.[0] || (assigneeId ? loadedUsers.find((u) => u.id === assigneeId) : null)
            const ownerName = assignee?.full_name || assignee?.username || "Unknown"
            const taskDateSource = t.planned_for || t.due_date || t.start_date || t.created_at
            const taskDate = taskDateSource ? toISODate(new Date(taskDateSource)) : today

            if (t.is_bllok) {
              allData.blocked.push({
                title: t.title,
                person: ownerName,
                date: taskDate,
                note: t.description || undefined,
              })
            }
            if (t.is_1h_report) {
              allData.oneH.push({
                title: t.title,
                person: ownerName,
                date: taskDate,
                note: t.description || undefined,
              })
            }
            if (t.is_r1) {
              allData.r1.push({
                title: t.title,
                date: taskDate,
                owner: ownerName,
                note: t.description || undefined,
              })
            }
            if (t.task_type === "adhoc" && t.project_id) {
              allData.external.push({
                title: t.title,
                date: taskDate,
                time: "14:00",
                platform: "Zoom",
                owner: ownerName,
              })
            }

            // Priority items
            if (t.project_id && assigneeId) {
              const key = `${ownerName}-${taskDate}`
              if (!priorityMap.has(key)) {
                priorityMap.set(key, {
                  person: ownerName,
                  date: taskDate,
                  items: [],
                })
              }
              priorityMap.get(key)!.items.push({
                project: projectNameById.get(t.project_id) || `Project ${t.project_id?.slice(0, 8)}`,
                task: t.title,
                level: t.priority || "NORMAL",
              })
            }
          }
          
          allData.priority = Array.from(priorityMap.values())
        }

        // Single state update with all data
        if (mounted) {
          setCommonData(allData)
        }

        // Select today by default
        if (mounted && selectedDates.size === 0) {
          setSelectedDates(new Set([toISODate(new Date())]))
        }
        
        // Mark data as loaded
        if (mounted) {
          setDataLoaded(true)
        }
      } catch (err) {
        console.error("Failed to load common view data", err)
      }
    }
    void load()
    return () => {
      mounted = false
    }
  }, [apiFetch, user?.role])

  React.useEffect(() => {
    if (formType === "leave" && !formFullDay) {
      setFormFullDay(true)
    }
  }, [formType, formFullDay])

  React.useEffect(() => {
    if (formType !== "gaNote" || gaAudience !== "person") return
    if (!formPerson) return
    const selectedUser = resolveUserByLabel(formPerson)
    if (!selectedUser?.department_id) {
      setFormDept("All")
      return
    }
    const dept = departments.find((d) => d.id === selectedUser.department_id)
    setFormDept(dept?.name || "All")
  }, [formType, gaAudience, formPerson, departments, resolveUserByLabel])

  // Filter helpers
  const inSelectedDates = (dateStr: string) => !selectedDates.size || selectedDates.has(dateStr)
  const leaveCovers = (leave: LeaveItem, dateStr: string) => {
    return dateStr >= leave.startDate && dateStr <= leave.endDate
  }

  // Filtered data
  const filtered = React.useMemo(() => {
    const late = commonData.late.filter((x) => inSelectedDates(x.date))
    const absent = commonData.absent.filter((x) => inSelectedDates(x.date))
    const leave = commonData.leave.filter((x) =>
      selectedDates.size ? Array.from(selectedDates).some((d) => leaveCovers(x, d)) : true
    )
    const ga = commonData.gaNotes.filter((x) => inSelectedDates(x.date))
    const blocked = commonData.blocked.filter((x) => inSelectedDates(x.date))
    const oneH = commonData.oneH.filter((x) => inSelectedDates(x.date))
    const external = commonData.external.filter((x) => inSelectedDates(x.date))
    const r1 = commonData.r1.filter((x) => inSelectedDates(x.date))
    const feedback = commonData.feedback.filter((x) => inSelectedDates(x.date))
    const priority = commonData.priority.filter((p) =>
      selectedDates.size ? Array.from(selectedDates).includes(p.date) : true
    )

    return { late, absent, leave, ga, blocked, oneH, external, r1, feedback, priority }
  }, [commonData, selectedDates])

  // Common people for priority (from users)
  const commonPeople = React.useMemo(() => {
    return users
      .filter((u) => u.role !== "STAFF" || u.department_id)
      .slice(0, 4)
      .map((u) => u.full_name || u.username || "Unknown")
  }, [users])

  // Handlers
  const toggleDay = (iso: string) => {
    setSelectedDates((prev) => {
      const s = new Set(prev)
      if (!multiMode) {
        s.clear()
      }
      if (s.has(iso)) {
        if (s.size === 1) return s
        s.delete(iso)
      } else {
        s.add(iso)
      }
      return s
    })
  }

  const setTypeFilter = (type: CommonType | "all") => {
    if (type === "all") {
      setTypeFilters(new Set())
    } else if (!typeMultiMode) {
      setTypeFilters(new Set([type]))
    } else {
      setTypeFilters((prev) => {
        const s = new Set(prev)
        if (s.has(type)) {
          s.delete(type)
        } else {
          s.add(type)
        }
        return s
      })
    }
  }

  const selectAll = () => {
    if (!multiMode) {
      setMultiMode(true)
    }
    setSelectedDates(new Set(weekISOs))
  }

  const selectToday = () => {
    const today = new Date()
    setWeekStart(getMonday(today))
    setSelectedDates(new Set([toISODate(today)]))
  }

  const handlePrint = () => {
    window.print()
  }

  const setWeek = (dateStr: string) => {
    const base = dateStr ? fromISODate(dateStr) : new Date()
    const monday = getMonday(base)
    setWeekStart(monday)
    const weekISO = getWeekdays(monday).map(toISODate)
    setSelectedDates((prev) => {
      const filtered = Array.from(prev).filter((d) => weekISO.includes(d))
      return filtered.length ? new Set(filtered) : new Set([weekISO[0]])
    })
  }

  const openModal = (type?: "gaNote") => {
    if (type === "gaNote") {
      setFormType("gaNote")
      setGaAudience("department")
      setFormPerson("")
      // Set default department to user's department or first available
      if (user?.department_id) {
        const userDept = departments.find(d => d.id === user.department_id)
        setFormDept(userDept?.name || (departments.length > 0 ? departments[0].name : "All"))
      } else if (departments.length > 0) {
        setFormDept(departments[0].name)
      } else {
        setFormDept("All")
      }
      setFormNote("")
      setFormDate(toISODate(new Date()))
      setGaModalOpen(true)
    } else {
      setModalOpen(true)
    }
  }

  const closeModal = () => {
    setModalOpen(false)
    setGaModalOpen(false)
    // Reset form
    setFormType("late")
    setFormPerson("")
    setFormDate(toISODate(new Date()))
    setFormDelayStart("08:00")
    setFormUntil("09:00")
    setFormFrom("08:00")
    setFormTo("12:00")
    setFormEndDate("")
    setFormFullDay(true)
    setFormTitle("")
    setFormNote("")
    setFormDept("All")
    setGaAudience("department")
  }

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      if (formType === "gaNote") {
        if (!formNote.trim()) {
          alert("Note content is required")
          return
        }
        
        // Resolve audience/department for GA notes
        let departmentId: string | null = null
        let createdByUserId: string | undefined = undefined

        if (gaAudience === "all") {
          departmentId = null
        } else if (gaAudience === "person") {
          if (!formPerson) {
            alert("Please select a user.")
            return
          }
          const selectedUser = resolveUserByLabel(formPerson)
          if (!selectedUser) {
            alert("Selected user not found. Please select a valid user.")
            return
          }
          if (!selectedUser.department_id) {
            alert("Selected user has no department assigned.")
            return
          }
          departmentId = selectedUser.department_id
          createdByUserId = selectedUser.id
        } else {
          const dept = departments.find((d) => d.name === formDept)
          if (!dept) {
            alert("Please select a valid department.")
            return
          }
          departmentId = dept.id
        }
        
        // Format date as ISO datetime string (backend expects datetime with time)
        // Use start of day in UTC
        const dateObj = new Date(formDate)
        dateObj.setHours(0, 0, 0, 0)
        const startDate = dateObj.toISOString()
        
        const payload: any = {
          content: formNote.trim(),
          start_date: startDate,
        }

        if (departmentId) {
          payload.department_id = departmentId
        }
        
        // Only include created_by if a user was selected
        if (createdByUserId) {
          payload.created_by = createdByUserId
        }
        
        const res = await apiFetch("/ga-notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        
        if (res.ok) {
          closeModal()
          // Reload all data to show the new GA note
          window.location.reload()
        } else {
          // Show error message
          try {
            const errorData = await res.json()
            alert(errorData.detail || "Failed to create GA note. Please check your department selection.")
          } catch {
            alert("Failed to create GA note. Please try again.")
          }
        }
      } else {
        let category: string
        if (formType === "late") category = "Delays"
        else if (formType === "absent") category = "Absences"
        else if (formType === "leave") category = "Annual Leave"
        else category = "Requests"

        // Find the user by name if person is selected
        let assignedUserId: string | null = null
        if (formPerson && formType !== "feedback") {
          const selectedUser = users.find(
            (u) =>
              u.full_name === formPerson ||
              u.username === formPerson ||
              u.email === formPerson ||
              `${u.full_name || ""}`.trim() === formPerson
          )
          if (selectedUser) {
            assignedUserId = selectedUser.id
          }
        }

        // Build description with all relevant information
        let description = formNote || ""
        
        // Add time/date information based on type
        if (formType === "late") {
          const startTime = formDelayStart || "08:00"
          const startLine = `Start: ${startTime}`
          const endLine = formUntil ? `Until: ${formUntil}` : ""
          const delayLines = endLine ? `${startLine}\n${endLine}` : startLine
          description = description ? `${description}\n\n${delayLines}` : delayLines
        } else if (formType === "absent" && formFrom && formTo) {
          description = description ? `${description}\n\nFrom: ${formFrom} - To: ${formTo}` : `From: ${formFrom} - To: ${formTo}`
        } else if (formType === "leave") {
          const leaveInfo =
            formEndDate && formEndDate !== formDate
              ? `Date range: ${formDate} to ${formEndDate}`
              : `Date: ${formDate}`
          description = description ? `${description}\n\n${leaveInfo}` : leaveInfo
        }
        
        // Add date information
        if (formDate && formType !== "leave") {
          description = description ? `${description}\nDate: ${formDate}` : `Date: ${formDate}`
        }

        // Create the entry
        const res = await apiFetch("/common-entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category,
            title: formType === "feedback" ? formTitle : formPerson || "Untitled",
            description: description || null,
          }),
        })

        if (res.ok) {
          const createdEntry = (await res.json()) as CommonEntry

          // If we have a user to assign, assign them
          if (assignedUserId && createdEntry.id) {
            await apiFetch(`/common-entries/${createdEntry.id}/assign`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                assigned_to_user_id: assignedUserId,
              }),
            })
          }

          // Trigger a reload
          window.location.reload()
        }
      }
      closeModal()
    } catch (err) {
      console.error("Failed to submit form", err)
    }
  }

  const showCard = (type: CommonType) => {
    if (typeFilters.size === 0) return true
    return typeFilters.has(type)
  }

  const buildSwimlaneCells = (items: SwimlaneCell[]) => {
    const baseItems = items.length ? items : [{ title: "No data available.", placeholder: true }]
    const totalCells = Math.max(3, Math.ceil(baseItems.length / 3) * 3)
    return [
      ...baseItems,
      ...Array.from({ length: totalCells - baseItems.length }, () => null),
    ]
  }


  const swimlaneRows = React.useMemo<SwimlaneRow[]>(() => {
    const lateItems: SwimlaneCell[] = filtered.late.map((x) => ({
      title: x.person,
      subtitle: `${x.start || "08:00"}-${x.until} - ${formatDateHuman(x.date)}${x.note ? ` - ${x.note}` : ""}`,
      accentClass: "swimlane-accent delay",
    }))
    const absentItems: SwimlaneCell[] = filtered.absent.map((x) => ({
      title: x.person,
      subtitle: `${x.from} - ${x.to} - ${formatDateHuman(x.date)}${x.note ? ` - ${x.note}` : ""}`,
      accentClass: "swimlane-accent absence",
    }))
    const leaveItems: SwimlaneCell[] = filtered.leave.map((x) => {
      const isRange = x.endDate && x.endDate !== x.startDate
      const dateLabel = isRange
        ? `${formatDateHuman(x.startDate)} - ${formatDateHuman(x.endDate)}`
        : formatDateHuman(x.startDate)
      const timeLabel = x.fullDay
        ? "Full day"
        : `${x.from || ""}${x.from && x.to ? " - " : ""}${x.to || ""}`.trim()
      return {
        title: x.person,
        subtitle: `${timeLabel} - ${dateLabel}${x.note ? ` - ${x.note}` : ""}`,
        accentClass: "swimlane-accent leave",
      }
    })
    const blockedItems: SwimlaneCell[] = filtered.blocked.map((x) => ({
      title: x.title,
      subtitle: `Owner: ${x.person} - ${formatDateHuman(x.date)}${x.note ? ` - ${x.note}` : ""}`,
      accentClass: "swimlane-accent blocked",
    }))
    const oneHItems: SwimlaneCell[] = filtered.oneH.map((x) => ({
      title: x.title,
      subtitle: `Owner: ${x.person} - ${formatDateHuman(x.date)}${x.note ? ` - ${x.note}` : ""}`,
      accentClass: "swimlane-accent oneh",
    }))
    const gaItems: SwimlaneCell[] = filtered.ga.map((x) => ({
      title: x.person || (x.department === "All" ? "All employees" : x.department),
      subtitle: `${formatDateHuman(x.date)} - ${x.note}`,
      accentClass: "swimlane-accent ga",
    }))
    const externalItems: SwimlaneCell[] = filtered.external.map((x) => ({
      title: x.title,
      subtitle: `${x.time} - ${formatDateHuman(x.date)} - ${x.platform} - ${x.owner}`,
      accentClass: "swimlane-accent external",
    }))
    const r1Items: SwimlaneCell[] = filtered.r1.map((x) => ({
      title: x.title,
      subtitle: `Owner: ${x.owner} - ${formatDateHuman(x.date)}${x.note ? ` - ${x.note}` : ""}`,
      accentClass: "swimlane-accent r1",
    }))
    const feedbackItems: SwimlaneCell[] = filtered.feedback.map((x) => ({
      title: x.title,
      subtitle: `${x.person} - ${formatDateHuman(x.date)}${x.note ? ` - ${x.note}` : ""}`,
      accentClass: "swimlane-accent feedback",
    }))
    const priorityItems: SwimlaneCell[] = filtered.priority.flatMap((p) =>
      p.items.map((item) => ({
        title: `${p.person} - ${item.project}`,
        subtitle: `${item.task} (${item.level}) - ${formatDateHuman(p.date)}`,
        accentClass: "swimlane-accent priority",
      }))
    )

    return [
      {
        id: "late",
        label: "Delays",
        count: filtered.late.length,
        headerClass: "swimlane-header delay",
        badgeClass: "swimlane-badge delay",
        items: lateItems,
      },
      {
        id: "absent",
        label: "Absences",
        count: filtered.absent.length,
        headerClass: "swimlane-header absence",
        badgeClass: "swimlane-badge absence",
        items: absentItems,
      },
      {
        id: "leave",
        label: "Annual Leave",
        count: filtered.leave.length,
        headerClass: "swimlane-header leave",
        badgeClass: "swimlane-badge leave",
        items: leaveItems,
      },
      {
        id: "ga",
        label: "GA Notes",
        count: filtered.ga.length,
        headerClass: "swimlane-header ga",
        badgeClass: "swimlane-badge ga",
        items: gaItems,
      },
      {
        id: "blocked",
        label: "Blocked",
        count: filtered.blocked.length,
        headerClass: "swimlane-header blocked",
        badgeClass: "swimlane-badge blocked",
        items: blockedItems,
      },
      {
        id: "oneH",
        label: "1H Tasks",
        count: filtered.oneH.length,
        headerClass: "swimlane-header oneh",
        badgeClass: "swimlane-badge oneh",
        items: oneHItems,
      },
      {
        id: "external",
        label: "External Meetings",
        count: filtered.external.length,
        headerClass: "swimlane-header external",
        badgeClass: "swimlane-badge external",
        items: externalItems,
      },
      {
        id: "r1",
        label: "R1",
        count: filtered.r1.length,
        headerClass: "swimlane-header r1",
        badgeClass: "swimlane-badge r1",
        items: r1Items,
      },
      {
        id: "feedback",
        label: "Complaints/Requests/Proposals",
        count: filtered.feedback.length,
        headerClass: "swimlane-header feedback",
        badgeClass: "swimlane-badge feedback",
        items: feedbackItems,
      },
      {
        id: "priority",
        label: "Tasks",
        count: filtered.priority.reduce((sum, p) => sum + p.items.length, 0),
        headerClass: "swimlane-header priority",
        badgeClass: "swimlane-badge priority",
        items: priorityItems,
      },
    ]
  }, [filtered])

  const swimlaneRowRefs = React.useRef<Record<string, HTMLDivElement | null>>({})
  const scrollSwimlaneRow = React.useCallback((rowId: CommonType, direction: "left" | "right") => {
    const node = swimlaneRowRefs.current[rowId]
    if (!node) return
    const delta = direction === "left" ? -320 : 320
    node.scrollBy({ left: delta, behavior: "smooth" })
  }, [])

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", overflow: "auto", background: "#ffffff" }}>
      <style>{`
        * { box-sizing: border-box; }
        :root {
          --swim-border: #d7dbe3;
          --swim-text: #0f172a;
          --swim-muted: #6b7280;
          --delay-bg: #fff4e6;
          --delay-accent: #f59e0b;
          --absence-bg: #ffe9e9;
          --absence-accent: #ef4444;
          --leave-bg: #e9f9ef;
          --leave-accent: #22c55e;
          --blocked-bg: #ffe7ea;
          --blocked-accent: #be123c;
          --oneh-bg: #efe7ff;
          --oneh-accent: #7c3aed;
          --ga-bg: #f3f4f6;
          --ga-accent: #9ca3af;
          --external-bg: #e0f2fe;
          --external-accent: #0284c7;
          --r1-bg: #dcfce7;
          --r1-accent: #16a34a;
          --feedback-bg: #e2e8f0;
          --feedback-accent: #64748b;
          --priority-bg: #fef3c7;
          --priority-accent: #d97706;
          --cell-bg: #ffffff;
          --cell-tint: #f9fafb;
        }
        
        /* Modern Header */
        .top-header { 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          padding: 12px 24px; 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          flex-shrink: 0;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        .page-title h1 { 
          font-size: 20px; 
          margin-bottom: 2px; 
          color: white;
          font-weight: 700;
          letter-spacing: -0.5px;
        }
        .page-title p { 
          font-size: 11px; 
          color: rgba(255, 255, 255, 0.9); 
          margin: 0; 
        }
        
        /* Modern Buttons */
        .btn-primary { 
          background: white; 
          color: #667eea; 
          border: none; 
          padding: 6px 14px; 
          border-radius: 6px; 
          font-size: 12px; 
          font-weight: 600;
          cursor: pointer; 
          transition: all 0.2s ease;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        .btn-primary:hover { 
          background: #f8f9fa;
          transform: translateY(-1px);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
        }
        .btn-outline { 
          background: rgba(255, 255, 255, 0.2); 
          color: white; 
          border: 1px solid rgba(255, 255, 255, 0.3); 
          padding: 6px 14px; 
          border-radius: 6px; 
          font-size: 12px; 
          font-weight: 600;
          cursor: pointer; 
          transition: all 0.2s ease;
        }
        .btn-outline:hover { 
          background: rgba(255, 255, 255, 0.3);
          border-color: rgba(255, 255, 255, 0.5);
        }

        .no-print { display: inline-flex; }
        @media print {
          .no-print { display: none !important; }
          aside, header, .command-palette, .top-header, .common-toolbar, .meeting-panel, .modal {
            display: none !important;
          }
          body, html { background: white; }
          main { padding: 0 !important; }
          .view-container { padding: 0; background: white; }
          .swimlane-board { gap: 12px; }
          .swimlane-row { break-inside: avoid; page-break-inside: avoid; }
          .swimlane-row-nav { display: none !important; }
          .swimlane-content-scroll { overflow: visible !important; padding-right: 0; }
          .swimlane-content {
            grid-auto-flow: row !important;
            grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
            grid-auto-columns: auto !important;
            min-width: 0 !important;
            width: 100% !important;
          }
          .swimlane-board {
            border: 1px solid #111827 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }
          .swimlane-row + .swimlane-row {
            border-top: 2px solid #111827 !important;
          }
          .swimlane-row {
            margin-top: 6px;
          }
          .swimlane-header,
          .swimlane-cell {
            padding-top: 18px;
            padding-bottom: 18px;
          }
          .swimlane-header,
          .swimlane-badge,
          .swimlane-cell {
            background: #ffffff !important;
            color: #111827 !important;
          }
          .swimlane-header,
          .swimlane-cell {
            border-color: #111827 !important;
          }
        }
        
        /* View Container */
        .view-container { 
          padding: 16px 24px; 
          overflow: visible; 
          flex-grow: 1; 
          min-height: 0;
          background: linear-gradient(to bottom, #f8f9fa 0%, #ffffff 100%);
        }
        .meeting-panel {
          margin: 16px 24px 0;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          padding: 16px 18px;
          box-shadow: 0 10px 20px rgba(15, 23, 42, 0.06);
        }
        .meeting-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .meeting-title {
          font-size: 14px;
          font-weight: 700;
          color: #0f172a;
        }
        .meeting-subtitle {
          font-size: 12px;
          color: #64748b;
          margin-top: 2px;
        }
        .meeting-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 12px;
        }
        .meeting-dropdown {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 220px;
        }
        .meeting-dropdown label {
          font-size: 12px;
          font-weight: 700;
          color: #475569;
        }
        .meeting-dropdown select {
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 8px 10px;
          background: #ffffff;
          color: #0f172a;
          font-size: 12px;
          font-weight: 600;
        }
        .meeting-chip {
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          color: #334155;
          padding: 6px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .meeting-chip.active {
          background: #2563eb;
          border-color: #2563eb;
          color: #ffffff;
        }
        .meeting-table-card {
          margin-top: 14px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          overflow: hidden;
          background: #ffffff;
        }
        .meeting-table-header {
          padding: 10px 12px;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .meeting-table-title {
          font-size: 13px;
          font-weight: 700;
          color: #0f172a;
        }
        .meeting-table-meta {
          font-size: 12px;
          color: #64748b;
        }
        .meeting-note {
          padding: 8px 10px;
          background: #fff1f2;
          color: #b91c1c;
          font-size: 12px;
          font-weight: 700;
          border-bottom: 1px solid #fecdd3;
        }
        .meeting-table-wrap {
          overflow-x: auto;
        }
        .meeting-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        .meeting-table th {
          background: #e2e8f0;
          text-align: left;
          padding: 8px 10px;
          font-weight: 700;
          color: #1f2937;
          border-bottom: 1px solid #cbd5e1;
        }
        .meeting-table td {
          border-top: 1px solid #e2e8f0;
          padding: 8px 10px;
          vertical-align: top;
          color: #0f172a;
        }
        .meeting-check-cell {
          text-align: center;
          vertical-align: middle;
        }
        .meeting-check-cell input {
          accent-color: #64748b;
          width: 16px;
          height: 16px;
        }
        .meeting-owner-cell {
          text-align: center;
          font-weight: 600;
          color: #1f2937;
        }
        .meeting-empty {
          margin-top: 12px;
          font-size: 12px;
          color: #94a3b8;
        }

        .swimlane-board {
          border: 1px solid var(--swim-border);
          border-radius: 12px;
          overflow: hidden;
          background: #ffffff;
          box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
          width: 100%;
        }
        .swimlane-row {
          display: flex;
        }
        .swimlane-row + .swimlane-row {
          border-top: 1px solid var(--swim-border);
        }
        .swimlane-header {
          width: 150px;
          padding: 10px 10px;
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
          column-gap: 8px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.2px;
          border-right: 1px solid var(--swim-border);
          color: var(--swim-text);
          line-height: 1.1;
          font-size: 12px;
          word-break: break-word;
        }
        .swimlane-badge {
          min-width: 24px;
          height: 24px;
          padding: 0 6px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #ffffff;
          border: 1px solid rgba(15, 23, 42, 0.12);
        }
        .swimlane-content-shell {
          position: relative;
          flex: 1;
          min-width: 0;
        }
        .swimlane-row-nav {
          position: absolute;
          top: 8px;
          right: 8px;
          display: flex;
          gap: 4px;
          z-index: 2;
        }
        .swimlane-row-nav button {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          color: #64748b;
          border-radius: 8px;
          width: 24px;
          height: 24px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: none;
          font-size: 12px;
          opacity: 0.75;
          transition: all 0.2s ease;
        }
        .swimlane-row-nav button:hover {
          color: #334155;
          background: #e2e8f0;
          opacity: 1;
        }
        .swimlane-content-scroll {
          overflow-x: auto;
          padding-bottom: 6px;
          scroll-behavior: smooth;
          scrollbar-gutter: stable;
          padding-right: 40px;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .swimlane-content-scroll::-webkit-scrollbar {
          display: none;
        }
        .swimlane-content {
          flex: 1;
          display: grid;
          grid-template-columns: repeat(3, minmax(260px, 1fr));
          grid-auto-flow: column;
          grid-auto-columns: minmax(260px, 1fr);
          min-width: 780px;
        }
        .swimlane-cell {
          padding: 14px 16px;
          border-right: 1px solid var(--swim-border);
          border-bottom: 1px solid var(--swim-border);
          min-height: 68px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 4px;
          color: var(--swim-text);
          background: linear-gradient(180deg, var(--cell-bg) 0%, var(--cell-tint) 100%);
        }
        .swimlane-cell:nth-child(3n) {
          border-right: 0;
        }
        .swimlane-cell.empty {
          background: #ffffff;
        }
        .swimlane-cell.placeholder {
          color: var(--swim-muted);
          font-style: italic;
        }
        .swimlane-title {
          font-weight: 700;
          font-size: 14px;
        }
        .swimlane-subtitle {
          font-size: 12px;
          color: var(--swim-muted);
        }
        .swimlane-header.delay { background: var(--delay-bg); color: #c2410c; }
        .swimlane-header.absence { background: var(--absence-bg); color: #b91c1c; }
        .swimlane-header.leave { background: var(--leave-bg); color: #15803d; }
        .swimlane-header.blocked { background: var(--blocked-bg); color: #9f1239; }
        .swimlane-header.oneh { background: var(--oneh-bg); color: #6d28d9; }
        .swimlane-header.ga { background: var(--ga-bg); color: #6b7280; }
        .swimlane-header.external { background: var(--external-bg); color: #0369a1; }
        .swimlane-header.r1 { background: var(--r1-bg); color: #15803d; }
        .swimlane-header.feedback { background: var(--feedback-bg); color: #475569; }
        .swimlane-header.priority { background: var(--priority-bg); color: #b45309; }
        .swimlane-badge.delay { border-color: var(--delay-accent); color: #c2410c; }
        .swimlane-badge.absence { border-color: var(--absence-accent); color: #b91c1c; }
        .swimlane-badge.leave { border-color: var(--leave-accent); color: #15803d; }
        .swimlane-badge.blocked { border-color: var(--blocked-accent); color: #9f1239; }
        .swimlane-badge.oneh { border-color: var(--oneh-accent); color: #6d28d9; }
        .swimlane-badge.ga { border-color: var(--ga-accent); color: #6b7280; }
        .swimlane-badge.external { border-color: var(--external-accent); color: #0369a1; }
        .swimlane-badge.r1 { border-color: var(--r1-accent); color: #15803d; }
        .swimlane-badge.feedback { border-color: var(--feedback-accent); color: #475569; }
        .swimlane-badge.priority { border-color: var(--priority-accent); color: #b45309; }
        .swimlane-accent.delay { border-left: 4px solid var(--delay-accent); }
        .swimlane-accent.absence { border-left: 4px solid var(--absence-accent); }
        .swimlane-accent.leave { border-left: 4px solid var(--leave-accent); }
        .swimlane-accent.blocked { border-left: 4px solid var(--blocked-accent); }
        .swimlane-accent.oneh { border-left: 4px solid var(--oneh-accent); }
        .swimlane-accent.ga { border-left: 4px solid var(--ga-accent); }
        .swimlane-accent.external { border-left: 4px solid var(--external-accent); }
        .swimlane-accent.r1 { border-left: 4px solid var(--r1-accent); }
        .swimlane-accent.feedback { border-left: 4px solid var(--feedback-accent); }
        .swimlane-accent.priority { border-left: 4px solid var(--priority-accent); }
        
        /* Modern Toolbar */
        .common-toolbar { 
          background: white; 
          padding: 8px 24px; 
          border-bottom: 1px solid #e5e7eb; 
          display: flex; 
          flex-wrap: wrap; 
          gap: 8px; 
          align-items: center; 
          flex-shrink: 0;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        .toolbar-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .toolbar-group .chip-row {
          margin-right: 0;
        }
        
        /* Elegant Chips */
        .chip-row { 
          display: inline-flex; 
          gap: 4px; 
          padding: 4px; 
          background: #f1f5f9; 
          border-radius: 8px; 
          margin-right: 8px; 
        }
        .chip { 
          border: none; 
          padding: 4px 10px; 
          font-size: 11px; 
          border-radius: 6px; 
          cursor: pointer; 
          background: transparent; 
          color: #64748b; 
          font-weight: 600; 
          display: inline-flex; 
          align-items: center; 
          gap: 4px;
          transition: all 0.2s ease;
        }
        .chip:hover { 
          background: #e2e8f0; 
          color: #475569;
        }
        .chip.active { 
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white; 
          box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
        }
        
        /* Input & Switch */
        .input { 
          border: 2px solid #e2e8f0; 
          border-radius: 8px; 
          padding: 10px 14px; 
          font-size: 14px; 
          width: 100%;
          transition: all 0.2s ease;
        }
        .input:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }
        .switch { 
          display: inline-flex; 
          align-items: center; 
          gap: 8px; 
          font-size: 13px; 
          color: #475569; 
          cursor: pointer;
          font-weight: 500;
        }
        .switch input { 
          width: 18px; 
          height: 18px; 
          accent-color: #667eea; 
        }
        
        /* Modern Badges */
        .badge { 
          padding: 4px 12px; 
          border-radius: 6px; 
          font-size: 11px; 
          font-weight: 700; 
          border: none;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .bg-gray { background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%); color: #475569; }
        .bg-blue { background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%); color: #1e40af; }
        .bg-red-light { background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%); color: #991b1b; }
        .bg-purple { background: linear-gradient(135deg, #e9d5ff 0%, #ddd6fe 100%); color: #6b21a8; }
        .bg-orange { background: linear-gradient(135deg, #fed7aa 0%, #fdba74 100%); color: #9a3412; }
        .bg-green { background: linear-gradient(135deg, #bbf7d0 0%, #86efac 100%); color: #166534; }
        
        /* Elegant Grid */
        .common-grid { 
          display: grid; 
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); 
          gap: 12px; 
          align-content: start; 
        }
        
        /* Beautiful Cards */
        .common-card { 
          background: white; 
          border: none;
          border-radius: 12px; 
          overflow: hidden; 
          display: flex; 
          flex-direction: column; 
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          transition: all 0.3s ease;
        }
        .common-card:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        .common-card-header { 
          display: flex; 
          align-items: center; 
          justify-content: space-between; 
          gap: 8px; 
          padding: 10px 14px; 
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          border-bottom: 1px solid #e2e8f0; 
          cursor: pointer; 
          flex-shrink: 0;
          border-radius: 12px 12px 0 0;
          transition: all 0.2s ease;
        }
        .common-card-header:hover { 
          background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
        }
        .common-card-title { 
          font-size: 11px; 
          font-weight: 800; 
          color: #1e293b; 
          text-transform: uppercase; 
          letter-spacing: 0.3px; 
          display: inline-flex; 
          align-items: center; 
          gap: 6px; 
        }
        .common-card-count { 
          padding: 2px 8px; 
          border-radius: 12px; 
          font-size: 10px; 
          font-weight: 800; 
          background: white;
          color: #475569;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        }
        .common-card-body { 
          padding: 12px 14px; 
          overflow: visible;
          flex: 1;
          min-height: 0;
        }
        .common-card[data-common-type="ga"] .common-card-body {
          max-height: 320px;
          overflow-y: auto;
        }
        
        /* Elegant List Items */
        .common-list { 
          list-style: none; 
          margin: 0; 
          padding: 0; 
          display: grid; 
          gap: 6px; 
        }
        .common-item { 
          border: 1px solid #e2e8f0; 
          border-radius: 8px; 
          padding: 8px 10px; 
          background: linear-gradient(to bottom, #ffffff 0%, #f8fafc 100%);
          transition: all 0.2s ease;
        }
        .common-item:hover {
          border-color: #cbd5e1;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
        }
        .common-item-title { 
          font-weight: 700; 
          color: #0f172a; 
          font-size: 12px;
          margin-bottom: 4px;
          line-height: 1.3;
        }
        .common-item-meta { 
          margin-top: 4px; 
          font-size: 10px; 
          color: #64748b; 
          display: flex; 
          flex-wrap: wrap; 
          gap: 6px; 
          align-items: center; 
        }
        .common-item-meta b { 
          color: #1e293b; 
          font-weight: 700;
        }
        .common-empty { 
          color: #94a3b8; 
          font-size: 11px; 
          padding: 16px 12px; 
          border: 1px dashed #cbd5e1; 
          border-radius: 8px; 
          background: #f8fafc; 
          text-align: center;
          font-style: italic;
        }
        
        /* Priority Section */
        .common-priority { 
          grid-column: 1 / -1; 
        }
        .common-person-grid { 
          display: grid; 
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
          gap: 12px; 
        }
        .common-person { 
          background: white; 
          border: 1px solid #e2e8f0; 
          border-radius: 12px; 
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          transition: all 0.3s ease;
          display: flex;
          flex-direction: column;
          max-height: 100%;
        }
        .common-person:hover {
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        .common-person-header { 
          padding: 10px 14px; 
          border-bottom: 1px solid #e2e8f0; 
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
          display: flex; 
          align-items: center; 
          justify-content: space-between; 
          gap: 8px;
          flex-shrink: 0;
        }
        .common-person-name { 
          font-weight: 800; 
          color: #0f172a; 
          font-size: 12px; 
        }
        .common-person-body { 
          padding: 12px 14px;
          overflow-y: auto;
          flex: 1;
          min-height: 0;
        }
        .common-person-body ul { 
          margin: 0; 
          padding-left: 16px; 
          color: #1e293b; 
          font-size: 11px; 
        }
        .common-person-body li { 
          margin-bottom: 6px;
          line-height: 1.4;
        }
        .common-person-body li:last-child { 
          margin-bottom: 0; 
        }
        .common-person-body small { 
          color: #64748b; 
          font-weight: 600; 
          font-size: 10px; 
        }
        
        /* Modern Modal */
        .modal { 
          position: fixed; 
          inset: 0; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          z-index: 9999; 
        }
        .modal.hidden { 
          display: none; 
        }
        .modal-backdrop { 
          position: absolute; 
          inset: 0; 
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(4px);
        }
        .modal-card { 
          position: relative; 
          width: min(720px, calc(100vw - 32px)); 
          background: white; 
          border-radius: 20px; 
          border: none;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); 
          overflow: hidden; 
        }
        .modal-header { 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          padding: 24px 28px; 
          border-bottom: 2px solid #e2e8f0; 
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
        }
        .modal-header h4 { 
          font-size: 18px; 
          color: #0f172a; 
          margin: 0;
          font-weight: 700;
        }
        .modal-body { 
          padding: 28px; 
        }
        .modal-footer { 
          display: flex; 
          justify-content: flex-end; 
          gap: 12px; 
          padding: 20px 28px; 
          border-top: 2px solid #e2e8f0; 
          background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
        }
        .form-grid { 
          display: grid; 
          grid-template-columns: 1fr 1fr; 
          gap: 16px; 
        }
        .form-row { 
          display: flex; 
          flex-direction: column; 
          gap: 8px; 
        }
        .form-row label { 
          font-size: 13px; 
          color: #475569; 
          font-weight: 700; 
        }
        .form-row textarea { 
          min-height: 100px; 
          resize: vertical; 
        }
        .span-2 { 
          grid-column: 1 / -1; 
        }
      `}</style>

      <header className="top-header">
        <div className="page-title">
          <h1>Common View</h1>
          <p>Daily/weekly view for key statuses and team priorities.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-primary no-print" type="button" onClick={handlePrint}>
            Export / Print
          </button>
          <button className="btn-outline no-print" type="button" onClick={() => setMeetingPanelOpen((prev) => !prev)}>
            Meeting
          </button>
          <button className="btn-outline no-print" type="button" onClick={() => openModal("gaNote")}>
            GA
          </button>
          <button className="btn-outline no-print" type="button" onClick={() => openModal()}>
            + Add
          </button>
        </div>
      </header>

      <div className="common-toolbar no-print">
        <div className="toolbar-group">
          <div className="chip-row">
          {weekISOs.map((iso) => {
            const d = fromISODate(iso)
            const label = `${alWeekdayShort(d)} ${formatDateHuman(iso)}`
            const isActive = selectedDates.has(iso)
            return (
              <button
                key={iso}
                className={`chip ${isActive ? "active" : ""}`}
                type="button"
                onClick={() => toggleDay(iso)}
              >
                {label}
              </button>
            )
          })}
          </div>
          <label className="switch" title="When OFF: select only one. When ON: select multiple.">
            <input type="checkbox" checked={multiMode} onChange={(e) => setMultiMode(e.target.checked)} />
            Multi-select (Days)
          </label>
        </div>
        <div className="toolbar-group">
          <div className="chip-row">
          <button
            className={`chip ${typeFilters.size === 0 ? "active" : ""}`}
            type="button"
            onClick={() => setTypeFilter("all")}
          >
            All
          </button>
          <button
            className={`chip ${typeFilters.has("late") ? "active" : ""}`}
            type="button"
            onClick={() => setTypeFilter("late")}
          >
            Delays
          </button>
          <button
            className={`chip ${typeFilters.has("absent") ? "active" : ""}`}
            type="button"
            onClick={() => setTypeFilter("absent")}
          >
            Absences
          </button>
          <button
            className={`chip ${typeFilters.has("leave") ? "active" : ""}`}
            type="button"
            onClick={() => setTypeFilter("leave")}
          >
            Annual Leave
          </button>
          <button
            className={`chip ${typeFilters.has("ga") ? "active" : ""}`}
            type="button"
            onClick={() => setTypeFilter("ga")}
          >
            GA Notes
          </button>
          <button
            className={`chip ${typeFilters.has("blocked") ? "active" : ""}`}
            type="button"
            onClick={() => setTypeFilter("blocked")}
          >
            BLOCKED
          </button>
          <button
            className={`chip ${typeFilters.has("oneH") ? "active" : ""}`}
            type="button"
            onClick={() => setTypeFilter("oneH")}
          >
            1H
          </button>
          <button
            className={`chip ${typeFilters.has("external") ? "active" : ""}`}
            type="button"
            onClick={() => setTypeFilter("external")}
          >
            External Meetings
          </button>
          <button
            className={`chip ${typeFilters.has("r1") ? "active" : ""}`}
            type="button"
            onClick={() => setTypeFilter("r1")}
          >
            R1
          </button>
          <button
            className={`chip ${typeFilters.has("feedback") ? "active" : ""}`}
            type="button"
            onClick={() => setTypeFilter("feedback")}
          >
            Complaints/Requests/Proposals
          </button>
          <button
            className={`chip ${typeFilters.has("priority") ? "active" : ""}`}
            type="button"
            onClick={() => setTypeFilter("priority")}
          >
            Tasks
          </button>
          </div>
          <label className="switch" title="When OFF: select only one. When ON: select multiple.">
            <input type="checkbox" checked={typeMultiMode} onChange={(e) => setTypeMultiMode(e.target.checked)} />
            Multi-select (Types)
          </label>
        </div>
        <input
          className="input"
          type="date"
          value={toISODate(weekStart)}
          onChange={(e) => setWeek(e.target.value)}
          style={{ width: "auto" }}
        />
        <button className="btn-outline" type="button" onClick={selectAll}>
          All days
        </button>
        <button className="btn-outline" type="button" onClick={selectToday}>
          Today
        </button>
      </div>

      {meetingPanelOpen ? (
        <section className="meeting-panel">
          <div className="meeting-panel-header">
            <div>
              <div className="meeting-title">Meetings</div>
              <div className="meeting-subtitle">Select a meeting to view the checklist table.</div>
            </div>
            <button className="btn-outline" type="button" onClick={() => setMeetingPanelOpen(false)}>
              Close
            </button>
          </div>
          <div className="meeting-tabs">
            <div className="meeting-dropdown">
              <label htmlFor="meeting-board-ga">BORD/GA</label>
              <select
                id="meeting-board-ga"
                value={boardMeetingIds.includes(activeMeetingId) ? activeMeetingId : ""}
                onChange={(e) => setActiveMeetingId(e.target.value)}
              >
                <option value="" disabled>
                  Select meeting
                </option>
                {MEETING_TEMPLATES.filter((t) => boardMeetingIds.includes(t.id)).map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="meeting-dropdown">
              <label htmlFor="meeting-staff-ga">STAFF/GA</label>
              <select
                id="meeting-staff-ga"
                value={staffMeetingIds.includes(activeMeetingId) ? activeMeetingId : ""}
                onChange={(e) => setActiveMeetingId(e.target.value)}
              >
                <option value="" disabled>
                  Select meeting
                </option>
                {MEETING_TEMPLATES.filter((t) => staffMeetingIds.includes(t.id)).map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {activeMeeting ? (
            <div className="meeting-table-card">
              <div className="meeting-table-header">
                <div className="meeting-table-title">{activeMeeting.title}</div>
                {activeMeeting.defaultOwner || activeMeeting.defaultTime ? (
                  <div className="meeting-table-meta">
                    {activeMeeting.defaultOwner ? `WHO: ${activeMeeting.defaultOwner}` : null}
                    {activeMeeting.defaultOwner && activeMeeting.defaultTime ? " | " : null}
                    {activeMeeting.defaultTime ? `WHEN: ${activeMeeting.defaultTime}` : null}
                  </div>
                ) : null}
              </div>
              {activeMeeting.note ? <div className="meeting-note">{activeMeeting.note}</div> : null}
              <div className="meeting-table-wrap">
                <table className="meeting-table">
                  <thead>
                    <tr>
                      {activeMeeting.columns.map((col) => (
                        <th key={col.key} style={col.width ? { width: col.width } : undefined}>
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {activeMeeting.rows.map((row, rowIndex) => (
                      <tr key={`${activeMeeting.id}-${row.nr}`}>
                        {activeMeeting.columns.map((col) => {
                          let value = ""
                          if (col.key === "nr") value = String(row.nr)
                          if (col.key === "day") value = row.day || ""
                          if (col.key === "topic") value = row.topic
                          if (col.key === "owner") {
                            value = row.owner || (rowIndex === 0 ? activeMeeting.defaultOwner || "" : "")
                          }
                          if (col.key === "time") {
                            value = row.time || (rowIndex === 0 ? activeMeeting.defaultTime || "" : "")
                          }

                          if (col.key === "owner" && mergeOwnerColumn) {
                            if (rowIndex !== 0) return null
                            return (
                              <td
                                key={`${activeMeeting.id}-${row.nr}-${col.key}`}
                                rowSpan={activeMeeting.rows.length}
                                className="meeting-owner-cell"
                                style={col.width ? { width: col.width } : undefined}
                              >
                                {value}
                              </td>
                            )
                          }

                          if (col.key === "check") {
                            return (
                              <td key={`${activeMeeting.id}-${row.nr}-${col.key}`} className="meeting-check-cell">
                                <input type="checkbox" aria-label={`Mark ${row.topic}`} />
                              </td>
                            )
                          }

                          if (col.key === "topic") {
                            return (
                              <td key={`${activeMeeting.id}-${row.nr}-${col.key}`} style={col.width ? { width: col.width } : undefined}>
                                {value}
                              </td>
                            )
                          }

                          return (
                            <td key={`${activeMeeting.id}-${row.nr}-${col.key}`} style={col.width ? { width: col.width } : undefined}>
                              {value}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="meeting-empty">No meeting selected.</div>
          )}
        </section>
      ) : null}

      <div className="view-container">
        <div className="swimlane-board">
          {swimlaneRows
            .filter((row) => showCard(row.id))
            .map((row) => {
              const cells = buildSwimlaneCells(row.items)
              return (
                <div key={row.id} className="swimlane-row">
                  <div className={row.headerClass}>
                    <span>{row.label}</span>
                    <span className={row.badgeClass}>{row.count}</span>
                  </div>
                  <div className="swimlane-content-shell">
                    <div className="swimlane-row-nav">
                      <button type="button" onClick={() => scrollSwimlaneRow(row.id, "left")}>{"<"}</button>
                      <button type="button" onClick={() => scrollSwimlaneRow(row.id, "right")}>{">"}</button>
                    </div>
                    <div
                      className="swimlane-content-scroll"
                      ref={(node) => {
                        swimlaneRowRefs.current[row.id] = node
                      }}
                    >
                      <div className="swimlane-content">
                        {cells.map((cell, index) =>
                          cell ? (
                            <div
                              key={`${row.id}-${index}`}
                              className={[
                                "swimlane-cell",
                                cell.accentClass || "",
                                cell.placeholder ? "placeholder" : "",
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            >
                              <div className="swimlane-title">{cell.title}</div>
                              {cell.subtitle ? <div className="swimlane-subtitle">{cell.subtitle}</div> : null}
                            </div>
                          ) : (
                            <div key={`${row.id}-empty-${index}`} className="swimlane-cell empty" />
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
        </div>
      </div>

      {/* Modal */}
      {(modalOpen || gaModalOpen) && (
        <div className="modal">
          <div className="modal-backdrop" onClick={closeModal} />
          <div className="modal-card">
            <div className="modal-header">
            <h4>Add to Common View</h4>
              <button className="btn-outline" type="button" onClick={closeModal}>
                Close
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={submitForm}>
                <div className="form-grid">
                  <div className="form-row">
                    <label htmlFor="cv-type">Type</label>
                    <select
                      id="cv-type"
                      className="input"
                      value={formType}
                      onChange={(e) => {
                        setFormType(e.target.value as any)
                      }}
                      required
                    >
                      <option value="late">Delay</option>
                      <option value="absent">Absence</option>
                      <option value="leave">Annual Leave</option>
                      <option value="feedback">Complaint/Request/Proposal</option>
                      <option value="gaNote">GA Note</option>
                  </select>
                </div>
                  {formType !== "gaNote" && (
                    <div className="form-row">
                      <label htmlFor="cv-person">Person</label>
                      <select
                        id="cv-person"
                        className="input"
                        value={formPerson}
                        onChange={(e) => setFormPerson(e.target.value)}
                        required
                      >
                        <option value="">--</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.full_name || u.username || u.email}>
                            {u.full_name || u.username || u.email}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {formType === "gaNote" && (
                    <>
                      <div className="form-row">
                        <label htmlFor="cv-ga-audience">Audience</label>
                        <select
                          id="cv-ga-audience"
                          className="input"
                          value={gaAudience}
                          onChange={(e) => {
                            const next = e.target.value as "all" | "department" | "person"
                            setGaAudience(next)
                            if (next !== "person") setFormPerson("")
                            if (next !== "department") setFormDept("All")
                          }}
                          required
                        >
                          {(user?.role === "ADMIN" || user?.role === "MANAGER") && (
                            <option value="all">All employees</option>
                          )}
                          <option value="department">Department</option>
                          <option value="person">Specific person</option>
                        </select>
                      </div>

                      {gaAudience === "person" && (
                        <div className="form-row">
                          <label htmlFor="cv-person">User</label>
                          <select
                            id="cv-person"
                            className="input"
                            value={formPerson}
                            onChange={(e) => setFormPerson(e.target.value)}
                            required
                          >
                            <option value="">--</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.full_name || u.username || u.email}>
                                {u.full_name || u.username || u.email}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {gaAudience === "department" && (
                        <div className="form-row">
                          <label htmlFor="cv-dept">Department</label>
                          <select
                            id="cv-dept"
                            className="input"
                            value={formDept}
                            onChange={(e) => setFormDept(e.target.value)}
                            required
                          >
                            {departments.length === 0 ? (
                              <option value="">Loading departments...</option>
                            ) : (
                              departments.map((dept) => (
                                <option key={dept.id} value={dept.name}>
                                  {formatDepartmentName(dept.name)}
                                </option>
                              ))
                            )}
                          </select>
                        </div>
                      )}

                      {gaAudience === "person" && (
                        <div className="form-row">
                          <label htmlFor="cv-dept-auto">Department (auto)</label>
                          <input
                            id="cv-dept-auto"
                            className="input"
                            type="text"
                            value={formDept === "All" ? "Unassigned" : formDept}
                            readOnly
                          />
                        </div>
                      )}
                    </>
                  )}

                  {formType === "feedback" && (
                    <div className="form-row span-2">
                      <label htmlFor="cv-title">Title</label>
                      <input
                        id="cv-title"
                        className="input"
                        type="text"
                        placeholder="e.g. Request: server access"
                        value={formTitle}
                        onChange={(e) => setFormTitle(e.target.value)}
                        required
                      />
                    </div>
                  )}

                  <div className="form-row">
                    <label htmlFor="cv-date">Date</label>
                    <input
                      id="cv-date"
                      className="input"
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      required
                    />
                  </div>

                  {formType === "late" && (
                    <>
                      <div className="form-row">
                        <label htmlFor="cv-start">Start time (delay)</label>
                        <input
                          id="cv-start"
                          className="input"
                          type="time"
                          value={formDelayStart}
                          onChange={(e) => setFormDelayStart(e.target.value)}
                        />
                      </div>
                      <div className="form-row">
                        <label htmlFor="cv-until">End time (delay)</label>
                        <input
                          id="cv-until"
                          className="input"
                          type="time"
                          value={formUntil}
                          onChange={(e) => setFormUntil(e.target.value)}
                        />
                      </div>
                    </>
                  )}

                  {formType === "absent" && (
                    <>
                      <div className="form-row">
                        <label htmlFor="cv-from">From (for absence/AL with hours)</label>
                        <input
                          id="cv-from"
                          className="input"
                          type="time"
                          value={formFrom}
                          onChange={(e) => setFormFrom(e.target.value)}
                        />
                      </div>
                      <div className="form-row">
                        <label htmlFor="cv-to">Until (for absence/AL with hours)</label>
                        <input
                          id="cv-to"
                          className="input"
                          type="time"
                          value={formTo}
                          onChange={(e) => setFormTo(e.target.value)}
                        />
                      </div>
                    </>
                  )}

                  {formType === "leave" && (
                    <div className="form-row">
                      <label htmlFor="cv-enddate">Until date (optional)</label>
                      <input
                        id="cv-enddate"
                        className="input"
                        type="date"
                        value={formEndDate}
                        onChange={(e) => setFormEndDate(e.target.value)}
                      />
                    </div>
                  )}

                  <div className="form-row span-2">
                    <label htmlFor="cv-note">Note</label>
                    <textarea
                      id="cv-note"
                      className="input"
                      placeholder="Optional..."
                      value={formNote}
                      onChange={(e) => setFormNote(e.target.value)}
                    />
                  </div>
                </div>
              </form>
              </div>
            <div className="modal-footer">
              <button className="btn-outline" type="button" onClick={closeModal}>
                Cancel
              </button>
              <button className="btn-primary" type="submit" onClick={submitForm}>
                Save
              </button>
              </div>
          </div>
        </div>
      )}
    </div>
  )
}
