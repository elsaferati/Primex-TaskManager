"use client"

import * as React from "react"
import Link from "next/link"
import { ExternalLink, Plus, Shield } from "lucide-react"
import { toast } from "sonner"

import { useConfirm } from "@/components/providers/confirm-dialog-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth"
import type { ExternalPlatformLink } from "@/lib/types"

type LinkFormState = {
  label: string
  href: string
  description: string
  sort_order: string
  is_active: boolean
}

const EMPTY_FORM: LinkFormState = {
  label: "",
  href: "",
  description: "",
  sort_order: "0",
  is_active: true,
}

function getErrorMessage(detail: unknown, fallback: string) {
  return typeof detail === "string" && detail.trim() ? detail : fallback
}

export default function PlatformsPage() {
  const { user, apiFetch } = useAuth()
  const confirm = useConfirm()
  const canManage = user?.role === "ADMIN" || user?.role === "MANAGER"
  const [links, setLinks] = React.useState<ExternalPlatformLink[]>([])
  const [loading, setLoading] = React.useState(true)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingLink, setEditingLink] = React.useState<ExternalPlatformLink | null>(null)
  const [form, setForm] = React.useState<LinkFormState>(EMPTY_FORM)
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const suffix = canManage ? "?include_inactive=true" : ""
      const res = await apiFetch(`/external-platform-links${suffix}`)
      if (!res.ok) {
        let detail: unknown = null
        try {
          detail = (await res.json()) as { detail?: string }
        } catch {
          detail = null
        }
        toast.error(getErrorMessage((detail as { detail?: string } | null)?.detail, "Failed to load links"))
        return
      }
      setLinks((await res.json()) as ExternalPlatformLink[])
    } finally {
      setLoading(false)
    }
  }, [apiFetch, canManage])

  React.useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    setEditingLink(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  const openEdit = (link: ExternalPlatformLink) => {
    setEditingLink(link)
    setForm({
      label: link.label,
      href: link.href,
      description: link.description || "",
      sort_order: String(link.sort_order),
      is_active: link.is_active,
    })
    setDialogOpen(true)
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const label = form.label.trim()
    const href = form.href.trim()
    if (!label || !href) {
      toast.error("Label and URL are required")
      return
    }

    setSaving(true)
    try {
      const sortOrder = Number.parseInt(form.sort_order || "0", 10)
      const payload = {
        label,
        href,
        description: form.description.trim() || null,
        sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
        is_active: form.is_active,
      }
      const res = await apiFetch(editingLink ? `/external-platform-links/${editingLink.id}` : "/external-platform-links", {
        method: editingLink ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        let detail: unknown = null
        try {
          detail = (await res.json()) as { detail?: string }
        } catch {
          detail = null
        }
        toast.error(getErrorMessage((detail as { detail?: string } | null)?.detail, "Failed to save link"))
        return
      }

      toast.success(editingLink ? "Link updated" : "Link created")
      setDialogOpen(false)
      setEditingLink(null)
      setForm(EMPTY_FORM)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (link: ExternalPlatformLink) => {
    const res = await apiFetch(`/external-platform-links/${link.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !link.is_active }),
    })
    if (!res.ok) {
      toast.error(`Failed to ${link.is_active ? "disable" : "enable"} link`)
      return
    }
    toast.success(link.is_active ? "Link disabled" : "Link enabled")
    await load()
  }

  const removeLink = async (link: ExternalPlatformLink) => {
    const confirmed = await confirm({
      title: "Delete link",
      description: `Delete ${link.label}?`,
      confirmLabel: "Delete",
      variant: "destructive",
    })
    if (!confirmed) return

    const res = await apiFetch(`/external-platform-links/${link.id}`, { method: "DELETE" })
    if (!res.ok) {
      toast.error("Failed to delete link")
      return
    }
    toast.success("Link deleted")
    await load()
  }

  const activeLinks = links.filter((link) => link.is_active)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">PrimexEU Links</h1>
          <p className="text-sm text-muted-foreground">Open connected PrimexEU tools from one place.</p>
        </div>
        {canManage ? (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add link
          </Button>
        ) : null}
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading links...</div>
      ) : activeLinks.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {activeLinks.map((link) => (
            <Link
              key={link.id}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="block"
            >
              <Card className="h-full border border-slate-200 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Shield className="h-5 w-5 text-slate-500" />
                      <CardTitle className="text-base">{link.label}</CardTitle>
                    </div>
                    <ExternalLink className="h-4 w-4 text-slate-400" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {link.description ? <p className="text-sm text-slate-700">{link.description}</p> : null}
                  <p className="text-sm text-muted-foreground break-all">{link.href}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No active links available yet.
          </CardContent>
        </Card>
      )}

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Manage links</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {links.map((link) => (
                  <TableRow key={link.id}>
                    <TableCell>
                      <div className="font-medium">{link.label}</div>
                      {link.description ? (
                        <div className="text-xs text-muted-foreground">{link.description}</div>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-[340px] truncate">{link.href}</TableCell>
                    <TableCell>{link.sort_order}</TableCell>
                    <TableCell>
                      <Badge variant={link.is_active ? "secondary" : "outline"}>
                        {link.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="space-x-2">
                      <Link href={link.href} target="_blank" rel="noreferrer" className="text-sm hover:underline">
                        Open
                      </Link>
                      <button className="text-sm hover:underline" onClick={() => openEdit(link)}>
                        Edit
                      </button>
                      <button className="text-sm hover:underline" onClick={() => void toggleActive(link)}>
                        {link.is_active ? "Disable" : "Enable"}
                      </button>
                      <button className="text-sm text-destructive hover:underline" onClick={() => void removeLink(link)}>
                        Delete
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) {
            setEditingLink(null)
            setForm(EMPTY_FORM)
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingLink ? "Edit link" : "Add link"}</DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label htmlFor="platform-link-label">Name</Label>
              <Input
                id="platform-link-label"
                value={form.label}
                onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="platform-link-url">URL</Label>
              <Input
                id="platform-link-url"
                type="url"
                value={form.href}
                onChange={(event) => setForm((current) => ({ ...current, href: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="platform-link-description">Description</Label>
              <Textarea
                id="platform-link-description"
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="platform-link-order">Order</Label>
                <Input
                  id="platform-link-order"
                  type="number"
                  value={form.sort_order}
                  onChange={(event) => setForm((current) => ({ ...current, sort_order: event.target.value }))}
                />
              </div>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))}
                />
                Active
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : editingLink ? "Save changes" : "Create link"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
