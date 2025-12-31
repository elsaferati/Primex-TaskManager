"use client"

import * as React from "react"

import { zodResolver } from "@hookform/resolvers/zod"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/lib/auth"
import type { Department, User, UserRole } from "@/lib/types"

const editUserSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  username: z
    .string()
    .min(3, { message: "Username must be at least 3 characters" })
    .max(64, { message: "Username must be at most 64 characters" }),
  full_name: z.string().max(200, { message: "Full name is too long" }).optional().or(z.literal("")),
  role: z.enum(["ADMIN", "MANAGER", "STAFF"]).optional(),
  department_id: z.string().uuid().optional().or(z.literal("__none__")),
  password: z
    .string()
    .min(8, { message: "Must be at least 8 characters" })
    .regex(/[a-z]/, { message: "Must contain 1 lowercase letter" })
    .regex(/[A-Z]/, { message: "Must contain 1 uppercase letter" })
    .regex(/\d/, { message: "Must contain 1 number" })
    .optional()
    .or(z.literal("")),
})

export type EditUserFormValues = z.infer<typeof editUserSchema>

export function EditUserDialog({
  userRecord,
  departments,
  onUpdated,
}: {
  userRecord: User
  departments: Department[]
  onUpdated: (user: User) => void | Promise<void>
}) {
  const { apiFetch, user } = useAuth()
  const [open, setOpen] = React.useState(false)
  const NONE_VALUE = "__none__"
  const canEditRoleDepartment = user?.role === "ADMIN"

  const form = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      email: userRecord.email,
      username: userRecord.username || "",
      full_name: userRecord.full_name || "",
      role: userRecord.role,
      department_id: userRecord.department_id || NONE_VALUE,
      password: "",
    },
  })

  React.useEffect(() => {
    form.reset({
      email: userRecord.email,
      username: userRecord.username || "",
      full_name: userRecord.full_name || "",
      role: userRecord.role,
      department_id: userRecord.department_id || NONE_VALUE,
      password: "",
    })
  }, [form, userRecord, NONE_VALUE])

  const submit = async (values: EditUserFormValues) => {
    const body: Record<string, unknown> = {
      email: values.email.trim(),
      username: values.username.trim(),
      full_name: values.full_name?.trim() || null,
    }

    if (canEditRoleDepartment) {
      body.role = values.role as UserRole
      body.department_id = values.department_id === NONE_VALUE ? null : values.department_id
    }

    if (values.password && values.password.length > 0) {
      body.password = values.password
    }

    const res = await apiFetch(`/users/${userRecord.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      let detail = "Failed to update user"
      try {
        const data = (await res.json()) as { detail?: string }
        if (data?.detail) detail = data.detail
      } catch {
        // ignore response parse errors
      }
      toast.error(detail)
      return
    }

    const updated = (await res.json()) as User
    toast.success("User updated")
    setOpen(false)
    await onUpdated(updated)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) form.reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={form.handleSubmit(submit)}>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-user-email">Email</Label>
              <Input id="edit-user-email" type="email" {...form.register("email")} />
              {form.formState.errors.email ? (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-user-username">Username</Label>
              <Input id="edit-user-username" {...form.register("username")} />
              {form.formState.errors.username ? (
                <p className="text-xs text-destructive">{form.formState.errors.username.message}</p>
              ) : null}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-user-full-name">Full name</Label>
            <Input id="edit-user-full-name" {...form.register("full_name")} />
            {form.formState.errors.full_name ? (
              <p className="text-xs text-destructive">{form.formState.errors.full_name.message}</p>
            ) : null}
          </div>
          {canEditRoleDepartment ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Role</Label>
                <Controller
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <Select value={field.value ?? "STAFF"} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                        <SelectItem value="MANAGER">Manager</SelectItem>
                        <SelectItem value="STAFF">Staff</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Controller
                  control={form.control}
                  name="department_id"
                  render={({ field }) => (
                    <Select value={field.value ?? NONE_VALUE} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Department" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE_VALUE}>None</SelectItem>
                        {departments.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="edit-user-password">New password</Label>
            <Input id="edit-user-password" type="password" {...form.register("password")} />
            {form.formState.errors.password ? (
              <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
            ) : null}
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}


