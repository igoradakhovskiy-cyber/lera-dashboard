#!/usr/bin/env node
/**
 * Lera Rumaa dashboard — Meta Marketing API data pipeline.
 *
 * Pulls campaigns / ad sets / ads + daily ad-level insights + creative media
 * (poster, video_id, reel permalink, ad-preview iframe) straight from the ad
 * account, downloads posters locally (self-host so they never break), and
 * writes one clean .data/latest.json that encrypt-data.mjs turns into the
 * password-protected public/data/latest.enc the static dashboard reads.
 *
 * No npm deps — Node 18+ global fetch only.
 *
 * Auth: reads META_ACCESS_TOKEN from the environment (CI secret) or, locally,
 * from ~/.config/claude-meta/token.env. The token is a non-expiring system-user
 * token, so the scheduled rebuild keeps working without manual renewal.
 */

import { promises as fs } from 'node:fs'
import { existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const CREATIVES_DIR = path.join(ROOT, 'public', 'creatives')
// plaintext lands OUTSIDE public/ so it never ships; encrypt-data.mjs turns it into public/data/latest.enc
const OUT_FILE = path.join(ROOT, '.data', 'latest.json')

// ---------------------------------------------------------------- config ----
const ACCOUNT_ID = process.env.META_ACCOUNT_ID || 'act_834243695642037' // lera rumaa 1
const API_VERSION = process.env.META_API_VERSION || 'v21.0'
const PROJECT = process.env.PROJECT_NAME || 'Lera Rumaa'
// 17.09.2026 = start of the Rebuild launch (campaigns 019–022) on the new pixel
// «Lera Rumaa_sep». Everything before it optimised for a different event (Lead /
// Purchase on the old pixel), so mixing it in would make the cost per result
// meaningless. New launches after this date show up on their own.
const MIN_DATE = process.env.MIN_DATE || '2026-09-17'
const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS || 365)
// The Rebuild ad sets optimise for the standard Subscribe event. Meta reports it
// in the `conversions` field (subscribe_total == subscribe_website), NOT in
// `actions` — there it only surfaces as the anonymous fb_pixel_custom bucket.
// Checked 17–25.09: subscribe_total 2373 == Ads Manager «Results».
const PRIMARY_LEAD_TYPE = process.env.LEAD_TYPE || 'subscribe_total'
const PREVIEW_FORMAT = process.env.PREVIEW_FORMAT || 'INSTAGRAM_STORY'

// ------------------------------------------------------------- token load ---
async function loadToken() {
  if (process.env.META_ACCESS_TOKEN) return process.env.META_ACCESS_TOKEN
  const envPath = path.join(os.homedir(), '.config', 'claude-meta', 'token.env')
  if (existsSync(envPath)) {
    const txt = await fs.readFile(envPath, 'utf8')
    for (const line of txt.split('\n')) {
      const m = line.match(/^\s*META_ACCESS_TOKEN\s*=\s*(.+?)\s*$/)
      if (m) return m[1]
    }
  }
  throw new Error('META_ACCESS_TOKEN not found (env or ~/.config/claude-meta/token.env)')
}

// ------------------------------------------------------------- utilities ----
const BASE = `https://graph.facebook.com/${API_VERSION}`
let TOKEN = ''
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function ymd(d) {
  return d.toISOString().slice(0, 10)
}

async function graph(pathOrUrl, params = {}, attempt = 1) {
  let url
  if (pathOrUrl.startsWith('http')) {
    url = new URL(pathOrUrl)
  } else {
    url = new URL(`${BASE}/${pathOrUrl}`)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  }
  url.searchParams.set('access_token', TOKEN)
  try {
    const res = await fetch(url)
    const json = await res.json()
    if (json.error) {
      const e = json.error
      // transient: rate limit / temporary — back off and retry
      const transient = [1, 2, 4, 17, 341, 613].includes(e.code) || res.status >= 500
      if (transient && attempt <= 4) {
        await sleep(1500 * attempt)
        return graph(pathOrUrl, params, attempt + 1)
      }
      throw new Error(`Graph error ${e.code}/${e.error_subcode || ''}: ${e.message}`)
    }
    return json
  } catch (err) {
    if (attempt <= 4) {
      await sleep(1200 * attempt)
      return graph(pathOrUrl, params, attempt + 1)
    }
    throw err
  }
}

