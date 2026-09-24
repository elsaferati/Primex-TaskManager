import { demoBrief, demoNews } from "./news.mock"
import type { DailyBrief, NewsEntry } from "../types"

export interface IntelligenceFeed { items: NewsEntry[]; isDemo: boolean; brief: DailyBrief | null }
export interface IntelligenceFeedService { getFeed(apiFetch: (path: string) => Promise<Response>): Promise<IntelligenceFeed> }

export const intelligenceFeedService: IntelligenceFeedService = {
  async getFeed(apiFetch) {
    const response = await apiFetch("/intelligence/items")
    if (!response.ok) throw new Error("Could not load intelligence updates.")
    const payload = await response.json() as { items: NewsEntry[]; hasLiveSources: boolean }
    return payload.hasLiveSources
      ? { items: payload.items, isDemo: false, brief: null }
      : { items: demoNews, isDemo: true, brief: demoBrief }
  },
}
