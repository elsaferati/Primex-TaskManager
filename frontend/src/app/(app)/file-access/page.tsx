"use client"

import * as React from "react"
import { Check, FolderLock, Search, ShieldCheck, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth"
import { cn } from "@/lib/utils"

type FileAccessFolder = {
  id: number
  fullPath?: string | null
  relativePath?: string | null
  folderName: string
  hasChildren?: boolean | null
}

type FileAccessRequest = {
  id: string
  requester_user_id: string
  requester_name: string
  requester_sam_account_name: string
  folder_id?: number | null
  folder_path?: string | null
  folder_name: string
  reason?: string | null
  status: "pending" | "approved" | "rejected"
  approver_name?: string | null
  decision_note?: string | null
  created_at: string
  decided_at?: string | null
}

type UserMapping = {
  user_id: string
  full_name: string
  email: string
  username?: string | null
  sam_account_name: string
  can_approve: boolean
}

type AccessRecord = Record<string, unknown>

function readError(detail: unknown, fallback: string) {
  if (typeof detail === "string" && detail.trim()) return detail
  if (detail && typeof detail === "object" && "detail" in detail) {
    const value = (detail as { detail?: unknown }).detail
    if (typeof value === "string" && value.trim()) return value
  }
  return fallback
}

function formatDate(value?: string | null) {
  if (!value) return "-"
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
}

function statusBadge(status: FileAccessRequest["status"]) {
  if (status === "approved") return "bg-emerald-50 text-emerald-700 border-emerald-200"
  if (status === "rejected") return "bg-rose-50 text-rose-700 border-rose-200"
  return "bg-amber-50 text-amber-700 border-amber-200"
}

function getAccessValue(record: AccessRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string" || typeof value === "number") return String(value)
  }
  return ""
}