/** Follow paging.next until exhausted, collecting .data. */
async function graphAll(pathStr, params = {}) {
  const out = []
  let json = await graph(pathStr, { ...params, limit: params.limit || 200 })
  out.push(...(json.data || []))
  let guard = 0
  while (json.paging && json.paging.next && guard < 50) {
    json = await graph(json.paging.next)
    out.push(...(json.data || []))
    guard++
  }
  return out
}

/** Bounded-concurrency map. */
async function pMap(items, fn, concurrency = 5) {
  const ret = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      try {
        ret[idx] = await fn(items[idx], idx)
      } catch (err) {
        ret[idx] = null
        console.warn(`  ! item ${idx} failed: ${err.message}`)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return ret
}

// ---------------------------------------------------------------- launches ---
/**
 * The launch (product) a campaign belongs to, read from its name.
 *
 * Names follow `<num>_<GEO…>_<launch>_<stage>_[<KPI>]_<ABO|CBO>_<date>`:
 *   019_UA_rebuild_AQ_[CPL]_CBO_17.09.2026        → rebuild
 *   020_PL_DE_ES_rebuild_AQ_[CPL]_CBO_17.09.2026  → rebuild   (geo spans 3 tokens)
 *   002_WW_7_steps_AQ_[CPA]_CBO_18.02.2026        → 7_steps   (launch spans 2 tokens)
 *
 * So the launch is NOT "the third token": it is whatever sits between the run of
 * upper-case geo codes and the first funnel-stage / KPI / budget / date token.
 * Launch tokens are written in lower case, which is what keeps them apart from geo.
 */
const GEO_TOKEN = /^([A-Z]{2}|WW|CIS|LATAM|MENA|DACH|ENG|RU)$/
const STOP_TOKEN = /^(AQ|RET|TOF|MOF|BOF|WARM|COLD|HOT|LAL|BROAD|ASC|ABO|CBO|ADV)$/i
const DATE_TOKEN = /^\d{1,2}\.\d{1,2}(\.\d{2,4})?$/

function launchKey(name = '') {
  const parts = String(name).split('_').filter(Boolean)
  let i = /^\d+$/.test(parts[0] || '') ? 1 : 0
  while (i < parts.length && GEO_TOKEN.test(parts[i])) i++
  const out = []
  for (; i < parts.length; i++) {
    const t = parts[i]
    if (STOP_TOKEN.test(t) || t.startsWith('[') || DATE_TOKEN.test(t)) break
    out.push(t)
  }
  return out.join('_').toLowerCase() || 'other'
}

/**
 * Display names. Anything not listed here is humanised from the key
 * (`7_steps` → «7 steps»), so a new launch appears in the filter on the next
 * rebuild without touching code — add a line only to override the spelling.
 */
const LAUNCH_LABELS = {
  rebuild: 'Rebuild',
  other: 'Без запуска',
}

function launchLabel(key) {
  if (LAUNCH_LABELS[key]) return LAUNCH_LABELS[key]
  const s = key.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ------------------------------------------------------------------ results --
/**
 * Counts per result definition, read from both `actions` and `conversions`:
 * standard events like Subscribe only appear in the latter.
 */
function parseResults(r) {
  const b = { primary: 0, subscribe: 0, pixel_custom: 0, lead: 0 }
  const seen = new Set()
  for (const list of [r.conversions || [], r.actions || []]) {
    for (const a of list) {
      const v = Number(a.value) || 0
      // conversions is read first; an action type repeated in `actions` would double count
      if (seen.has(a.action_type) && list === r.actions) continue
      seen.add(a.action_type)
      if (a.action_type === PRIMARY_LEAD_TYPE) b.primary += v
      if (a.action_type === 'subscribe_total') b.subscribe += v
      else if (a.action_type === 'offsite_conversion.fb_pixel_custom') b.pixel_custom += v
      else if (a.action_type === 'lead') b.lead += v
    }
  }
  return b
}

const INSIGHT_RESULT_FIELDS = 'actions,conversions'

// --------------------------------------------------------- creative media ---
const posterCache = new Map() // videoId/imageHash -> relative path

/** Read intrinsic JPEG dimensions from the SOF marker; null when unparseable. */
function jpegSize(buf) {
  let i = 2
  while (i < buf.length - 9) {
    if (buf[i] !== 0xff) {
      i++
      continue
    }
    const marker = buf[i + 1]
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) }
    }
    i += 2 + buf.readUInt16BE(i + 2)
  }
  return null
}

