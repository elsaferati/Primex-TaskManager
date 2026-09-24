import { demoBrief, demoNews } from "./news.mock"
import type { DailyBrief, NewsEntry } from "../types"

// A single boundary for the demo feed; a future API implementation can replace this.
export interface IntelligenceFeedService {
  getFeed(): Promise<NewsEntry[]>
  getBrief(): Promise<DailyBrief>
}

export const intelligenceFeedService: IntelligenceFeedService = {
  async getFeed() { return demoNews },
  async getBrief() { return demoBrief },
}