export default function FileAccessPage() {
  const { user, apiFetch } = useAuth()
  const [mappings, setMappings] = React.useState<UserMapping[]>([])
  const [requests, setRequests] = React.useState<FileAccessRequest[]>([])
  const [folders, setFolders] = React.useState<FileAccessFolder[]>([])
  const [accessRecords, setAccessRecords] = React.useState<AccessRecord[]>([])
  const [search, setSearch] = React.useState("")
  const [selectedFolderId, setSelectedFolderId] = React.useState<string>("")
  const [manualPath, setManualPath] = React.useState("")
  const [reason, setReason] = React.useState("")
  const [removeSam, setRemoveSam] = React.useState("")
  const [removeFolderPath, setRemoveFolderPath] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [searching, setSearching] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [actingId, setActingId] = React.useState<string | null>(null)

  const myMapping = React.useMemo(
    () => mappings.find((mapping) => mapping.user_id === user?.id) || null,
    [mappings, user?.id]
  )
  const canApprove = myMapping?.can_approve || false
  const selectedFolder = folders.find((folder) => String(folder.id) === selectedFolderId) || null
  const pendingRequests = requests.filter((request) => request.status === "pending")

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [mappingRes, requestRes] = await Promise.all([
        apiFetch("/file-access/users/map"),
        apiFetch("/file-access/requests"),
      ])
      if (mappingRes.ok) setMappings((await mappingRes.json()) as UserMapping[])
      if (requestRes.ok) setRequests((await requestRes.json()) as FileAccessRequest[])
      if (!mappingRes.ok || !requestRes.ok) toast.error("Failed to load file access data")
    } finally {
      setLoading(false)
    }
  }, [apiFetch])

  React.useEffect(() => {
    void load()
  }, [load])

  const runSearch = async () => {
    setSearching(true)
    try {
      const params = new URLSearchParams({ limit: "50" })
      if (search.trim()) params.set("search", search.trim())
      const res = await apiFetch(`/file-access/folders?${params.toString()}`)
      if (!res.ok) {
        let detail: unknown = null
        try {
          detail = await res.json()
        } catch {
          detail = null
        }
        toast.error(readError(detail, "Folder search failed"))
        return
      }
      const items = (await res.json()) as FileAccessFolder[]
      setFolders(items)
      if (items[0]) setSelectedFolderId(String(items[0].id))
    } finally {
      setSearching(false)
    }
  }

  const submitRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const path = manualPath.trim()
    if (!selectedFolder && !path) {
      toast.error("Select a folder or enter a folder path")
      return
    }
    setSubmitting(true)
    try {
      const payload = selectedFolder
        ? {
            folder_id: selectedFolder.id,
            folder_path: selectedFolder.fullPath,
            folder_name: selectedFolder.relativePath || selectedFolder.folderName,
            reason: reason.trim() || null,
          }
        : {
            folder_path: path,
            folder_name: path.split("\\").filter(Boolean).pop() || path,
            reason: reason.trim() || null,
          }
      const res = await apiFetch("/file-access/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        let detail: unknown = null
        try {
          detail = await res.json()
        } catch {
          detail = null
        }
        toast.error(readError(detail, "Request failed"))
        return
      }
      toast.success("Access request sent")
      setReason("")
      setManualPath("")
      await load()
    } finally {
      setSubmitting(false)
    }
  }

  const decide = async (request: FileAccessRequest, action: "approve" | "reject") => {
    setActingId(request.id)
    try {
      const res = await apiFetch(`/file-access/requests/${request.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: null }),
      })
      if (!res.ok) {
        let detail: unknown = null
        try {
          detail = await res.json()
        } catch {
          detail = null
        }
        toast.error(readError(detail, `Failed to ${action} request`))
        return
      }
      toast.success(action === "approve" ? "Access approved" : "Request rejected")
      await load()
    } finally {
      setActingId(null)
    }
  }

  const loadAccess = async () => {
    const folderId = selectedFolder?.id
    const params = folderId ? `?folder_id=${folderId}` : ""
    const res = await apiFetch(`/file-access/access${params}`)
    if (!res.ok) {
      toast.error("Failed to load current access")
      return
    }
    const data = (await res.json()) as { items: AccessRecord[] }
    setAccessRecords(data.items || [])
  }

  const removeAccess = async (record?: AccessRecord) => {
    const sam = record ? getAccessValue(record, ["samAccountName", "sam_account_name", "userSam", "userName"]) : removeSam.trim()
    const folderIdValue = record ? getAccessValue(record, ["folderId", "folder_id"]) : selectedFolderId
    const folderPathValue = record ? getAccessValue(record, ["folderPath", "fullPath", "path"]) : removeFolderPath.trim()
    if (!sam || (!folderIdValue && !folderPathValue)) {
      toast.error("User and folder are required")
      return
    }
    const res = await apiFetch("/file-access/access/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sam_account_name: sam,
        folder_id: folderIdValue ? Number(folderIdValue) : null,
        folder_path: folderPathValue || null,
      }),
    })
    if (!res.ok) {
      toast.error("Failed to remove access")
      return
    }
    toast.success("Access removed")
    setRemoveSam("")
    setRemoveFolderPath("")
    await loadAccess()
  }

  if (loading) return <div className="text-sm text-muted-foreground">Loading file access...</div>

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="rounded-lg border bg-gradient-to-r from-slate-950 to-slate-800 p-6 text-white shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <FolderLock className="h-4 w-4" />
              File access
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Request folder access</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">
                Search a managed folder, send a request, and Laurent Hoxha or Endi Hyseni can approve it from here.
              </p>
            </div>
          </div>
          <div className="rounded-md border border-white/15 bg-white/10 px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-slate-300">Your FileAccess user</div>
            <div className="mt-1 text-lg font-semibold">{myMapping?.sam_account_name || "Not mapped"}</div>
            <div className="text-xs text-slate-300">{user?.full_name || user?.email}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-base">New request</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={submitRequest}>
              <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                <div className="space-y-2">
                  <Label htmlFor="folder-search">Search folders</Label>
                  <Input
                    id="folder-search"
                    placeholder="BEGROS, STD, CLIENTS..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <Button type="button" className="self-end" variant="outline" onClick={runSearch} disabled={searching}>
                  <Search className="h-4 w-4" />
                  {searching ? "Searching..." : "Search"}
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Selected folder</Label>
                <Select value={selectedFolderId} onValueChange={setSelectedFolderId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Search and select a folder" />
                  </SelectTrigger>
                  <SelectContent>
                    {folders.map((folder) => (
                      <SelectItem key={folder.id} value={String(folder.id)}>
                        {folder.relativePath || folder.folderName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedFolder?.fullPath ? (
                  <p className="break-all text-xs text-muted-foreground">{selectedFolder.fullPath}</p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="manual-folder-path">Folder path if it does not appear in search</Label>
                <Input
                  id="manual-folder-path"
                  placeholder="F:\\FILES\\10_ZHVILLIM\\05_CLIENTS\\02_STD"
                  value={manualPath}
                  onChange={(event) => setManualPath(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="access-reason">Reason</Label>
                <Textarea
                  id="access-reason"
                  placeholder="Why do you need access?"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>

              <Button type="submit" disabled={submitting}>
                {submitting ? "Sending..." : "Send request"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-base">Request history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {requests.length ? (
              requests.slice(0, 8).map((request) => (
                <div key={request.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{request.folder_name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {request.requester_name} ({request.requester_sam_account_name}) Â- {formatDate(request.created_at)}
                      </div>
                    </div>
                    <Badge variant="outline" className={cn("capitalize", statusBadge(request.status))}>
                      {request.status}
                    </Badge>
                  </div>
                  {request.reason ? <p className="mt-2 text-sm text-slate-700">{request.reason}</p> : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No requests yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {canApprove ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <Card className="rounded-lg">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4" />
                  Approvals
                </CardTitle>
                <Badge variant="secondary">{pendingRequests.length} pending</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {pendingRequests.length ? (
                pendingRequests.map((request) => (
                  <div key={request.id} className="rounded-md border p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <div className="font-medium">{request.folder_name}</div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {request.requester_name} maps to {request.requester_sam_account_name}
                        </div>
                        {request.folder_path ? <div className="mt-1 break-all text-xs text-muted-foreground">{request.folder_path}</div> : null}
                        {request.reason ? <p className="mt-3 text-sm text-slate-700">{request.reason}</p> : null}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => void decide(request, "approve")} disabled={actingId === request.id}>
                          <Check className="h-4 w-4" />
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => void decide(request, "reject")} disabled={actingId === request.id}>
                          <X className="h-4 w-4" />
                          Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No pending requests.</p>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-lg">
            <CardHeader>
              <CardTitle className="text-base">Manage current access</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={loadAccess}>
                  Load access for selected folder
                </Button>
              </div>

              {accessRecords.length ? (
                <div className="space-y-2">
                  {accessRecords.map((record, index) => {
                    const sam = getAccessValue(record, ["samAccountName", "sam_account_name", "userSam", "userName"]) || "Unknown user"
                    const path = getAccessValue(record, ["folderPath", "fullPath", "path", "relativePath"])
                    return (
                      <div key={`${sam}-${index}`} className="flex items-center justify-between gap-3 rounded-md border p-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{sam}</div>
                          {path ? <div className="truncate text-xs text-muted-foreground">{path}</div> : null}
                        </div>
                        <Button size="icon-sm" variant="ghost" onClick={() => void removeAccess(record)} aria-label="Remove access">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Load a folder to see current access records.</p>
              )}

              <div className="rounded-md border bg-slate-50 p-3">
                <div className="mb-3 text-sm font-medium">Remove manually</div>
                <div className="space-y-3">
                  <Input placeholder="FileAccess user, e.g. ESH" value={removeSam} onChange={(event) => setRemoveSam(event.target.value)} />
                  <Input
                    placeholder="Folder path if no selected folder"
                    value={removeFolderPath}
                    onChange={(event) => setRemoveFolderPath(event.target.value)}
                  />
                  <Button type="button" variant="outline" onClick={() => void removeAccess()}>
                    Remove access
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}