/** Downloads once and self-hosts, so posters never break when Meta CDN URLs expire. */
async function downloadPoster(url, fileBase) {
  const rel = `creatives/${fileBase}.jpg`
  const abs = path.join(CREATIVES_DIR, `${fileBase}.jpg`)
  try {
    if (existsSync(abs)) {
      return { poster: rel, ...(jpegSize(await fs.readFile(abs)) || { w: null, h: null }) }
    }
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    await fs.writeFile(abs, buf)
    return { poster: rel, ...(jpegSize(buf) || { w: null, h: null }) }
  } catch (err) {
    console.warn(`  ! poster download failed (${fileBase}): ${err.message}`)
    return null
  }
}

/**
 * Video-node route: richest source (dimensions + permalink), but it needs page-level
 * access. On accounts where the app lacks it the node returns error #10, so this
 * degrades to null instead of throwing and losing the whole ad.
 */
async function resolveVideoPoster(videoId) {
  if (posterCache.has(videoId)) return posterCache.get(videoId)
  let info = null
  try {
    const v = await graph(videoId, {
      fields: 'permalink_url,picture,thumbnails{uri,is_preferred,height,width}',
    })
    const thumbs = (v.thumbnails && v.thumbnails.data) || []
    let best = thumbs.find((t) => t.is_preferred) || thumbs[0]
    // prefer the largest available thumbnail
    for (const t of thumbs) if ((t.height || 0) > (best?.height || 0)) best = t
    const posterUrl = best?.uri || v.picture || null
    const dl = posterUrl ? await downloadPoster(posterUrl, `vid_${videoId}`) : null
    info = {
      poster: dl?.poster || null,
      poster_w: best?.width || dl?.w || null,
      poster_h: best?.height || dl?.h || null,
      permalink: v.permalink_url ? `https://www.facebook.com${v.permalink_url}` : null,
    }
  } catch (err) {
    videoNodeBlocked++
    info = null
  }
  posterCache.set(videoId, info)
  return info
}
let videoNodeBlocked = 0

async function resolvePreview(adId) {
  try {
    const json = await graph(`${adId}/previews`, { ad_format: PREVIEW_FORMAT })
    const body = json.data && json.data[0] && json.data[0].body
    if (!body) return null
    const m = body.match(/src="([^"]+)"/)
    return m ? m[1].replace(/&amp;/g, '&') : null
  } catch {
    return null
  }
}

/**
 * Poster resolution, best source first:
 *  1. object_story_spec.video_data.image_url — the creative's own poster, full size
 *     (1080×1920) and readable with plain ads permissions. Works everywhere.
 *  2. the video node — adds a permalink, but needs page access (error #10 without it).
 *  3. creative.image_url (image ads, full size) or thumbnail_url (64×64) — last resort.
 */
