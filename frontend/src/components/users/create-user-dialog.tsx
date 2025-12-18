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
import type { User, UserRole } from "@/lib/types"

const createUserSchema = z.object({
  full_name: z.string().max(200, { message: "Full name is too long" }).optional().or(z.literal("")),
  username: z
    .string()
    .min(3, { message: "Username must be at least 3 characters" })
    .max(64, { message: "Username must be at most 64 characters" }),
  email: z.string().email({ message: "Invalid email address" }),
  role: z.enum(["admin", "manager", "staff"]),
  password: z
    .string()
    .min(8, { message: "Must be at least 8 characters" })
    .regex(/[a-z]/, { message: "Must contain 1 lowercase letter" })
    .regex(/[A-Z]/, { message: "Must contain 1 uppercase letter" })
    .regex(/\d/, { message: "Must contain 1 number" }),
})

export type CreateUserFormValues = z.infer<typeof createUserSchema>

export function CreateUserDialog({
  onCreated,
  triggerLabel = "Create user",
}: {
  onCreated?: (user: User) => void | Promise<void>
  triggerLabel?: string
}) {
  const { apiFetch, user } = useAuth()
  const [open, setOpen] = React.useState(false)

  const form = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      full_name: "",
      username: "",
      email: "",
      role: "staff",
      password: "",
    },
  })

  if (!user || user.role !== "admin") {
    return null
  }

  const submit = async (values: CreateUserFormValues) => {
    const res = await apiFetch("/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: values.email.trim(),
        username: values.username.trim(),
        full_name: values.full_name?.trim() || null,
        role: values.role as UserRole,
        password: values.password,
      }),
    })

    if (!res.ok) {
      let detail = "Failed to create user"
      try {
        const data = (await res.json()) as { detail?: string }
        if (data?.detail) detail = data.detail
      } catch {
        // ignore response parse errors
      }
      toast.error(detail)
      return
    }

    const created = (await res.json()) as User
    toast.success("User created")
    form.reset()
    setOpen(false)
    if (onCreated) {
      await onCreated(created)
    }
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
        <Button>{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New user</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={form.handleSubmit(submit)}>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="create-user-email">Email</Label>
              <Input id="create-user-email" type="email" {...form.register("email")} />
              {form.formState.errors.email ? (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-user-username">Username</Label>
              <Input id="create-user-username" {...form.register("username")} />
              {form.formState.errors.username ? (
                <p className="text-xs text-destructive">{form.formState.errors.username.message}</p>
              ) : null}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-user-full-name">Full name</Label>
            <Input id="create-user-full-name" {...form.register("full_name")} />
            {form.formState.errors.full_name ? (
              <p className="text-xs text-destructive">{form.formState.errors.full_name.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            {form.formState.errors.role ? (
              <p className="text-xs text-destructive">{form.formState.errors.role.message}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="create-user-password">Password</Label>
            <Input id="create-user-password" type="password" {...form.register("password")} />
            {form.formState.errors.password ? (
              <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
            ) : null}
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
