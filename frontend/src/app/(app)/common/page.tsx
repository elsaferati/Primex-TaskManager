"use client"

import * as React from "react"
import { useAuth } from "@/lib/auth"
import type { User, Task, CommonEntry, GaNote, Department } from "@/lib/types"

type CommonType = "late" | "absent" | "leave" | "ga" | "blocked" | "oneH" | "external" | "r1" | "feedback" | "priority"

type LateItem = { person: string; date: string; until: string; note?: string }
type AbsentItem = { person: string; date: string; from: string; to: string; note?: string }
type LeaveItem = { person: string; startDate: string; endDate: string; fullDay: boolean; from?: string; to?: string; note?: string }
type GaNoteItem = { id: string; date: string; department: string; person?: string; note: string }
type BlockedItem = { title: string; person: string; date: string; note?: string }
type OneHItem = { title: string; person: string; date: string; note?: string }
type ExternalItem = { title: string; date: string; time: string; platform: string; owner: string }
type R1Item = { title: string; date: string; owner: string; note?: string }
type FeedbackItem = { title: string; person: string; date: string; note?: string }
type PriorityItem = { person: string; date: string; items: Array<{ project: string; task: string; level: string }> }

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
  const [formUntil, setFormUntil] = React.useState("09:00")
  const [formFrom, setFormFrom] = React.useState("08:00")
  const [formTo, setFormTo] = React.useState("12:00")
  const [formEndDate, setFormEndDate] = React.useState("")
  const [formFullDay, setFormFullDay] = React.useState(true)
  const [formTitle, setFormTitle] = React.useState("")
  const [formNote, setFormNote] = React.useState("")
  const [formDept, setFormDept] = React.useState("All")
  const [gaAudience, setGaAudience] = React.useState<"all" | "department" | "person">("department")

  // Derived
  const weekISOs = React.useMemo(() => getWeekdays(weekStart).map(toISODate), [weekStart])
  const resolveUserByLabel = React.useCallback(
    (label: string) =>
      users.find(
        (u) => u.full_name === label || u.username === label || u.email === label || `${u.full_name || ""}`.trim() === label
      ),
    [users]
  )

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
        if (uRes?.ok) {
          loadedUsers = (await uRes.json()) as User[]
          if (mounted) setUsers(loadedUsers)
        }
        if (depsRes?.ok) {
          loadedDepartments = (await depsRes.json()) as Department[]
          if (mounted) setDepartments(loadedDepartments)
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
              let note = e.description || ""
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
        const tasksRes = await apiFetch("/tasks?include_done=true")
        if (tasksRes?.ok) {
          const tasks = (await tasksRes.json()) as Task[]
          const today = toISODate(new Date())

          const priorityMap = new Map<string, PriorityItem>()

          for (const t of tasks) {
            const assignee = loadedUsers.find((u) => u.id === t.assigned_to_user_id)
            const ownerName = assignee?.full_name || assignee?.username || "Unknown"
            const taskDate = t.planned_for ? toISODate(new Date(t.planned_for)) : today

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
            if (t.priority && t.priority === "HIGH" && t.project_id && assignee) {
              const key = `${ownerName}-${taskDate}`
              if (!priorityMap.has(key)) {
                priorityMap.set(key, {
                  person: ownerName,
                  date: taskDate,
                  items: [],
                })
              }
              priorityMap.get(key)!.items.push({
                project: `Project ${t.project_id?.slice(0, 8)}`,
                task: t.title,
                level: t.priority,
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
  }, [apiFetch])

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
        if (formType === "late" && formUntil) {
          description = description ? `${description}\n\nUntil: ${formUntil}` : `Until: ${formUntil}`
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

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", overflow: "auto", background: "#ffffff" }}>
      <style>{`
        * { box-sizing: border-box; }
        
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
        
        /* View Container */
        .view-container { 
          padding: 16px 24px; 
          overflow: visible; 
          flex-grow: 1; 
          min-height: 0;
          background: linear-gradient(to bottom, #f8f9fa 0%, #ffffff 100%);
        }
        
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
        <div>
          <button className="btn-outline" type="button" onClick={() => openModal("gaNote")}>
            GA
          </button>
          <button className="btn-outline" type="button" onClick={() => openModal()}>
            + Add
          </button>
        </div>
      </header>

      <div className="common-toolbar">
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
            Priority
          </button>
        </div>
        <label className="switch" title="When OFF: select only one. When ON: select multiple.">
          <input type="checkbox" checked={multiMode} onChange={(e) => setMultiMode(e.target.checked)} />
          Multi-select (Days)
        </label>
        <label className="switch" title="When OFF: select only one. When ON: select multiple.">
          <input type="checkbox" checked={typeMultiMode} onChange={(e) => setTypeMultiMode(e.target.checked)} />
          Multi-select (Types)
        </label>
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

      <div className="view-container">
      <div className="common-grid">
          {showCard("late") && (
            <div className="common-card" data-common-type="late">
              <div className="common-card-header" onClick={() => setTypeFilter("late")}>
                <div className="common-card-title">
                  <span className="badge bg-orange">Delays</span>
                </div>
                <span className="common-card-count">{filtered.late.length}</span>
              </div>
              <div className="common-card-body">
                {filtered.late.length ? (
                  <ul className="common-list">
                    {filtered.late.map((x, i) => (
                      <li key={i} className="common-item">
                        <div className="common-item-title">
                          {x.person} – delay until {x.until}
                        </div>
                        <div className="common-item-meta">
                          <span>{formatDateHuman(x.date)}</span>
                          {x.note && (
                            <>
                              <span>•</span>
                              <span>{x.note}</span>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="common-empty">No data for the current filter.</div>
                )}
          </div>
        </div>
          )}

          {showCard("absent") && (
            <div className="common-card" data-common-type="absent">
              <div className="common-card-header" onClick={() => setTypeFilter("absent")}>
                <div className="common-card-title">
                  <span className="badge bg-red-light">Absences</span>
                </div>
                <span className="common-card-count">{filtered.absent.length}</span>
              </div>
              <div className="common-card-body">
                {filtered.absent.length ? (
                  <ul className="common-list">
                    {filtered.absent.map((x, i) => (
                      <li key={i} className="common-item">
                        <div className="common-item-title">
                          {x.person} – absence {x.from}–{x.to}
                        </div>
                        <div className="common-item-meta">
                          <span>{formatDateHuman(x.date)}</span>
                          {x.note && (
                            <>
                              <span>•</span>
                              <span>{x.note}</span>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="common-empty">No data for the current filter.</div>
                )}
          </div>
        </div>
          )}

          {showCard("leave") && (
            <div className="common-card" data-common-type="leave">
              <div className="common-card-header" onClick={() => setTypeFilter("leave")}>
                <div className="common-card-title">
                  <span className="badge bg-green">Annual Leave</span>
                </div>
                <span className="common-card-count">{filtered.leave.length}</span>
              </div>
              <div className="common-card-body">
                {filtered.leave.length ? (
                  <ul className="common-list">
                    {filtered.leave.map((x, i) => {
                      const isRange = x.endDate && x.endDate !== x.startDate
                      const dateLabel = isRange
                        ? `${formatDateHuman(x.startDate)} - ${formatDateHuman(x.endDate)}`
                        : formatDateHuman(x.startDate)
                      const timeLabel = x.fullDay ? "Full day" : `${x.from || ""}${x.from ? "-" : ""}${x.to || ""}`
                      return (
                        <li key={i} className="common-item">
                          <div className="common-item-title">{x.person} - PV</div>
                          <div className="common-item-meta">
                            <span>{dateLabel}</span>
                            <span>•</span>
                            <span>{timeLabel}</span>
                            {x.note && (
                              <>
                                <span>•</span>
                                <span>{x.note}</span>
                              </>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <div className="common-empty">No data for the current filter.</div>
                )}
          </div>
        </div>
          )}

          {showCard("ga") && (
        <div className="common-card" data-common-type="ga">
              <div className="common-card-header" onClick={() => setTypeFilter("ga")}>
                <div className="common-card-title">
                  <span className="badge bg-blue">GA Notes</span>
                </div>
                <span className="common-card-count">{filtered.ga.length}</span>
              </div>
              <div className="common-card-body">
                {filtered.ga.length ? (
                  <ul className="common-list">
                    {filtered.ga.map((x, i) => {
                      const dept = x.department === "All" ? "All employees" : x.department
                      const target = x.person ? ` • ${x.person}` : ""
                      return (
                        <li key={i} className="common-item">
                          <div className="common-item-title">GA: {x.note}</div>
                          <div className="common-item-meta">
                            <span>{formatDateHuman(x.date)}</span>
                            <span>•</span>
                            <span>
                              {dept}
                              {target}
                            </span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <div className="common-empty">No data for the current filter.</div>
                )}
          </div>
        </div>
          )}

          {showCard("blocked") && (
            <div className="common-card" data-common-type="blocked">
              <div className="common-card-header" onClick={() => setTypeFilter("blocked")}>
                <div className="common-card-title">
                  <span className="badge bg-red-light">BLOCKED</span>
                </div>
                <span className="common-card-count">{filtered.blocked.length}</span>
              </div>
          <div className="common-card-body">
                {filtered.blocked.length ? (
                  <ul className="common-list">
                    {filtered.blocked.map((x, i) => (
                      <li key={i} className="common-item">
                <div className="common-item-title">{x.title}</div>
                        <div className="common-item-meta">
                          <span>{formatDateHuman(x.date)}</span>
                          <span>•</span>
                          <span>
                            Owner: <b>{x.person}</b>
                          </span>
                          {x.note && (
                            <>
                              <span>•</span>
                              <span>{x.note}</span>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="common-empty">No data for the current filter.</div>
                )}
              </div>
            </div>
          )}

          {showCard("oneH") && (
            <div className="common-card" data-common-type="oneH">
              <div className="common-card-header" onClick={() => setTypeFilter("oneH")}>
                <div className="common-card-title">
                  <span className="badge bg-purple">1H</span>
                </div>
                <span className="common-card-count">{filtered.oneH.length}</span>
              </div>
              <div className="common-card-body">
                {filtered.oneH.length ? (
                  <ul className="common-list">
                    {filtered.oneH.map((x, i) => (
                      <li key={i} className="common-item">
                        <div className="common-item-title">{x.title}</div>
                        <div className="common-item-meta">
                          <span>{formatDateHuman(x.date)}</span>
                          <span>•</span>
                          <span>
                            Owner: <b>{x.person}</b>
                          </span>
                          {x.note && (
                            <>
                              <span>•</span>
                              <span>{x.note}</span>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="common-empty">No data for the current filter.</div>
                )}
          </div>
        </div>
          )}

          {showCard("external") && (
        <div className="common-card" data-common-type="external">
              <div className="common-card-header" onClick={() => setTypeFilter("external")}>
                <div className="common-card-title">
                  <span className="badge bg-blue">External Meetings</span>
                </div>
                <span className="common-card-count">{filtered.external.length}</span>
              </div>
              <div className="common-card-body">
                {filtered.external.length ? (
                  <ul className="common-list">
                    {filtered.external.map((x, i) => (
                      <li key={i} className="common-item">
                        <div className="common-item-title">
                          {x.time} – {x.title}
                        </div>
                        <div className="common-item-meta">
                          <span>{formatDateHuman(x.date)}</span>
                          <span>•</span>
                          <span>{x.platform}</span>
                          <span>•</span>
                          <span>
                            Owner: <b>{x.owner}</b>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="common-empty">No data for the current filter.</div>
                )}
          </div>
        </div>
          )}

          {showCard("r1") && (
            <div className="common-card" data-common-type="r1">
              <div className="common-card-header" onClick={() => setTypeFilter("r1")}>
                <div className="common-card-title">
                  <span className="badge bg-green">R1</span>
                </div>
                <span className="common-card-count">{filtered.r1.length}</span>
              </div>
          <div className="common-card-body">
                {filtered.r1.length ? (
                  <ul className="common-list">
                    {filtered.r1.map((x, i) => (
                      <li key={i} className="common-item">
                <div className="common-item-title">{x.title}</div>
                        <div className="common-item-meta">
                          <span>{formatDateHuman(x.date)}</span>
                          <span>•</span>
                          <span>
                            Owner: <b>{x.owner}</b>
                          </span>
                          {x.note && (
                            <>
                              <span>•</span>
                              <span>{x.note}</span>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="common-empty">No data for the current filter.</div>
                )}
              </div>
            </div>
          )}

          {showCard("feedback") && (
            <div className="common-card" data-common-type="feedback">
              <div className="common-card-header" onClick={() => setTypeFilter("feedback")}>
                <div className="common-card-title">
                  <span className="badge bg-gray">Complaints/Requests/Proposals</span>
          </div>
                <span className="common-card-count">{filtered.feedback.length}</span>
        </div>
          <div className="common-card-body">
                {filtered.feedback.length ? (
                  <ul className="common-list">
                    {filtered.feedback.map((x, i) => (
                      <li key={i} className="common-item">
                <div className="common-item-title">{x.title}</div>
                        <div className="common-item-meta">
                          <span>{formatDateHuman(x.date)}</span>
                          <span>•</span>
                          <span>{x.person}</span>
                          {x.note && (
                            <>
                              <span>•</span>
                              <span>{x.note}</span>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="common-empty">No data for the current filter.</div>
                )}
              </div>
            </div>
          )}

          {showCard("priority") && (
            <div className="common-card common-priority" data-common-type="priority">
              <div className="common-card-header" onClick={() => setTypeFilter("priority")}>
                <div className="common-card-title">Priority Projects (for everyone)</div>
                <span className="common-card-count">
                  {filtered.priority.reduce((sum, p) => sum + p.items.length, 0)}
                </span>
              </div>
              <div className="common-card-body">
                <div className="common-person-grid">
                  {commonPeople.map((person) => {
                    const item = filtered.priority.find((p) => p.person === person) || null
                    const tasks = item ? item.items : []
                    const count = tasks.length
                    return (
                      <div key={person} className="common-person">
                        <div className="common-person-header">
                          <div className="common-person-name">{person}</div>
                          <span className="common-card-count">{count}</span>
                        </div>
                        <div className="common-person-body">
                          {count ? (
                            <ul>
                              {tasks.map((t, idx) => (
                                <li key={idx}>
                                  <b>{t.project}</b>: {t.task} <small>({t.level})</small>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="common-empty">No priority for the current filter.</div>
                          )}
          </div>
        </div>
                    )
                  })}
                </div>
              </div>
          </div>
          )}
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
                                  {dept.name}
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
                    <div className="form-row">
                      <label htmlFor="cv-until">Until time (for delay)</label>
                      <input
                        id="cv-until"
                        className="input"
                        type="time"
                        value={formUntil}
                        onChange={(e) => setFormUntil(e.target.value)}
                      />
                    </div>
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
