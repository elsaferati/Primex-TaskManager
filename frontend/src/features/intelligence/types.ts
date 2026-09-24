export type NewsCategory = "GRANT" | "TENDER" | "BUSINESS" | "TECHNOLOGY" | "EVENT" | "REGULATION" | "PARTNERSHIP" | "NEWS"
export type NewsPriority = "HIGH" | "MEDIUM" | "NORMAL"
export type IntelligenceView = "overview" | "news" | "opportunities" | "saved"
export type NewsFilter = "For You" | "All" | "Grants" | "Tenders" | "Business" | "AI & Tech" | "Kosovo" | "EU" | "Events"

export interface NewsAnalysis {
  summary: string
  category: NewsCategory
  importanceScore: number
  relevanceScore: number
  whyItMatters: string | null
  deadline: string | null
  fundingAmount: string | null
  eligibility: string | null
  opportunityType: string | null
  tags: string[]
}

export interface NewsEntry {
  id: string
  sourceId: string
  sourceName: string
  sourceType: string
  externalId: string | null
  // The original article/call URL. Demo-only illustrative entries may have none.
  url: string | null
  title: string
  originalText: string | null
  publishedAt: string
  imageUrl: string | null
  contentHash: string | null
  createdAt: string
  readAt?: string | null
  location: string | null
  priority: NewsPriority
  analysis: NewsAnalysis
}

export interface DailyBrief {
  generatedAt: string
  headline: string
  itemIds: string[]
  closingNote: string
}

export type SourceType = "WEBSITE" | "RSS" | "LINKEDIN" | "FACEBOOK" | "API" | "OTHER"
export type SourceStatus = "ACTIVE" | "PAUSED"
export type SourcePriority = "HIGH" | "NORMAL" | "LOW"

export interface NewsSource {
  id: string
  name: string
  url: string
  type: SourceType
  status: SourceStatus
  priority: SourcePriority
  categories: string[]
  ai_instructions: string | null
  fetch_interval_minutes: number
  last_checked_at: string | null
  last_started_at: string | null
  pending_snapshot_id: string | null
  last_error: string | null
  collection_supported: boolean
  created_at: string
  updated_at: string
}

export type NewsSourceInput = Pick<NewsSource, "name" | "url" | "type" | "status" | "priority" | "categories" | "ai_instructions" | "fetch_interval_minutes">
