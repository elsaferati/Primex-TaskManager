import type { DailyBrief, NewsEntry, NewsCategory, NewsPriority } from "../types"

// Editorial samples only. These are not claims about live announcements.
const base = (id: string, category: NewsCategory, priority: NewsPriority, title: string, summary: string, whyItMatters: string | null, sourceName: string, sourceUrl: string, publishedAt: string, tags: string[], extra: Partial<NewsEntry["analysis"]> & { location?: string } = {}): NewsEntry => ({
  id,
  sourceId: sourceName.toLowerCase().replace(/\W+/g, "-"),
  sourceName,
  sourceType: "Website",
  externalId: null,
  url: sourceUrl,
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
  base("kiesa-digital", "GRANT", "HIGH", "Digital transformation grant for Kosovo SMEs", "A sample funding call supporting small businesses investing in software, digital services and operational upgrades.", "A program like this could support PrimEx or clients planning digital transformation work.", "KIESA", "https://kiesa.rks-gov.net/", "2026-09-24T08:30:00+02:00", ["Kosovo", "SME", "Digitalization", "Funding"], { fundingAmount: "Up to €50,000", deadline: "2026-10-18", eligibility: "Kosovo SMEs", opportunityType: "Grant", location: "Kosovo" }),
  base("eu-western-balkans", "GRANT", "HIGH", "Western Balkans innovation funding call", "A sample EU funding opportunity focused on cross-border innovation and early-stage digital products.", "The program could be relevant to regional product partnerships and eligible technology clients.", "European Commission", "https://ec.europa.eu/", "2026-09-24T07:40:00+02:00", ["EU", "Western Balkans", "Innovation", "Funding"], { fundingAmount: "€2m program", deadline: "2026-11-06", eligibility: "Western Balkan companies", opportunityType: "Grant", location: "EU" }),
  base("public-sector-tender", "TENDER", "HIGH", "Public sector digital services tender", "A sample procurement notice requests design and development of a digital service platform.", "This is the type of tender worth qualifying early against delivery capacity and eligibility rules.", "e-Procurement Kosovo", "https://e-prokurimi.rks-gov.net/", "2026-09-23T16:20:00+02:00", ["Kosovo", "Public sector", "Software"], { deadline: "2026-10-12", eligibility: "Registered operators", opportunityType: "Tender", location: "Kosovo" }),
  base("openai-platform", "TECHNOLOGY", "MEDIUM", "New capabilities for AI-powered workflows", "A sample platform update highlights changes that could make document and workflow automation easier to build.", "Worth reviewing for internal AI features and client automation proposals.", "OpenAI", "https://openai.com/news/", "2026-09-23T14:10:00+02:00", ["AI", "Technology", "Automation"], { location: "Global" }),
  base("prishtina-event", "EVENT", "MEDIUM", "Prishtina business and technology forum", "A sample regional event brings founders, service providers and public institutions together for talks and networking.", "Useful for meeting potential partners and tracking local demand for digital services.", "Innovation Centre Kosovo", "https://ickosovo.com/", "2026-09-23T11:00:00+02:00", ["Kosovo", "Events", "Networking"], { deadline: "2026-10-08", location: "Prishtina" }),
  base("ministry-support", "BUSINESS", "MEDIUM", "New support measures for small businesses", "A sample government announcement outlines a package intended to help local firms improve productivity.", "The eligibility details could reveal opportunities for companies planning operations or technology upgrades.", "Government of Kosovo", "https://kryeministri.rks-gov.net/", "2026-09-22T15:00:00+02:00", ["Kosovo", "SME", "Business"], { location: "Kosovo" }),
  base("eu-compliance", "REGULATION", "MEDIUM", "EU digital compliance guidance update", "A sample policy update clarifies documentation expectations for companies delivering digital products in EU markets.", "Teams selling across borders may need to adjust product documentation and review processes.", "European Commission", "https://digital-strategy.ec.europa.eu/", "2026-09-22T09:00:00+02:00", ["EU", "Regulation", "Technology"], { location: "EU" }),
  base("regional-partnership", "PARTNERSHIP", "NORMAL", "Regional innovation hub opens partner applications", "A sample partnership program is looking for technology service firms to collaborate on founder support.", "Could be a channel for local visibility and future client introductions.", "Innovation Centre Kosovo", "https://ickosovo.com/", "2026-09-21T13:20:00+02:00", ["Kosovo", "Partnerships", "Startups"], { deadline: "2026-10-30", location: "Kosovo" }),
  base("energy-grant", "GRANT", "MEDIUM", "Energy efficiency grants for growing enterprises", "A sample call would support energy improvements for eligible small and medium enterprises.", "Potentially useful for clients with facilities or infrastructure investments.", "KIESA", "https://kiesa.rks-gov.net/", "2026-09-20T10:30:00+02:00", ["Kosovo", "SME", "Energy", "Funding"], { fundingAmount: "Up to €25,000", deadline: "2026-11-14", eligibility: "Kosovo SMEs", opportunityType: "Grant", location: "Kosovo" }),
  base("supplier-tender", "TENDER", "NORMAL", "Municipal website modernization tender", "A sample municipal tender covers redesign, accessibility and content migration for a public website.", "The scope is close to common digital delivery work, pending qualification review.", "e-Procurement Kosovo", "https://e-prokurimi.rks-gov.net/", "2026-09-19T12:45:00+02:00", ["Kosovo", "Tender", "Web"], { deadline: "2026-10-23", eligibility: "Registered operators", opportunityType: "Tender", location: "Kosovo" }),
  base("european-network", "BUSINESS", "NORMAL", "European SME network expands advisory program", "A sample network initiative offers advisory sessions to companies exploring new markets.", "Could inform market expansion planning or be shared with relevant clients later.", "Enterprise Europe Network", "https://een.ec.europa.eu/", "2026-09-18T08:30:00+02:00", ["EU", "Business", "SME"], { location: "EU" }),
  base("developer-conference", "EVENT", "NORMAL", "Regional developer conference announces program", "A sample developer conference includes sessions on product engineering, AI and security.", null, "Innovation Centre Kosovo", "https://ickosovo.com/", "2026-09-17T09:00:00+02:00", ["Kosovo", "Events", "Technology"], { deadline: "2026-11-04", location: "Prishtina" }),
]

export const demoBrief: DailyBrief = {
  generatedAt: "2026-09-24T08:00:00+02:00",
  headline: "Three signals to keep on your radar.",
  itemIds: ["kiesa-digital", "eu-western-balkans", "public-sector-tender"],
  closingNote: "Funding and procurement lead today’s sample briefing.",
}
