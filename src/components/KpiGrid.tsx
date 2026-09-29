import type { DailyRow, Metrics } from '../types'
import { int, money, moneySmart, num1, pct, plural } from '../lib/format'
import { Card, InfoDot } from './ui'
import { COLORS, LEAD_HINT } from '../config'

function Hero({
  label,
  value,
  accent,
  hint,
  children,
}: {
  label: string
  value: string
  accent: string
  hint?: string
  children?: React.ReactNode
}) {
  return (
    <Card className="p-4 relative overflow-hidden">
      <div
        className="absolute -right-6 -top-8 h-24 w-24 rounded-full blur-2xl opacity-20"
        style={{ background: accent }}
      />
      <div className="text-xs font-medium text-mute uppercase tracking-wide flex items-center gap-1.5">
        {label}
        {hint && <InfoDot text={hint} />}
      </div>
      <div className="mt-1.5 font-display text-3xl font-bold text-ink tabular">{value}</div>
      {children && <div className="mt-3 text-[11px] text-dim">{children}</div>}
    </Card>
  )
}

function Stat({
  label,
  value,
  accent = COLORS.mute,
}: {
  label: string
  value: string
  accent?: string
}) {
  return (
    <Card className="p-3.5">
      <div className="text-[11px] font-medium text-mute uppercase tracking-wide">{label}</div>
      <div className="mt-1 font-display text-xl font-semibold tabular" style={{ color: accent }}>
        {value}
      </div>
    </Card>
  )
}

/**
 * Fact only — this project runs without a plan. Per-day rates are measured over
 * the days that actually had spend, so a paused tail at the end of a launch (late
 * attributed results, zero delivery) does not dilute them.
 */
export default function KpiGrid({ metrics, rows }: { metrics: Metrics; rows: DailyRow[] }) {
  const m = metrics
  const activeDays = new Set(rows.filter((r) => r.spend > 0).map((r) => r.date)).size

  return (
    <section className="space-y-4">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Hero label="Расход" value={money(m.spend)} accent={COLORS.spend}>
          {activeDays > 0 ? (
            <>
              ≈ {money(m.spend / activeDays)} в день · {activeDays}{' '}
              {plural(activeDays, 'день', 'дня', 'дней')} с открутом
            </>
          ) : (
            'открута за период не было'
          )}
        </Hero>

        <Hero label="Лиды (подписки)" value={int(m.leads)} accent={COLORS.leads} hint={LEAD_HINT}>
          {activeDays > 0 ? <>≈ {num1(m.leads / activeDays)} в день</> : '—'}
        </Hero>

        <Hero label="Цена лида (CPL)" value={m.leads ? moneySmart(m.cpl) : '—'} accent={COLORS.cpl}>
          конверсия клик → лид <span className="text-mute tabular">{pct(m.cr, 1)}</span>
        </Hero>
      </div>

      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Показы" value={int(m.impressions)} accent={COLORS.ink} />
        <Stat label="Клики" value={int(m.clicks)} accent={COLORS.ink} />
        <Stat label="CTR" value={pct(m.ctr)} accent={COLORS.ctr} />
        <Stat label="CPM" value={moneySmart(m.cpm)} accent={COLORS.ink} />
        <Stat label="CPC" value={moneySmart(m.cpc)} accent={COLORS.ink} />
      </div>
    </section>
  )
}
