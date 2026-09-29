// Presentation-side constants (data-side config lives in scripts/fetch-meta.mjs).

// Colors mirror src/index.css @theme — Recharts needs literal strings.
export const COLORS = {
  gold: '#d8b878',
  pos: '#46c08a',
  neg: '#e2683c',
  warn: '#e6b450',
  ink: '#e8ebf2',
  mute: '#9aa3b7',
  dim: '#6b7488',
  grid: '#232c3d',
  // metric series
  spend: '#7c86ff',
  leads: '#46c08a',
  cpl: '#d8b878',
  ctr: '#4a92e0',
  impressions: '#5a6b8c',
}

/**
 * One colour per launch, handed out in the order launches started. Chronological
 * rather than by position in the (newest-first) list, so adding a new launch never
 * repaints the ones already on screen.
 */
export const LAUNCH_PALETTE = ['#d8b878', '#4a92e0', '#e2683c', '#46c08a', '#b07cff', '#e05a8a', '#3fb8c4']

export function launchColors(launches: { key: string; date_min: string }[]): Map<string, string> {
  const chrono = [...launches].sort((a, b) => (a.date_min < b.date_min ? -1 : 1))
  return new Map(chrono.map((l, i) => [l.key, LAUNCH_PALETTE[i % LAUNCH_PALETTE.length]]))
}

/** Resolve a pipeline asset path (e.g. "creatives/x.jpg") against the Pages base URL. */
export const assetUrl = (p?: string | null) => (p ? import.meta.env.BASE_URL + p : '')

// Checked on the Rebuild launch: subscribe_total == Ads Manager «Results» (2373 on 17–25.09).
export const LEAD_HINT =
  'Лид = подписка: стандартное событие Subscribe на пикселе «Lera Rumaa_sep» — ' +
  'то же, что колонка «Результаты» в Ads Manager.'
export const GEO_HINT =
  'Страна, где показали рекламу, по данным Meta (breakdown по стране). ' +
  'Расход и подписки — фактические, не распределённые пропорционально.'

/**
 * Manual rebuild = the "Run workflow" button on the Actions page.
 *
 * Triggering it from the page itself would need a GitHub token in the browser, and
 * this bundle ships to the client — so the button opens the page instead of holding
 * a credential. It only does anything for repo collaborators, hence ADMIN_ONLY below.
 */
export const REFRESH_URL =
  'https://github.com/igoradakhovskiy-cyber/lera-dashboard/actions/workflows/deploy.yml'
/** Admin controls are opt-in via ?admin so the client never sees a dead GitHub link. */
export const isAdmin = () =>
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('admin')

/** The scheduled rebuild runs every 3h; past this the dashboard is visibly behind. */
export const STALE_AFTER_HOURS = 4

// ------------------------------------------------------------ placements ----

export const PLATFORM_LABEL: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  audience_network: 'Audience Network',
  messenger: 'Messenger',
  threads: 'Threads',
  unknown: 'Не определён',
}

export const PLATFORM_COLOR: Record<string, string> = {
  facebook: '#4a92e0',
  instagram: '#d857a8',
  audience_network: '#e6b450',
  messenger: '#7c86ff',
  threads: '#8f9bb3',
  unknown: '#6b7488',
}

/** Meta's `platform_position` values, in the wording Ads Manager uses in Russian. */
export const POSITION_LABEL: Record<string, string> = {
  feed: 'Лента',
  facebook_reels: 'Reels',
  instagram_reels: 'Reels',
  facebook_stories: 'Stories',
  instagram_stories: 'Stories',
  story: 'Stories',
  facebook_reels_overlay: 'Reels · оверлей',
  instream_video: 'In-stream видео',
  video_feeds: 'Видеолента',
  marketplace: 'Marketplace',
  search: 'Поиск',
  instagram_search: 'Поиск',
  instagram_explore: 'Интересное',
  instagram_explore_grid_home: 'Интересное · сетка',
  instagram_profile_feed: 'Лента профиля',
  instagram_profile_reels: 'Reels в профиле',
  biz_disco_feed: 'Business Discovery',
  right_hand_column: 'Правая колонка',
  an_classic: 'Баннеры и нативка',
  rewarded_video: 'Rewarded video',
  messenger_inbox: 'Входящие',
  facebook_notification: 'Уведомления',
  threads_feed: 'Лента',
  unknown: 'Не определён',
}
