"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useAuth } from "@/lib/auth"
import type { Department, User, UserRole } from "@/lib/types"

export default function UsersPage() {
  const { user, apiFetch } = useAuth()
  const [users, setUsers] = React.useState<User[]>([])
  const [departments, setDepartments] = React.useState<Department[]>([])
  const [open, setOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    const res = await apiFetch("/users")
    if (res.ok) setUsers((await res.json()) as User[])
  }, [apiFetch])

  React.useEffect(() => {
    void load()
    const boot = async () => {
      const depRes = await apiFetch("/departments")
      if (depRes.ok) setDepartments((await depRes.json()) as Department[])
    }
    void boot()
  }, [apiFetch, load])

  if (!user || user.role === "staff") {
    return <div className="text-sm text-muted-foreground">Forbidden.</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-lg font-semibold">Users</div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Create user</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>New user</DialogTitle>
            </DialogHeader>
            <CreateUserForm
              currentRole={user.role}
              currentDepartmentId={user.department_id || ""}
              departments={departments}
              onCreated={async () => {
                setOpen(false)
                await load()
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Directory</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.username}</TableCell>
                  <TableCell>{u.full_name || "-"}</TableCell>
                  <TableCell>{u.role}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function CreateUserForm({
  currentRole,
  currentDepartmentId,
  departments,
  onCreated,
}: {
  currentRole: UserRole
  currentDepartmentId: string
  departments: Department[]
  onCreated: () => Promise<void>
}) {
  const { apiFetch } = useAuth()
  const [email, setEmail] = React.useState("")
  const [username, setUsername] = React.useState("")
  const [fullName, setFullName] = React.useState("")
  const [role, setRole] = React.useState<UserRole>(currentRole === "manager" ? "staff" : "staff")
  const [departmentId, setDepartmentId] = React.useState(currentRole === "manager" ? currentDepartmentId : "")
  const [password, setPassword] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)

  const submit = async () => {
    setSubmitting(true)
    try {
      const res = await apiFetch("/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          username,
          full_name: fullName || null,
          role: currentRole === "manager" ? "staff" : role,
          department_id: currentRole === "manager" ? currentDepartmentId : departmentId || null,
          password,
        }),
      })
      if (!res.ok) return
      await onCreated()
      setEmail("")
      setUsername("")
      setFullName("")
      setPassword("")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Email</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Username</Label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Full name</Label>
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>
      {currentRole === "admin" ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
              <SelectTrigger>
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Department</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger>
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}
      <div className="space-y-2">
        <Label>Password</Label>
        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <div className="flex justify-end">
        <Button
          disabled={!email.trim() || !username.trim() || password.length < 8 || submitting}
          onClick={() => void submit()}
        >
          {submitting ? "Creating..." : "Create"}
        </Button>
      </div>
    </div>
  )
}

