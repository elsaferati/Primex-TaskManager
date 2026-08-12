"use client"

import * as React from "react"
import { RefreshCw } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

type Control = { day:string; all_good:boolean; summary:Record<string,number>; people:Array<{
  user_id:string; employee:string; department:string; rlz_close_state:{status:string}; blockers:Array<{task_id:string;title:string;status:string;
    due_date?:string|null;one_h_report_slot?:string|null;reason_label?:string|null;comment?:string|null;issues:Array<{code:string;message:string}>}> }> }
type Person = Control["people"][number]
type Blocker = Person["blockers"][number]
type Row = { person: Person; blocker: Blocker | null }

export default function RlzDailyControlPage() {
  const { apiFetch } = useAuth()
  const [day,setDay] = React.useState(new Date().toISOString().slice(0,10))
  const [data,setData] = React.useState<Control|null>(null)
  const [loading,setLoading] = React.useState(false)
  const [departmentFilter,setDepartmentFilter] = React.useState("")
  const [employeeFilter,setEmployeeFilter] = React.useState("")
  const [statusFilter,setStatusFilter] = React.useState("")
  const load = React.useCallback(async()=>{setLoading(true);try{const response=await apiFetch(`/reports/daily-rlz-control?day=${day}`)
    if(!response.ok)throw new Error(await response.text());setData(await response.json())}catch(error){toast.error("Kontrolli ditor RLZ nuk u ngarkua",{description:String(error)})}finally{setLoading(false)}},[apiFetch,day])
  React.useEffect(()=>{const timer=window.setTimeout(()=>void load(),0);return()=>window.clearTimeout(timer)},[load])
  const rows: Row[]=[]
  const visiblePeople=(data?.people||[]).filter(person=>
    person.department.toLowerCase().includes(departmentFilter.toLowerCase())&&
    person.employee.toLowerCase().includes(employeeFilter.toLowerCase())&&
    (!statusFilter||person.rlz_close_state.status.toLowerCase().includes(statusFilter.toLowerCase())||
      person.blockers.some(blocker=>blocker.issues.some(issue=>issue.code.toLowerCase().includes(statusFilter.toLowerCase()))))
  )
  for(const person of visiblePeople){
    if(person.blockers.length){for(const blocker of person.blockers)rows.push({person,blocker})}
    else rows.push({person,blocker:null})
  }
  return <div className="space-y-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold">Kontrolli ditor RLZ</h1><p className="text-sm text-muted-foreground">I njëjti kontroll përdoret për ruajtjen dhe emailin automatik të orës 16:00.</p></div><div className="flex flex-wrap items-end gap-2"><Input type="date" value={day} onChange={e=>setDay(e.target.value)}/><Input placeholder="Department" value={departmentFilter} onChange={e=>setDepartmentFilter(e.target.value)}/><Input placeholder="Employee" value={employeeFilter} onChange={e=>setEmployeeFilter(e.target.value)}/><Input placeholder="Compliance status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}/><Button onClick={()=>void load()} disabled={loading}><RefreshCw className={loading?"animate-spin":""}/>Refresh</Button></div></div>
    {data&&<div className="grid gap-3 md:grid-cols-4 lg:grid-cols-7">{Object.entries(data.summary).map(([key,value])=><div key={key} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{key.replaceAll("_"," ")}</p><p className="text-2xl font-semibold">{value}</p></div>)}</div>}
    {data?.all_good?<div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-emerald-800">Kontrolli ditor RLZ përfundoi pa probleme.</div>:null}
    <div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow>{["Date","Department","Employee","Task","Status","Due Date","1H Slot","Arsyeja","Koment","RLZ State","Problem / blocker"].map(x=><TableHead key={x}>{x}</TableHead>)}</TableRow></TableHeader><TableBody>
      {rows.map(({person,blocker},index)=><TableRow key={`${person.user_id}:${blocker?.task_id||index}`}><TableCell>{day}</TableCell><TableCell>{person.department}</TableCell><TableCell>{person.employee}</TableCell><TableCell>{blocker?.title||"—"}</TableCell><TableCell>{blocker?.status||"—"}</TableCell><TableCell>{blocker?.due_date||"—"}</TableCell><TableCell>{blocker?.one_h_report_slot||"—"}</TableCell><TableCell>{blocker?.reason_label||"—"}</TableCell><TableCell>{blocker?.comment||"—"}</TableCell><TableCell>{person.rlz_close_state.status}</TableCell><TableCell>{blocker?.issues.map(x=>x.message).join(" · ")||person.rlz_close_state.status}</TableCell></TableRow>)}
    </TableBody></Table></div></div>
}
