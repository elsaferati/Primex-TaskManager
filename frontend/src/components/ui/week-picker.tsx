"use client"

import * as React from "react"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function shiftDate(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function monday(date: Date) {
  return shiftDate(date, -((date.getDay() + 6) % 7))
}

function formatDate(date: Date) {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`
}

function weekLabel(start: Date) {
  return `${formatDate(start)} – ${formatDate(shiftDate(start, 6))}`
}

function WeekPicker({ value, onChange, id }: { value: string; onChange: (value: string) => void; id?: string }) {
  const selected = monday(new Date(`${value}T12:00:00`))
  const [month, setMonth] = React.useState(() => new Date(selected.getFullYear(), selected.getMonth(), 1, 12))
  const first = monday(month)
  const weeks: Date[] = []
  for (let start = first; start.getMonth() === month.getMonth() || start <= month; start = shiftDate(start, 7)) {
    weeks.push(start)
  }

  return (
    <DropdownMenu onOpenChange={(open) => {
      if (open) setMonth(new Date(selected.getFullYear(), selected.getMonth(), 1, 12))
    }}>
      <DropdownMenuTrigger asChild>
        <Button id={id} variant="outline" className="w-full justify-between font-normal">
          <span>{weekLabel(selected)}</span>
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 p-2">
        <div className="flex items-center justify-between gap-2 pb-2">
          <DropdownMenuItem aria-label="Muaji i kaluar" onSelect={(event) => {
            event.preventDefault()
            setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1, 12))
          }} className="cursor-pointer p-2">
            <ChevronLeft />
          </DropdownMenuItem>
          <span aria-live="polite" className="text-sm font-semibold capitalize">
            {month.toLocaleDateString("sq-AL", { month: "long", year: "numeric" })}
          </span>
          <DropdownMenuItem aria-label="Muaji i ardhshëm" onSelect={(event) => {
            event.preventDefault()
            setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1, 12))
          }} className="cursor-pointer p-2">
            <ChevronRight />
          </DropdownMenuItem>
        </div>
        <div className="grid grid-cols-7 py-1 text-center text-xs text-muted-foreground">
          {["Hën", "Mar", "Mër", "Enj", "Pre", "Sht", "Die"].map((day) => <span key={day}>{day}</span>)}
        </div>
        <DropdownMenuRadioGroup value={isoDate(selected)} onValueChange={onChange}>
          {weeks.map((start) => (
            <DropdownMenuRadioItem
              key={isoDate(start)}
              value={isoDate(start)}
              aria-label={`Java ${weekLabel(start)}`}
              title={weekLabel(start)}
              className={cn("my-1 grid cursor-pointer grid-cols-7 gap-0 px-0 py-2 text-center [&>span:first-child]:hidden", isoDate(start) === isoDate(selected) && "bg-primary text-primary-foreground focus:bg-primary focus:text-primary-foreground")}
            >
              {Array.from({ length: 7 }, (_, index) => {
                const day = shiftDate(start, index)
                return <span key={index} className={cn(day.getMonth() !== month.getMonth() && "opacity-40")}>{day.getDate()}</span>
              })}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <p className="border-t pt-2 text-center text-xs text-muted-foreground">Zgjidh një rresht për të zgjedhur javën.</p>
        <DropdownMenuItem className="mt-1 cursor-pointer justify-center text-primary" onSelect={() => onChange(isoDate(monday(new Date())))}>
          Java aktuale
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { WeekPicker }
