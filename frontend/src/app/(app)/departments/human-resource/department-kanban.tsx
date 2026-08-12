"use client"

import { DailyRlzPanel } from "@/components/daily-rlz-panel"

export default function DepartmentKanban() {
  return (
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <div className="w-full p-4">
        <DailyRlzPanel />
        <div className="text-center">
        <h1 className="text-2xl font-semibold mb-2">Human Resource Department</h1>
        <p className="text-muted-foreground">Cooming soon...</p>
        </div>
      </div>
    </div>
  )
}
