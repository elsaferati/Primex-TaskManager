"use client"

import { PrimeflowEmbedPage } from "@/components/primeflow-embed-page"
import { useAuth } from "@/lib/auth"
import { API_HTTP_URL } from "@/lib/config"

export default function PrimeflowClassificationsPage() {
  const { user } = useAuth()
  const params = new URLSearchParams({
    v: "2026080634",
    api: API_HTTP_URL,
    role: user?.role || "STAFF",
    user: user?.full_name || user?.username || "User",
  })

  return (
    <PrimeflowEmbedPage
      src={`/primeflow-embed-base/classifications.html?${params.toString()}`}
      title="PrimeFlow Classifications"
    />
  )
}
