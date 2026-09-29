import type { Dataset } from '../types'
import { ALL, launchSpan, maxDate, type Filters, type Index, type Preset } from '../lib/data'
import { dateFull, dateShort } from '../lib/format'
import { COLORS, REFRESH_URL, STALE_AFTER_HOURS, isAdmin } from '../config'

export default function Header({
  ds,
  idx,
  colors,
  filters,
  setFilters,
  presets,
  today,
}: {
  ds: Dataset
  idx: Index
  colors: Map<string, string>
  filters: Filters
  setFilters: (f: Filters) => void
  presets: Preset[]
  today: string
}) {
  const span = launchSpan(ds, filters.launch)
  const launch = idx.launchByKey.get(filters.launch)
  const wholeSpan = filters.from === span.from && filters.to === span.to
  const periodLabel = wholeSpan
    ? `${launch ? 'весь запуск' : 'весь период'} · ${dateFull(span.from)} – ${dateFull(span.to)}`
    : filters.from === filters.to
      ? `${filters.from === today ? 'сегодня · ' : ''}${dateFull(filters.from)}`
      : `${dateFull(filters.from)} – ${dateFull(filters.to)}`

  const activePreset = filters.preset
  const freshness = new Date(ds.generated_at).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  // A silently frozen dashboard is the failure that actually costs money. Age is
  // computed against the real clock, so a stalled rebuild turns the dot amber on its own.
  const ageHours = (Date.now() - Date.parse(ds.generated_at)) / 3_600_000
  const stale = ageHours > STALE_AFTER_HOURS
  const dot = stale ? COLORS.warn : COLORS.pos
  const admin = isAdmin()

  // Switching launch jumps to that launch's whole run: launches live in different
  // weeks, so carrying «last 7 days» over from another product would land on nothing.
  const pickLaunch = (key: string) => setFilters({ launch: key, ...launchSpan(ds, key), preset: 'all' })

  return (
    <header>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span
              className="inline-block h-7 w-1.5 rounded-full"
              style={{
                background: launch
                  ? colors.get(launch.key)
                  : 'linear-gradient(to bottom, #d8b878, #4a92e0)',
              }}
            />
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-ink">
              {ds.project}
              {launch && (
                <span className="text-mute font-semibold">
                  {' '}
                  · <span style={{ color: colors.get(launch.key) }}>{launch.label}</span>
                </span>
              )}
            </h1>
          </div>
          <p className="text-sm text-mute mt-1.5 ml-4">
            Facebook / Instagram · <span className="text-mute">{periodLabel}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex items-center gap-2 rounded-lg bg-card border px-3 py-1.5"
            style={{ borderColor: stale ? COLORS.warn + '55' : undefined }}
            title={
              stale
                ? `Обновление не приходило ${Math.floor(ageHours)} ч — обычно каждые 3 ч`
                : 'Обновляется автоматически каждые 3 часа'
            }
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${stale ? '' : 'animate-pulse'}`}
              style={{ background: dot }}
            />
            <span className="text-xs text-mute">данные на {freshness}</span>
            {stale && (
              <span className="text-xs font-medium" style={{ color: COLORS.warn }}>
                · {Math.floor(ageHours)} ч назад
              </span>
            )}
          </div>
          {admin && (
            <a
              href={REFRESH_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-card border border-line px-3 py-1.5 text-xs text-mute
                         transition-colors hover:text-ink hover:border-[#2a3448]"
              title="Открыть GitHub Actions и нажать Run workflow — пересборка занимает ~1 минуту"
            >
              ↻ Обновить
            </a>
          )}
        </div>
      </div>

      {/* Launch = the primary cut of this dashboard; dates refine within it. */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-dim mr-1">Запуск</span>
        <LaunchPill
          active={filters.launch === ALL}
          onClick={() => pickLaunch(ALL)}
          color={COLORS.mute}
          label="Все запуски"
          meta={`${dateShort(ds.date_min)} – ${dateShort(ds.date_max)}`}
        />
        {ds.launches.map((l) => (
          <LaunchPill
            key={l.key}
            active={filters.launch === l.key}
            onClick={() => pickLaunch(l.key)}
            color={colors.get(l.key) || COLORS.mute}
            label={l.label}
            meta={`${dateShort(l.date_min)} – ${dateShort(l.date_max)}`}
            title={`${l.label}: ${dateFull(l.date_min)} – ${dateFull(l.date_max)} · ${l.campaigns} камп.`}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {/* date presets */}
        {/* six presets overflow a phone in one row — they wrap instead of squeezing */}
        <div className="inline-flex flex-wrap items-center gap-1 rounded-lg bg-card2 p-0.5 border border-line">
          {presets.map((p) => {
            const active = activePreset === p.key
            return (
              <button
                key={p.key}
                onClick={() => setFilters({ ...filters, from: p.from, to: p.to, preset: p.key })}
                className={`rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors ${
                  active ? 'bg-[#2a3448] text-ink' : 'text-mute hover:text-ink'
                }`}
              >
                {p.label}
              </button>
            )
          })}
        </div>

        {/* custom range */}
        <div className="inline-flex items-center gap-1.5 text-xs text-mute">
          <input
            type="date"
            value={filters.from}
            min={ds.date_min}
            max={filters.to}
            onChange={(e) => setFilters({ ...filters, from: e.target.value || span.from, preset: null })}
            className="rounded-md bg-card2 border border-line px-2 py-1 text-ink [color-scheme:dark]"
          />
          <span>–</span>
          <input
            type="date"
            value={filters.to}
            min={filters.from}
            max={maxDate(ds.date_max, today)}
            onChange={(e) => setFilters({ ...filters, to: e.target.value || span.to, preset: null })}
            className="rounded-md bg-card2 border border-line px-2 py-1 text-ink [color-scheme:dark]"
          />
        </div>
      </div>
    </header>
  )
}

function LaunchPill({
  active,
  onClick,
  color,
  label,
  meta,
  title,
}: {
  active: boolean
  onClick: () => void
  color: string
  label: string
  meta: string
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors ${
        active ? 'text-ink' : 'text-mute border-line bg-card hover:text-ink hover:border-[#2a3448]'
      }`}
      style={active ? { borderColor: color + '99', background: color + '1f' } : undefined}
    >
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
      <span className="text-[11px] font-medium text-dim tabular">{meta}</span>
    </button>
  )
}
