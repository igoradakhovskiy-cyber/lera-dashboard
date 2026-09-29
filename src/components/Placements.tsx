import { useMemo, useState } from 'react'
import type { Dataset } from '../types'
import { placementTable, type Filters, type Index, type PlacementAgg } from '../lib/data'
import { Card, SectionTitle, Segmented } from './ui'
import { int, money, moneySmart, pct } from '../lib/format'
import { COLORS, PLATFORM_COLOR, PLATFORM_LABEL, POSITION_LABEL } from '../config'

type Mode = 'position' | 'platform'

const label = (p: string) => PLATFORM_LABEL[p] || p
const posLabel = (p: string) => POSITION_LABEL[p] || p.replace(/_/g, ' ')

/** Rolls the placement rows up to the platform level. */
function byPlatform(rows: PlacementAgg[]): PlacementAgg[] {
  const m = new Map<string, PlacementAgg>()
  for (const r of rows) {
    const cur = m.get(r.platform)
    if (!cur) {
      m.set(r.platform, { ...r, key: r.platform, position: 'all' })
      continue
    }
    cur.spend += r.spend
    cur.impressions += r.impressions
    cur.clicks += r.clicks
    cur.leads += r.leads
    cur.spend_share += r.spend_share
  }
  for (const r of m.values()) {
    r.ctr = r.impressions ? (r.clicks / r.impressions) * 100 : 0
    r.cpl = r.leads ? r.spend / r.leads : 0
  }
  return [...m.values()].sort((a, b) => b.spend - a.spend)
}

/**
 * Where the money actually goes inside a campaign. Meta bundles very different
 * inventory under one ad set, and the per-placement CPL spread is usually wide
 * enough that the blended number hides it — which is the whole point of the table.
 */
export default function Placements({
  ds,
  idx,
  filters,
}: {
  ds: Dataset
  idx: Index
  filters: Filters
}) {
  const [mode, setMode] = useState<Mode>('position')

  const table = useMemo(() => placementTable(ds, idx, filters), [ds, idx, filters])
  const rows = mode === 'platform' ? byPlatform(table) : table
  const maxSpend = Math.max(1, ...rows.map((r) => r.spend))

  const totals = rows.reduce(
    (o, r) => {
      o.spend += r.spend
      o.leads += r.leads
      return o
    },
    { spend: 0, leads: 0 },
  )

  return (
    <section>
      <SectionTitle
        title="Плейсменты"
        subtitle={
          mode === 'platform'
            ? 'Расход по площадкам за выбранный период'
            : `${table.length} плейсментов за период, сортировка по расходу`
        }
        right={
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'position', label: 'детально' },
              { value: 'platform', label: 'по площадкам' },
            ]}
          />
        }
      />

      <Card className="p-3 sm:p-4">
        {rows.length === 0 ? (
          <div className="py-6 text-center text-dim text-sm">Нет данных за выбранный период</div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-dim">
                  <th className="font-medium py-1.5 pl-1">Плейсмент</th>
                  <th className="font-medium py-1.5 text-right">Расход</th>
                  <th className="font-medium py-1.5 text-right hidden md:table-cell">Показы</th>
                  <th className="font-medium py-1.5 text-right hidden lg:table-cell">CTR</th>
                  <th className="font-medium py-1.5 text-right">Лиды</th>
                  <th className="font-medium py-1.5 text-right pr-1">CPL</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const color = PLATFORM_COLOR[r.platform] || COLORS.dim
                  return (
                    <tr key={r.key} className="border-t border-line2">
                      <td className="py-2 pl-1 relative min-w-[180px]">
                        <span
                          className="absolute inset-y-1 left-0 rounded-sm"
                          style={{ width: `${(r.spend / maxSpend) * 100}%`, background: color + '14' }}
                        />
                        <span className="relative flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                          <span className="text-ink">
                            {label(r.platform)}
                            {mode === 'position' && (
                              <span className="text-mute"> · {posLabel(r.position)}</span>
                            )}
                          </span>
                        </span>
                      </td>
                      <td className="py-2 text-right tabular text-ink font-medium whitespace-nowrap">
                        {money(r.spend)}
                        <span className="text-dim text-xs ml-1.5">{r.spend_share.toFixed(0)}%</span>
                      </td>
                      <td className="py-2 text-right tabular text-dim hidden md:table-cell">
                        {int(r.impressions)}
                      </td>
                      <td className="py-2 text-right tabular text-dim hidden lg:table-cell">
                        {pct(r.ctr)}
                      </td>
                      <td className="py-2 text-right tabular text-ink">{int(r.leads)}</td>
                      <td className="py-2 text-right tabular text-mute whitespace-nowrap pr-1">
                        {r.leads ? moneySmart(r.cpl) : '—'}
                      </td>
                    </tr>
                  )
                })}
                <tr className="border-t border-line font-medium">
                  <td className="py-2 pl-1 text-mute">Итого</td>
                  <td className="py-2 text-right tabular text-ink whitespace-nowrap">
                    {money(totals.spend)}
                  </td>
                  <td className="hidden md:table-cell" />
                  <td className="hidden lg:table-cell" />
                  <td className="py-2 text-right tabular text-ink">{int(totals.leads)}</td>
                  <td className="py-2 text-right tabular text-mute whitespace-nowrap pr-1">
                    {totals.leads ? moneySmart(totals.spend / totals.leads) : '—'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  )
}