async function resolveCreative(ad) {
  const cr = ad.creative || {}
  const vd = (cr.object_story_spec && cr.object_story_spec.video_data) || {}
  const media = {
    poster: null,
    poster_w: null,
    poster_h: null,
    video_id: cr.video_id || null,
    permalink: cr.instagram_permalink_url || null,
    preview_url: null,
  }

  if (vd.image_url) {
    const dl = await downloadPoster(vd.image_url, `cr_${vd.image_hash || ad.id}`)
    if (dl) {
      media.poster = dl.poster
      media.poster_w = dl.w
      media.poster_h = dl.h
    }
  }
  if (!media.poster && cr.video_id) {
    const v = await resolveVideoPoster(cr.video_id)
    if (v) {
      media.poster = v.poster
      media.poster_w = v.poster_w
      media.poster_h = v.poster_h
      if (!media.permalink) media.permalink = v.permalink
    }
  }
  if (!media.poster && (cr.image_url || cr.thumbnail_url)) {
    const dl = await downloadPoster(cr.image_url || cr.thumbnail_url, `ad_${ad.id}`)
    if (dl) {
      media.poster = dl.poster
      media.poster_w = dl.w
      media.poster_h = dl.h
    }
  }
  media.preview_url = await resolvePreview(ad.id)
  return media
}

