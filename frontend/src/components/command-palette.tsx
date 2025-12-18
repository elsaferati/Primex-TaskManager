"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { useAuth } from "@/lib/auth"

type SearchTask = { id: string; title: string }
type SearchProject = { id: string; name: string }

export function CommandPalette() {
  const router = useRouter()
  const { apiFetch } = useAuth()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<{ tasks: SearchTask[]; projects: SearchProject[] }>({
    tasks: [],
    projects: [],
  })

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  React.useEffect(() => {
    const q = query.trim()
    if (!open || q.length < 2) {
      setResults({ tasks: [], projects: [] })
      return
    }

    const handle = window.setTimeout(async () => {
      try {
        const res = await apiFetch(`/search?q=${encodeURIComponent(q)}`)
        if (!res.ok) return
        const data = (await res.json()) as { tasks: SearchTask[]; projects: SearchProject[] }
        setResults(data)
      } catch {
        // ignore
      }
    }, 200)

    return () => window.clearTimeout(handle)
  }, [open, query, apiFetch])

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search tasks and projects..." value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        {results.tasks.length ? (
          <CommandGroup heading="Tasks">
            {results.tasks.map((t) => (
              <CommandItem
                key={t.id}
                onSelect={() => {
                  setOpen(false)
                  router.push(`/tasks/${t.id}`)
                }}
              >
                {t.title}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {results.projects.length ? (
          <CommandGroup heading="Projects">
            {results.projects.map((p) => (
              <CommandItem
                key={p.id}
                onSelect={() => {
                  setOpen(false)
                  router.push(`/projects/${p.id}`)
                }}
              >
                {p.name}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </CommandDialog>
  )
}
