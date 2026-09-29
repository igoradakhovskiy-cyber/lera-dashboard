import type { Ad, AdSet, Campaign, CreativeGroup, DailyRow, Dataset, Launch, Metrics } from '../types'

export interface Index {
  adById: Map<string, Ad>
  campById: Map<string, Campaign>
  adsetById: Map<string, AdSet>
  creativeByKey: Map<string, CreativeGroup>
  launchByKey: Map<string, Launch>
}

export function buildIndex(ds: Dataset): Index {
  return {
    adById: new Map(ds.ads.map((a) => [a.id, a])),
    campById: new Map(ds.campaigns.map((c) => [c.id, c])),
    adsetById: new Map(ds.adsets.map((s) => [s.id, s])),
    creativeByKey: new Map(ds.creatives.map((g) => [g.key, g])),
    launchByKey: new Map(ds.launches.map((l) => [l.key, l])),
  }
}

export function aggregate(rows: DailyRow[]): Metrics {
  let spend = 0,
    impressions = 0,
    clicks = 0,
    leads = 0
  for (const r of rows) {
    spend += r.spend
    impressions += r.impressions
    clicks += r.clicks
    leads += r.leads
  }
  return {
    spend,
    impressions,
    clicks,
    leads,
    cpl: leads ? spend / leads : 0,
    cpm: impressions ? (spend / impressions) * 1000 : 0,
    cpc: clicks ? spend / clicks : 0,
    ctr: impressions ? (clicks / impressions) * 100 : 0,
    cr: clicks ? (leads / clicks) * 100 : 0,
  }
}

export const ALL = 'all'

export interface Filters {
  from: string
  to: string
  launch: string // launch key, or ALL
  // Which preset button is lit. Tracked explicitly: on a short launch «14 дней» and
  // «30 дней» resolve to the same dates, so matching by range would light the wrong one.
  preset: string | null
}

/** The date span a launch filter covers — the whole dataset for «all». */
export function launchSpan(ds: Dataset, launch: string): { from: string; to: string } {
  const l = ds.launches.find((x) => x.key === launch)
  return l ? { from: l.date_min, to: l.date_max } : { from: ds.date_min, to: ds.date_max }
}

export function filterRows(ds: Dataset, idx: Index, f: Filters): DailyRow[] {
  return ds.daily.filter((r) => {
    if (r.date < f.from || r.date > f.to) return false
    if (f.launch !== ALL && idx.adById.get(r.ad_id)?.launch !== f.launch) return false
    return true
  })
}

export function groupBy(rows: DailyRow[], keyFn: (r: DailyRow) => string | undefined) {
  const m = new Map<string, DailyRow[]>()
  for (const r of rows) {
    const k = keyFn(r)
    if (k === undefined) continue
    const arr = m.get(k)
    if (arr) arr.push(r)
    else m.set(k, [r])
  }
  return m
}

export interface DaySeriesPoint extends Metrics {
  date: string
}

export function dailySeries(rows: DailyRow[]): DaySeriesPoint[] {
  const byDate = groupBy(rows, (r) => r.date)
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, rs]) => ({ date, ...aggregate(rs) }))
}

// ---- date helpers on YYYY-MM-DD strings (UTC-safe) ----
export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
export function maxDate(a: string, b: string) {
  return a > b ? a : b
}
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1
}

export interface Preset {
  key: string
  label: string
  from: string
  to: string
}

/** Today in the ad account's timezone — the day Ads Manager calls «Сегодня». */
export function todayIn(timeZone?: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date())
    const get = (t: string) => parts.find((p) => p.type === t)?.value
    return `${get('year')}-${get('month')}-${get('day')}`
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

/**
 * Calendar presets, counted back from today like in Ads Manager — so «Сегодня» on a
 * paused launch honestly shows zero. Starts are clamped to the selected launch's
 * first day, and the widest preset is the launch's (or the account's) whole run.
 */
export function buildPresets(
  spanFrom: string,
  spanTo: string,
  today: string,
  wholeLabel: string,
): Preset[] {
  const back = (days: number) => maxDate(addDays(today, -days), spanFrom)
  return [
    { key: 'today', label: 'Сегодня', from: today, to: today },
    { key: '7', label: '7 дней', from: back(6), to: today },
    { key: '14', label: '14 дней', from: back(13), to: today },
    { key: '30', label: '30 дней', from: back(29), to: today },
    { key: 'month', label: 'Текущий месяц', from: maxDate(today.slice(0, 8) + '01', spanFrom), to: today },
    { key: 'all', label: wholeLabel, from: spanFrom, to: spanTo },
  ]
}

