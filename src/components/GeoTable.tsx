import { useState } from 'react'
import type { Dataset } from '../types'
import type { Filters, GeoRow, Index } from '../lib/data'
import { geoTable } from '../lib/data'
import { Card, InfoDot, SectionTitle, Segmented } from './ui'
import { int, money, moneySmart, pct, plural } from '../lib/format'
import { COLORS, GEO_HINT } from '../config'

const SHOW = 8
type SortKey = 'spend' | 'leads' | 'cpl'

/**
 * Country P&L from Meta: where the budget went and what each country returned.
 * The EU campaigns spread over dozens of countries at very different prices, so
 * this is where geo budget decisions get made.
 */
export default function GeoTable({
  ds,
  idx,
  filters,
}: {
  ds: Dataset
  idx: Index
  filters: Filters
}) {
  const [sort, setSort] = useState<SortKey>('spend')
  const [all, setAll] = useState(false)

  const rowsAll = geoTable(ds, idx, filters)
  const sorters: Record<SortKey, (a: GeoRow, b: GeoRow) => number> = {
    spend: (a, b) => b.spend - a.spend,
    leads: (a, b) => b.leads - a.leads || b.spend - a.spend,
    // countries without a result sort last instead of pretending to be free
    cpl: (a, b) => (a.cpl ?? Infinity) - (b.cpl ?? Infinity) || b.spend - a.spend,
  }
  const sorted = [...rowsAll].sort(sorters[sort])
  const rows = all ? sorted : sorted.slice(0, SHOW)
  const maxSpend = Math.max(1, ...sorted.map((r) => r.spend))

  const totals = rowsAll.reduce(
    (o, r) => {
      o.spend += r.spend
      o.leads += r.leads
      o.clicks += r.clicks
      o.impressions += r.impressions
      return o
    },
    { spend: 0, leads: 0, clicks: 0, impressions: 0 },
  )

  return (
    <Card className="p-5 h-full">
      <SectionTitle
        title="География"
        subtitle={`${rowsAll.length} ${plural(rowsAll.length, 'страна', 'страны', 'стран')} за период`}
        right={
          <Segmented
            value={sort}
            onChange={setSort}
            options={[
              { value: 'spend', label: 'по расходу' },
              { value: 'leads', label: 'по лидам' },
              { value: 'cpl', label: 'по CPL' },
            ]}
          />
        }
      />

      {rows.length === 0 ? (
        <div className="py-6 text-center text-dim text-sm">Нет данных за период</div>
      ) : (
        <>
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[13px] min-w-[460px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wide text-dim">
                  <th className="font-medium py-1.5 pl-1">
                    <span className="inline-flex items-center gap-1.5">
                      Страна <InfoDot text={GEO_HINT} />
                    </span>
                  </th>
                  <th className="font-medium py-1.5 text-right">Расход</th>
                  <th className="font-medium py-1.5 text-right">Лиды</th>
                  <th className="font-medium py-1.5 text-right">CPL</th>
                  <th className="font-medium py-1.5 text-right hidden sm:table-cell">CTR</th>
                  <th className="font-medium py-1.5 text-right pr-1">Клик → лид</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <Row key={r.country} r={r} maxSpend={maxSpend} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line">
                  <td className="py-2 pl-1 text-mute font-medium">Итого</td>
                  <td className="py-2 text-right tabular text-ink font-medium">{money(totals.spend)}</td>
                  <td className="py-2 text-right tabular text-ink">{int(totals.leads)}</td>
                  <td className="py-2 text-right tabular font-medium" style={{ color: COLORS.gold }}>
                    {totals.leads ? moneySmart(totals.spend / totals.leads) : '—'}
                  </td>
                  <td className="py-2 text-right tabular text-mute hidden sm:table-cell">
                    {totals.impressions ? pct((totals.clicks / totals.impressions) * 100) : '—'}
                  </td>
                  <td className="py-2 text-right tabular text-mute pr-1">
                    {totals.clicks ? pct((totals.leads / totals.clicks) * 100, 1) : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {sorted.length > SHOW && (
            <button
              onClick={() => setAll(!all)}
              className="mt-3 text-xs text-mute hover:text-ink transition-colors"
            >
              {all ? '× свернуть' : `показать все ${sorted.length} →`}
            </button>
          )}
        </>
      )}
    </Card>
  )
}

function Row({ r, maxSpend }: { r: GeoRow; maxSpend: number }) {
  const title =
    `${r.name} · ${r.country}\n` +
    `Расход ${money(r.spend)} · показы ${int(r.impressions)} · клики ${int(r.clicks)}\n` +
    `Лиды: ${int(r.leads)}`

  return (
    <tr className="border-t border-line2" title={title}>
      <td className="py-1.5 pl-1 relative">
        <span
          className="absolute inset-y-1 left-0 rounded-sm"
          style={{ width: `${(r.spend / maxSpend) * 100}%`, background: COLORS.spend + '14' }}
        />
        <span className="relative text-ink">{r.name}</span>
      </td>
      <td className="py-1.5 text-right tabular text-ink">{money(r.spend)}</td>
      <td className="py-1.5 text-right tabular text-ink">{int(r.leads)}</td>
      <td
        className="py-1.5 text-right tabular font-medium"
        style={{ color: r.cpl === null ? COLORS.dim : COLORS.gold }}
      >
        {r.cpl === null ? '—' : moneySmart(r.cpl)}
      </td>
      <td className="py-1.5 text-right tabular text-mute hidden sm:table-cell">{pct(r.ctr)}</td>
      <td className="py-1.5 text-right tabular text-mute pr-1">{r.clicks ? pct(r.cr, 1) : '—'}</td>
    </tr>
  )
}
