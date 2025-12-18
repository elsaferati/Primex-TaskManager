"use client"

import * as React from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { CreateUserDialog } from "@/components/users/create-user-dialog"
import { useAuth } from "@/lib/auth"
import type { User } from "@/lib/types"

export default function UsersPage() {
  const { user, apiFetch } = useAuth()
  const [users, setUsers] = React.useState<User[]>([])

  const load = React.useCallback(async () => {
    const res = await apiFetch("/users")
    if (res.ok) setUsers((await res.json()) as User[])
  }, [apiFetch])

  React.useEffect(() => {
    void load()
  }, [load])

  if (!user || user.role === "staff") {
    return <div className="text-sm text-muted-foreground">Forbidden.</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-lg font-semibold">Users</div>
        <CreateUserDialog onCreated={load} />
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
