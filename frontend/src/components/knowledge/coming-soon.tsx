import type { LucideIcon } from "lucide-react"
import { Clock3 } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"

export function KnowledgeComingSoon({
  title,
  description,
  icon: Icon,
}: {
  title: string
  description: string
  icon: LucideIcon
}) {
  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Knowledge PX</p>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      </div>
      <Card className="border-dashed shadow-none">
        <CardContent className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Icon className="h-7 w-7 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-semibold">Coming soon</p>
            <p className="max-w-md text-sm text-muted-foreground">{description}</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" />
            Në zhvillim
          </span>
        </CardContent>
      </Card>
    </div>
  )
}
