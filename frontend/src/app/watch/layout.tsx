import type { ReactNode } from "react"

export default function WatchLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto w-full max-w-[420px] px-3 py-4">{children}</div>
    </div>
  )
}
