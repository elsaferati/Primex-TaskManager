import { demoBrief, demoNews } from "./news.mock"
import type { DailyBrief, NewsEntry } from "../types"

export interface IntelligenceFeed { items: NewsEntry[]; isDemo: boolean; brief: DailyBrief | null }
export type ReadState = "all" | "unread" | "read"
export interface IntelligenceFeedService { getFeed(apiFetch: (path: string) => Promise<Response>, readState?: ReadState): Promise<IntelligenceFeed> }

export const intelligenceFeedService: IntelligenceFeedService = {
  async getFeed(apiFetch, readState = "all") {
    const response = await apiFetch(`/intelligence/items?read_state=${readState}`)
    if (!response.ok) throw new Error("Could not load intelligence updates.")
    const payload = await response.json() as { items: NewsEntry[]; hasLiveSources: boolean }
    return payload.hasLiveSources
      ? { items: payload.items, isDemo: false, brief: null }
      : { items: demoNews, isDemo: true, brief: demoBrief }
  },
}
