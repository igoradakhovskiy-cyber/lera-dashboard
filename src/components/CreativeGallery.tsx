import { useMemo, useState } from 'react'
import type { CreativeGroup, DailyRow, Metrics } from '../types'
import { aggregate, groupBy, type Index } from '../lib/data'
import { SectionTitle, Segmented } from './ui'
import CreativeCard from './CreativeCard'
import CreativeModal from './CreativeModal'

type SortKey = 'leads' | 'cpl' | 'spend' | 'ctr'

export interface Item {
  group: CreativeGroup
  m: Metrics
}

export default function CreativeGallery({
  idx,
  rows,
  colors,
}: {
  idx: Index
  rows: DailyRow[]
  colors: Map<string, string>
}) {
  const [sort, setSort] = useState<SortKey>('leads')
  const [open, setOpen] = useState<Item | null>(null)

  const items = useMemo<Item[]>(() => {
    // same key the pipeline groups by: ad names repeat across launches
    const byKey = groupBy(rows, (r) => {
      const ad = idx.adById.get(r.ad_id)
      return ad ? `${ad.launch}|${ad.name}` : undefined
    })
    const list: Item[] = []
    for (const [key, rs] of byKey) {
      const group = idx.creativeByKey.get(key)
      if (!group) continue
      const m = aggregate(rs)
      if (m.impressions <= 0) continue
      list.push({ group, m })
    }
    const sorters: Record<SortKey, (a: Item, b: Item) => number> = {
      leads: (a, b) => b.m.leads - a.m.leads || a.m.cpl - b.m.cpl,
      cpl: (a, b) => (a.m.leads ? a.m.cpl : Infinity) - (b.m.leads ? b.m.cpl : Infinity),
      spend: (a, b) => b.m.spend - a.m.spend,
      ctr: (a, b) => b.m.ctr - a.m.ctr,
    }
    return list.sort(sorters[sort])
  }, [rows, idx, sort])

  const topIsMeaningful = sort === 'leads' && (items[0]?.m.leads || 0) > 0

  return (
    <section>
      <SectionTitle
        title="🎬 Креативы"
        subtitle={`${items.length} работающих креативов за период · клик — живое превью и метрики`}
        right={
          <Segmented
            value={sort}
            onChange={setSort}
            options={[
              { value: 'leads', label: 'по лидам' },
              { value: 'cpl', label: 'по CPL' },
              { value: 'spend', label: 'по расходу' },
              { value: 'ctr', label: 'по CTR' },
            ]}
          />
        }
      />

      {items.length === 0 ? (
        <div className="bento p-8 text-center text-dim text-sm">Нет креативов с показами за период</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {items.map((it, i) => (
            <CreativeCard
              key={it.group.key}
              group={it.group}
              m={it.m}
              launch={idx.launchByKey.get(it.group.launch)?.label || it.group.launch}
              color={colors.get(it.group.launch) || '#9aa3b7'}
              top={i === 0 && topIsMeaningful}
              onClick={() => setOpen(it)}
            />
          ))}
        </div>
      )}

      {open && (
        <CreativeModal
          group={open.group}
          m={open.m}
          idx={idx}
          launch={idx.launchByKey.get(open.group.launch)?.label || open.group.launch}
          color={colors.get(open.group.launch) || '#9aa3b7'}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  )
}