/** Per-launch breakdown for the current date range, newest launch first. */
export function splitByLaunch(ds: Dataset, idx: Index, f: Filters) {
  const rows = filterRows(ds, idx, { ...f, launch: ALL })
  const byLaunch = groupBy(rows, (r) => idx.adById.get(r.ad_id)?.launch)
  return ds.launches
    .filter((l) => byLaunch.has(l.key))
    .map((l) => ({ launch: l, metrics: aggregate(byLaunch.get(l.key)!) }))
}

// ------------------------------------------------------------ placements ----

export interface PlacementAgg {
  key: string
  platform: string
  position: string
  spend: number
  impressions: number
  clicks: number
  ctr: number
  leads: number
  cpl: number
  spend_share: number
}

/** Spend / results / cost per result for each placement in the current filter. */
export function placementTable(ds: Dataset, idx: Index, f: Filters): PlacementAgg[] {
  const dict = ds.placements || []
  const agg = new Map<number, { spend: number; impressions: number; clicks: number; leads: number }>()

  for (const [date, adId, pi, spend, impressions, clicks, leads] of ds.placement_daily || []) {
    if (date < f.from || date > f.to) continue
    if (f.launch !== ALL && idx.adById.get(adId)?.launch !== f.launch) continue
    const a = agg.get(pi) || { spend: 0, impressions: 0, clicks: 0, leads: 0 }
    a.spend += spend
    a.impressions += impressions
    a.clicks += clicks
    a.leads += leads
    agg.set(pi, a)
  }

  const totalSpend = [...agg.values()].reduce((s, a) => s + a.spend, 0)

  return [...agg.entries()]
    .map(([pi, a]) => {
      const p = dict[pi] || { platform: 'unknown', position: 'unknown' }
      return {
        key: `${p.platform}|${p.position}`,
        platform: p.platform,
        position: p.position,
        spend: a.spend,
        impressions: a.impressions,
        clicks: a.clicks,
        ctr: a.impressions ? (a.clicks / a.impressions) * 100 : 0,
        leads: a.leads,
        cpl: a.leads ? a.spend / a.leads : 0,
        spend_share: totalSpend ? (a.spend / totalSpend) * 100 : 0,
      }
    })
    .sort((a, b) => b.spend - a.spend)
}

// ------------------------------------------------------------ geography -----

export interface GeoRow {
  country: string // ISO code
  name: string // Russian display name
  spend: number
  leads: number
  cpl: number | null // null when the country produced no result
  impressions: number
  clicks: number
  ctr: number
  cr: number // link click → result, %
}

/**
 * Country P&L straight from Meta's `breakdowns=country` — real per-country spend,
 * never a proportional spread, so the cost per result here can be acted on.
 */
export function geoTable(ds: Dataset, idx: Index, f: Filters): GeoRow[] {
  const acc = new Map<string, { spend: number; leads: number; impressions: number; clicks: number }>()
  const names = ds.geo_countries || []
  for (const [date, campaignId, ci, spend, impressions, clicks, leads] of ds.geo_daily || []) {
    if (date < f.from || date > f.to) continue
    if (f.launch !== ALL && idx.campById.get(campaignId)?.launch !== f.launch) continue
    const iso = names[ci]
    const v = acc.get(iso) || { spend: 0, leads: 0, impressions: 0, clicks: 0 }
    v.spend += spend
    v.leads += leads
    v.impressions += impressions
    v.clicks += clicks
    acc.set(iso, v)
  }
  return [...acc.entries()]
    .map(([country, v]) => ({
      country,
      name: ds.country_names?.[country] || country,
      spend: v.spend,
      leads: v.leads,
      cpl: v.leads ? v.spend / v.leads : null,
      impressions: v.impressions,
      clicks: v.clicks,
      ctr: v.impressions ? (v.clicks / v.impressions) * 100 : 0,
      cr: v.clicks ? (v.leads / v.clicks) * 100 : 0,
    }))
    .filter((r) => r.spend > 0 || r.leads > 0)
    .sort((a, b) => b.spend - a.spend)
}