// ------------------------------------------------------------------- main ---
async function main() {
  TOKEN = await loadToken()
  await fs.mkdir(CREATIVES_DIR, { recursive: true })
  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true })

  const until = new Date()
  const sinceD = new Date(until.getTime() - LOOKBACK_DAYS * 86400000)
  const since = ymd(sinceD) < MIN_DATE ? MIN_DATE : ymd(sinceD)
  const timeRange = JSON.stringify({ since, until: ymd(until) })
  console.log(`▶ Account ${ACCOUNT_ID} · window ${since} → ${ymd(until)} · result = ${PRIMARY_LEAD_TYPE}`)

  // account meta
  const acct = await graph(ACCOUNT_ID, { fields: 'name,currency,timezone_name' })

  // daily ad-level insights first — tells us which ads were actually active
  console.log('▶ Fetching daily insights…')
  const insRows = await graphAll(`${ACCOUNT_ID}/insights`, {
    level: 'ad',
    fields: `ad_id,adset_id,campaign_id,spend,impressions,inline_link_clicks,clicks,${INSIGHT_RESULT_FIELDS}`,
    time_range: timeRange,
    time_increment: '1',
    limit: 500,
  })
  const xcheck = { subscribe: 0, pixel_custom: 0, lead: 0 }
  const daily = insRows
    .map((r) => {
      const b = parseResults(r)
      xcheck.subscribe += b.subscribe
      xcheck.pixel_custom += b.pixel_custom
      xcheck.lead += b.lead
      return {
        ad_id: r.ad_id,
        date: r.date_start,
        spend: Number(r.spend) || 0,
        impressions: Number(r.impressions) || 0,
        clicks: Number(r.inline_link_clicks) || 0,
        leads: b.primary,
      }
    })
    // A day with neither spend nor a result is a leftover attribution ping on a
    // paused ad — it adds a row, not information.
    .filter((r) => r.spend > 0 || r.leads > 0 || r.impressions > 0)
  const activeAdIds = new Set(daily.map((r) => r.ad_id))
  console.log(`  ${daily.length} daily rows · ${activeAdIds.size} active ads`)

  // Placement breakdown — a SECOND insights pass, because Meta will not return
  // breakdown and non-breakdown rows in one call. Same grain as `daily`
  // (date × ad) plus the placement, so the UI can reuse the exact same date and
  // launch filters instead of maintaining a parallel notion of "current slice".
  //
  // Stored as positional arrays against a `placements` dictionary: the object
  // form is ~2.5× the bytes, and this payload is downloaded on every load.
  console.log('▶ Fetching placement breakdown…')
  const placeRows = await graphAll(`${ACCOUNT_ID}/insights`, {
    level: 'ad',
    fields: `ad_id,spend,impressions,inline_link_clicks,${INSIGHT_RESULT_FIELDS}`,
    breakdowns: 'publisher_platform,platform_position',
    time_range: timeRange,
    time_increment: '1',
    limit: 500,
  })
  const placeDict = new Map() // "platform|position" -> index
  const placementDaily = []
  for (const r of placeRows) {
    const spend = Number(r.spend) || 0
    const impressions = Number(r.impressions) || 0
    const leads = parseResults(r).primary
    // Meta emits a row for every placement it *considered*; the empty ones are
    // noise that would double the payload for nothing.
    if (!spend && !impressions && !leads) continue
    const platform = r.publisher_platform || 'unknown'
    const position = r.platform_position || 'unknown'
    const key = `${platform}|${position}`
    let pi = placeDict.get(key)
    if (pi === undefined) {
      pi = placeDict.size
      placeDict.set(key, pi)
    }
    placementDaily.push([
      r.date_start,
      r.ad_id,
      pi,
      Math.round(spend * 100) / 100,
      impressions,
      Number(r.inline_link_clicks) || 0,
      leads,
    ])
  }
  const placements = [...placeDict.keys()].map((k) => {
    const [platform, position] = k.split('|')
    return { platform, position }
  })
  console.log(`  ${placementDaily.length} placement rows · ${placements.length} distinct placements`)

  // Country breakdown — a THIRD insights pass, for the same reason. Run at
  // CAMPAIGN level: the geo table filters by date and launch only, and launch is
  // a property of the campaign, so ad × country × day would only be summed back up.
  //
  // This is real per-country spend from Meta, NOT results spread proportionally,
  // which is what makes cost per result by country usable for moving budget.
  console.log('▶ Fetching country breakdown…')
  const geoRaw = await graphAll(`${ACCOUNT_ID}/insights`, {
    level: 'campaign',
    fields: `campaign_id,spend,impressions,inline_link_clicks,${INSIGHT_RESULT_FIELDS}`,
    breakdowns: 'country',
    time_range: timeRange,
    time_increment: '1',
    limit: 500,
  })
  const geoDict = new Map() // ISO code -> index
  const geoDaily = []
  for (const r of geoRaw) {
    const spend = Math.round((Number(r.spend) || 0) * 100) / 100
    const leads = parseResults(r).primary
    if (!spend && !leads) continue
    const iso = r.country || 'ZZ'
    let ci = geoDict.get(iso)
    if (ci === undefined) {
      ci = geoDict.size
      geoDict.set(iso, ci)
    }
    geoDaily.push([
      r.date_start,
      r.campaign_id,
      ci,
      spend,
      Number(r.impressions) || 0,
      Number(r.inline_link_clicks) || 0,
      leads,
    ])
  }
  const geoCountries = [...geoDict.keys()]
  const regionRu = new Intl.DisplayNames(['ru'], { type: 'region' })
  const countryNames = Object.fromEntries(
    geoCountries.map((iso) => {
      let name = iso
      try {
        name = iso === 'ZZ' ? 'Не определена' : regionRu.of(iso) || iso
      } catch {
        /* unknown code — keep ISO */
      }
      return [iso, name]
    }),
  )
  console.log(`  ${geoDaily.length} country-day rows · ${geoCountries.length} countries`)

  // structure
  console.log('▶ Fetching campaigns / ad sets / ads…')
  const [allCampaigns, allAdsets, allAds] = await Promise.all([
    graphAll(`${ACCOUNT_ID}/campaigns`, { fields: 'name,status,objective,daily_budget', limit: 500 }),
    graphAll(`${ACCOUNT_ID}/adsets`, { fields: 'name,status,campaign_id', limit: 500 }),
    graphAll(`${ACCOUNT_ID}/ads`, {
      fields:
        'name,status,adset_id,campaign_id,creative{id,object_type,image_url,thumbnail_url,video_id,' +
        'instagram_permalink_url,object_story_spec{video_data{image_url,image_hash}}}',
      limit: 500,
    }),
  ])

  const ads0 = allAds.filter((a) => activeAdIds.has(a.id))
  const usedCampaignIds = new Set(ads0.map((a) => a.campaign_id))
  const usedAdsetIds = new Set(ads0.map((a) => a.adset_id))

  const campaigns = allCampaigns
    .filter((c) => usedCampaignIds.has(c.id))
    .map((c) => ({
      id: c.id,
      name: c.name,
      status: c.status,
      objective: c.objective,
      launch: launchKey(c.name),
      daily_budget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
    }))
  const campById = new Map(campaigns.map((c) => [c.id, c]))
  const adsets = allAdsets
    .filter((s) => usedAdsetIds.has(s.id))
    .map((s) => ({ id: s.id, name: s.name, campaign_id: s.campaign_id, status: s.status }))

  // creative media (only for active ads) — bounded concurrency
  console.log(`▶ Resolving creatives + posters for ${ads0.length} ads…`)
  const ads = []
  await pMap(
    ads0,
    async (a) => {
      const campaign = campById.get(a.campaign_id)
      // media is cosmetic — an ad that fails to resolve one must still keep its metrics
      let media
      try {
        media = await resolveCreative(a)
      } catch (err) {
        console.warn(`  ! creative unresolved (${a.name}): ${err.message}`)
        media = {
          poster: null,
          poster_w: null,
          poster_h: null,
          video_id: (a.creative && a.creative.video_id) || null,
          permalink: null,
          preview_url: null,
        }
      }
      ads.push({
        id: a.id,
        name: a.name,
        adset_id: a.adset_id,
        campaign_id: a.campaign_id,
        status: a.status,
        launch: campaign ? campaign.launch : 'other',
        creative: media,
      })
    },
    5,
  )

  // Creative groups keyed by launch + ad name. Ad names like «001» or «002_give_us»
  // are reused from launch to launch for entirely different videos, so the name
  // alone would merge two products' creatives into one card.
  const groups = new Map()
  for (const a of ads) {
    const key = `${a.launch}|${a.name}`
    let g = groups.get(key)
    if (!g) {
      g = {
        key,
        name: a.name,
        launch: a.launch,
        poster: a.creative.poster,
        poster_w: a.creative.poster_w,
        poster_h: a.creative.poster_h,
        video_id: a.creative.video_id,
        permalink: a.creative.permalink,
        preview_url: a.creative.preview_url,
        ad_ids: [],
        campaign_ids: [],
      }
      groups.set(key, g)
    }
    g.ad_ids.push(a.id)
    if (!g.campaign_ids.includes(a.campaign_id)) g.campaign_ids.push(a.campaign_id)
    if (!g.poster && a.creative.poster) {
      g.poster = a.creative.poster
      g.poster_w = a.creative.poster_w
      g.poster_h = a.creative.poster_h
    }
    if (!g.preview_url && a.creative.preview_url) g.preview_url = a.creative.preview_url
    if (!g.permalink && a.creative.permalink) g.permalink = a.creative.permalink
  }

  // Launch dictionary, newest first — the filter in the header reads it as-is.
  const adLaunch = new Map(ads.map((a) => [a.id, a.launch]))
  const span = new Map() // launch -> { first, last, spend }
  for (const r of daily) {
    const l = adLaunch.get(r.ad_id)
    if (!l) continue
    const s = span.get(l) || { first: r.date, last: r.date, spend: 0 }
    if (r.date < s.first) s.first = r.date
    if (r.date > s.last) s.last = r.date
    s.spend += r.spend
    span.set(l, s)
  }
  const launches = [...span.entries()]
    .map(([key, s]) => ({
      key,
      label: launchLabel(key),
      date_min: s.first,
      date_max: s.last,
      campaigns: campaigns.filter((c) => c.launch === key).length,
    }))
    .sort((a, b) => (a.date_min < b.date_min ? 1 : -1))

  const dates = daily.map((r) => r.date).sort()
  const dataset = {
    generated_at: new Date().toISOString(),
    lead_type: PRIMARY_LEAD_TYPE,
    account: {
      id: ACCOUNT_ID,
      name: acct.name || '',
      currency: acct.currency || 'USD',
      timezone: acct.timezone_name || '',
    },
    project: PROJECT,
    date_min: dates[0] || since,
    date_max: dates[dates.length - 1] || ymd(until),
    launches,
    campaigns,
    adsets,
    ads,
    creatives: [...groups.values()],
    daily,
    placements,
    // [date, ad_id, placement_index, spend, impressions, clicks, leads]
    placement_daily: placementDaily,
    /** Dictionary for `geo_daily`; index into this array is the country id. */
    geo_countries: geoCountries,
    // [date, campaign_id, country_index, spend, impressions, clicks, leads]
    geo_daily: geoDaily,
    country_names: countryNames,
  }

  await fs.writeFile(OUT_FILE, JSON.stringify(dataset, null, 2))
  console.log(`✔ Wrote ${path.relative(ROOT, OUT_FILE)}`)

  // ---- cross-check summary (helps lock the result action_type) ----
  const tot = daily.reduce(
    (o, r) => {
      o.spend += r.spend
      o.impr += r.impressions
      o.clicks += r.clicks
      o.leads += r.leads
      return o
    },
    { spend: 0, impr: 0, clicks: 0, leads: 0 },
  )
  console.log('\n──── cross-check (whole window) ────')
  console.log(`  spend        $${tot.spend.toFixed(2)}`)
  console.log(`  impressions  ${tot.impr}`)
  console.log(`  link clicks  ${tot.clicks}`)
  console.log(`  results[${PRIMARY_LEAD_TYPE}]  ${tot.leads}  → CPL $${tot.leads ? (tot.spend / tot.leads).toFixed(2) : '—'}`)
  console.log(`    subscribe_total ${xcheck.subscribe} · fb_pixel_custom ${xcheck.pixel_custom} · lead ${xcheck.lead}`)
  for (const l of launches) {
    console.log(`  launch «${l.label}» (${l.key}) ${l.date_min} → ${l.date_max} · ${l.campaigns} campaigns`)
  }
  console.log(`  campaigns ${campaigns.length} · adsets ${adsets.length} · ads ${ads.length} · creatives ${groups.size}`)
  const withPoster = ads.filter((a) => a.creative.poster).length
  const withPreview = ads.filter((a) => a.creative.preview_url).length
  console.log(`  posters ${withPoster}/${ads.length} · previews ${withPreview}/${ads.length}`)

  // Both breakdown passes are separate API calls, so they can silently disagree
  // with the main one (wrong breakdown, partial paging). Reconciling the totals
  // here is what turns "the numbers look plausible" into "the numbers are the same".
  for (const [label, rows] of [
    ['placements', placementDaily],
    ['geo', geoDaily],
  ]) {
    const t = rows.reduce(
      (o, r) => {
        o.spend += r[3]
        o.leads += r[6]
        return o
      },
      { spend: 0, leads: 0 },
    )
    const drift = Math.abs(t.spend - tot.spend)
    console.log(
      `  ${label.padEnd(12)} $${t.spend.toFixed(2)} / ${t.leads} results ` +
        `(drift vs main: $${drift.toFixed(2)}, ${t.leads - tot.leads} results)`,
    )
    // Sub-cent rounding per row is expected; a real mismatch means the breakdown
    // pass lost rows and that table would understate spend.
    if (tot.spend > 0 && drift / tot.spend > 0.01) {
      throw new Error(
        `${label} spend $${t.spend.toFixed(2)} differs from account spend $${tot.spend.toFixed(2)} by more than 1% — breakdown pass is incomplete`,
      )
    }
  }
  if (videoNodeBlocked) {
    console.log(
      `  note: ${videoNodeBlocked} video node(s) unreadable (app lacks page access) — ` +
        'posters came from the creative instead, permalinks unavailable',
    )
  }
}

main().catch((e) => {
  console.error('✖ pipeline failed:', e)
  process.exit(1)
})
