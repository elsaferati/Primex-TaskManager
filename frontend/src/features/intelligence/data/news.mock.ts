import type { DailyBrief, NewsEntry, NewsCategory, NewsPriority } from "../types"

// Editorial samples only. An original URL is provided only when it points to
// the specific verified article or call, never to a source homepage.
const base = (id: string, category: NewsCategory, priority: NewsPriority, title: string, summary: string, whyItMatters: string | null, sourceName: string, articleUrl: string | null, publishedAt: string, tags: string[], extra: Partial<NewsEntry["analysis"]> & { location?: string } = {}): NewsEntry => ({
  id,
  sourceId: sourceName.toLowerCase().replace(/\W+/g, "-"),
  sourceName,
  sourceType: "Website",
  externalId: null,
  url: articleUrl,
  title,
  originalText: null,
  publishedAt,
  imageUrl: null,
  contentHash: null,
  createdAt: publishedAt,
  location: extra.location ?? null,
  priority,
  analysis: {
    summary,
    category,
    importanceScore: priority === "HIGH" ? 91 : priority === "MEDIUM" ? 72 : 48,
    relevanceScore: priority === "HIGH" ? 89 : priority === "MEDIUM" ? 70 : 45,
    whyItMatters,
    deadline: extra.deadline ?? null,
    fundingAmount: extra.fundingAmount ?? null,
    eligibility: extra.eligibility ?? null,
    opportunityType: extra.opportunityType ?? null,
    tags,
  },
})

export const demoNews: NewsEntry[] = [
  base("kiesa-digital", "GRANT", "HIGH", "Digital transformation grant for Kosovo SMEs", "A sample funding call supporting small businesses investing in software, digital services and operational upgrades.", "A program like this could support PrimEx or clients planning digital transformation work.", "KIESA", null, "2026-09-24T08:30:00+02:00", ["Kosovo", "SME", "Digitalization", "Funding"], { fundingAmount: "Up to €50,000", deadline: "2026-10-18", eligibility: "Kosovo SMEs", opportunityType: "Grant", location: "Kosovo" }),
  base("eu-western-balkans", "GRANT", "HIGH", "Interregional Innovation Investments Strand 2a call", "An EU call supports interregional consortia developing innovation investments for scale-up and market use.", "Companies building cross-border innovation partnerships may want to review the consortium and eligibility criteria.", "EISMEA", "https://eismea.ec.europa.eu/funding-opportunities/calls-proposals/interregional-innovation-investments-strand-2a-i3-2026-inv2a_en", "2026-05-13T10:00:00+02:00", ["EU", "Innovation", "Funding"], { fundingAmount: "€30.2m call budget", deadline: "2026-11-12", eligibility: "Interregional consortia", opportunityType: "Grant", location: "EU" }),
  base("public-sector-tender", "TENDER", "HIGH", "Public sector digital services tender", "A sample procurement notice requests design and development of a digital service platform.", "This is the type of tender worth qualifying early against delivery capacity and eligibility rules.", "e-Procurement Kosovo", null, "2026-09-23T16:20:00+02:00", ["Kosovo", "Public sector", "Software"], { deadline: "2026-10-12", eligibility: "Registered operators", opportunityType: "Tender", location: "Kosovo" }),
  base("openai-platform", "TECHNOLOGY", "MEDIUM", "The work now within reach with AI", "OpenAI describes how advances in AI capability and compute may make more business and research work practical to pursue.", "The article offers context for assessing where AI could expand service offerings or improve internal workflows.", "OpenAI", "https://openai.com/index/the-work-now-within-reach/", "2026-09-08T10:00:00+02:00", ["AI", "Technology", "Business"], { location: "Global" }),
  base("prishtina-event", "EVENT", "MEDIUM", "Prishtina business and technology forum", "A sample regional event brings founders, service providers and public institutions together for talks and networking.", "Useful for meeting potential partners and tracking local demand for digital services.", "Innovation Centre Kosovo", null, "2026-09-23T11:00:00+02:00", ["Kosovo", "Events", "Networking"], { deadline: "2026-10-08", location: "Prishtina" }),
  base("ministry-support", "BUSINESS", "MEDIUM", "New support measures for small businesses", "A sample government announcement outlines a package intended to help local firms improve productivity.", "The eligibility details could reveal opportunities for companies planning operations or technology upgrades.", "Government of Kosovo", null, "2026-09-22T15:00:00+02:00", ["Kosovo", "SME", "Business"], { location: "Kosovo" }),
  base("eu-compliance", "REGULATION", "MEDIUM", "EU digital compliance guidance update", "A sample policy update clarifies documentation expectations for companies delivering digital products in EU markets.", "Teams selling across borders may need to adjust product documentation and review processes.", "European Commission", null, "2026-09-22T09:00:00+02:00", ["EU", "Regulation", "Technology"], { location: "EU" }),
  base("regional-partnership", "PARTNERSHIP", "NORMAL", "Regional innovation hub opens partner applications", "A sample partnership program is looking for technology service firms to collaborate on founder support.", "Could be a channel for local visibility and future client introductions.", "Innovation Centre Kosovo", null, "2026-09-21T13:20:00+02:00", ["Kosovo", "Partnerships", "Startups"], { deadline: "2026-10-30", location: "Kosovo" }),
  base("energy-grant", "GRANT", "MEDIUM", "Energy efficiency grants for growing enterprises", "A sample call would support energy improvements for eligible small and medium enterprises.", "Potentially useful for clients with facilities or infrastructure investments.", "KIESA", null, "2026-09-20T10:30:00+02:00", ["Kosovo", "SME", "Energy", "Funding"], { fundingAmount: "Up to €25,000", deadline: "2026-11-14", eligibility: "Kosovo SMEs", opportunityType: "Grant", location: "Kosovo" }),
  base("supplier-tender", "TENDER", "NORMAL", "Municipal website modernization tender", "A sample municipal tender covers redesign, accessibility and content migration for a public website.", "The scope is close to common digital delivery work, pending qualification review.", "e-Procurement Kosovo", null, "2026-09-19T12:45:00+02:00", ["Kosovo", "Tender", "Web"], { deadline: "2026-10-23", eligibility: "Registered operators", opportunityType: "Tender", location: "Kosovo" }),
  base("european-network", "BUSINESS", "NORMAL", "EU and EIB expand financing for partner-country businesses", "A Commission agreement with EIB Global makes financing available for clean energy and digital projects, including in the Western Balkans.", "This may improve access to financing for regional businesses and their digital projects.", "European Commission", "https://enlargement.ec.europa.eu/news/eu-and-eib-boost-businesses-partner-countries-through-eu13-billion-financing-2026-04-24_en", "2026-04-24T10:00:00+02:00", ["EU", "Western Balkans", "Business", "SME"], { location: "EU" }),
  base("developer-conference", "EVENT", "NORMAL", "Regional developer conference announces program", "A sample developer conference includes sessions on product engineering, AI and security.", null, "Innovation Centre Kosovo", null, "2026-09-17T09:00:00+02:00", ["Kosovo", "Events", "Technology"], { deadline: "2026-11-04", location: "Prishtina" }),
]

export const demoBrief: DailyBrief = {
  generatedAt: "2026-09-24T08:00:00+02:00",
  headline: "Three signals to keep on your radar.",
  itemIds: ["kiesa-digital", "eu-western-balkans", "public-sector-tender"],
  closingNote: "Funding and procurement lead today’s sample briefing.",
}
