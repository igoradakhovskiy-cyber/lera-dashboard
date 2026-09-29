import type { Dataset } from '../types'
import { splitByLaunch, type Filters, type Index } from '../lib/data'
import { Card, SectionTitle } from './ui'
import { dateShort, int, money, moneySmart, pct } from '../lib/format'
import { COLORS } from '../config'

/**
 * Launch-vs-launch comparison, shown on «Все запуски» only. With a single launch in
 * the period it would repeat the KPI row line for line, so it stays hidden until a
 * second product actually runs.
 */
export default function LaunchSplit({
  ds,
  idx,
  filters,
  colors,
}: {
  ds: Dataset
  idx: Index
  filters: Filters
  colors: Map<string, string>
}) {
  const split = splitByLaunch(ds, idx, filters)
  if (split.length < 2) return null
  const totalSpend = split.reduce((s, x) => s + x.metrics.spend, 0) || 1

  return (
    <Card className="p-5">
      <SectionTitle title="Запуски" subtitle="Сравнение продуктов за выбранный период" />

      <div className="flex h-2.5 w-full rounded-full overflow-hidden mb-4 bg-card2">
        {split.map((s) => (
          <div
            key={s.launch.key}
            style={{
              width: `${(s.metrics.spend / totalSpend) * 100}%`,
              background: colors.get(s.launch.key),
            }}
          />
        ))}
      </div>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm min-w-[620px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-dim">
              <th className="font-medium py-1.5 pl-1">Запуск</th>
              <th className="font-medium py-1.5 text-right">Расход</th>
              <th className="font-medium py-1.5 text-right">Доля</th>
              <th className="font-medium py-1.5 text-right">Лиды</th>
              <th className="font-medium py-1.5 text-right">CPL</th>
              <th className="font-medium py-1.5 text-right">CTR</th>
              <th className="font-medium py-1.5 text-right pr-1">Клик → лид</th>
            </tr>
          </thead>
          <tbody>
            {split.map((s) => (
              <tr key={s.launch.key} className="border-t border-line2">
                <td className="py-2 pl-1">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: colors.get(s.launch.key) }} />
                    <span className="font-medium text-ink">{s.launch.label}</span>
                    <span className="text-[11px] text-dim tabular">
                      {dateShort(s.launch.date_min)} – {dateShort(s.launch.date_max)}
                    </span>
                  </span>
                </td>
                <td className="py-2 text-right tabular text-ink">{money(s.metrics.spend)}</td>
                <td className="py-2 text-right tabular text-mute">
                  {pct((s.metrics.spend / totalSpend) * 100, 1)}
                </td>
                <td className="py-2 text-right tabular text-ink">{int(s.metrics.leads)}</td>
                <td className="py-2 text-right tabular font-medium" style={{ color: COLORS.gold }}>
                  {s.metrics.leads ? moneySmart(s.metrics.cpl) : '—'}
                </td>
                <td className="py-2 text-right tabular text-mute">{pct(s.metrics.ctr)}</td>
                <td className="py-2 text-right tabular text-mute pr-1">{pct(s.metrics.cr, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
