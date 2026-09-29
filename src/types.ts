export interface Account {
  id: string
  name: string
  currency: string
  timezone?: string
}

/**
 * A launch = one product pushed through its own set of campaigns, read from the
 * campaign name (`019_UA_rebuild_AQ_…` → `rebuild`). New launches appear in the
 * dataset — and in the header filter — on the next rebuild, with no code change.
 */
export interface Launch {
  key: string // lower-case token from the campaign name, e.g. "rebuild"
  label: string // display name, e.g. "Rebuild"
  date_min: string // first day with delivery
  date_max: string // last day with delivery or a late-attributed result
  campaigns: number
}

export interface Campaign {
  id: string
  name: string
  status: string
  objective: string
  launch: string
  daily_budget: number | null
}

export interface AdSet {
  id: string
  name: string
  campaign_id: string
  status: string
}

export interface CreativeMedia {
  poster: string | null // relative path under public/, e.g. "creatives/vid_123.jpg"
  poster_w: number | null
  poster_h: number | null
  video_id: string | null
  permalink: string | null // reel / post permalink (fallback for playback)
  preview_url: string | null // Meta ad-preview iframe src (may expire between refreshes)
}

export interface Ad {
  id: string
  name: string
  adset_id: string
  campaign_id: string
  status: string
  launch: string // inherited from the campaign
  creative: CreativeMedia
}

export interface DailyRow {
  ad_id: string
  date: string // YYYY-MM-DD
  spend: number
  impressions: number
  clicks: number // link clicks (matches "Link Clicks")
  leads: number // primary result (locked action_type, see Dataset.lead_type)
}

export interface CreativeGroup {
  key: string // `${launch}|${ad name}` — names repeat across launches
  name: string // ad name = creative concept, e.g. "002_give_us"
  launch: string
  poster: string | null
  poster_w: number | null
  poster_h: number | null
  video_id: string | null
  permalink: string | null
  preview_url: string | null
  ad_ids: string[]
  campaign_ids: string[]
}

export interface Placement {
  platform: string // facebook | instagram | audience_network | threads | messenger
  position: string // feed | instagram_reels | instagram_stories | an_classic …
}

/** [date, ad_id, placement_index, spend, impressions, clicks, leads] */
export type PlacementRow = [string, string, number, number, number, number, number]

/** [date, campaign_id, country_index, spend, impressions, clicks, leads] */
export type GeoDailyRow = [string, string, number, number, number, number, number]

export interface Dataset {
  generated_at: string
  lead_type: string // which action_type is used as the primary result
  account: Account
  project: string
  date_min: string
  date_max: string
  launches: Launch[] // newest first
  campaigns: Campaign[]
  adsets: AdSet[]
  ads: Ad[]
  creatives: CreativeGroup[]
  daily: DailyRow[]
  /** Dictionary for `placement_daily`; index into this array is the placement id. */
  placements: Placement[]
  /**
   * Positional on purpose — the object form is 2.5× the bytes, and this ships to
   * the browser on every load. Same grain as `daily` plus the placement, so the
   * date and launch filters apply unchanged.
   */
  placement_daily: PlacementRow[]
  /** Dictionary for `geo_daily`; index into this array is the ISO country code. */
  geo_countries: string[]
  geo_daily: GeoDailyRow[]
  country_names: Record<string, string>
}

/** Aggregated metric bucket used throughout the UI. */
export interface Metrics {
  spend: number
  impressions: number
  clicks: number
  leads: number
  cpl: number
  cpm: number
  cpc: number
  ctr: number
  cr: number // link click → result, %
}
