import { useEffect, useMemo, useState } from 'react'
import type { Dataset } from './types'
import {
  ALL,
  aggregate,
  buildIndex,
  buildPresets,
  filterRows,
  launchSpan,
  todayIn,
  type Filters,
} from './lib/data'
import { decryptDataset, fetchEncrypted, type EncBlob } from './lib/crypto'
import { launchColors } from './config'
import PasswordGate from './components/PasswordGate'
import Header from './components/Header'
import KpiGrid from './components/KpiGrid'
import LaunchSplit from './components/LaunchSplit'
import Placements from './components/Placements'
import TrendCharts from './components/TrendCharts'
import Funnel from './components/Funnel'
import GeoTable from './components/GeoTable'
import Campaigns from './components/Campaigns'
import CreativeGallery from './components/CreativeGallery'

const PROJECT = 'Lera Rumaa'
const PW_KEY = 'lera_pw'
// per-viewer convenience: reopen on the launch that was being looked at
const LAUNCH_KEY = 'lera_launch'

function readSavedLaunch(): string | null {
  try {
    return localStorage.getItem(LAUNCH_KEY)
  } catch {
    return null
  }
}

export default function App() {
  const [enc, setEnc] = useState<EncBlob | null>(null)
  const [ds, setDs] = useState<Dataset | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [gateErr, setGateErr] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters | null>(null)

  useEffect(() => {
    fetchEncrypted()
      .then(setEnc)
      .catch((e) => setErr(e.message))
  }, [])

  // auto-unlock within a session
  useEffect(() => {
    if (!enc) return
    const saved = sessionStorage.getItem(PW_KEY)
    if (saved) unlock(saved, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enc])

  useEffect(() => {
    if (!filters) return
    try {
      localStorage.setItem(LAUNCH_KEY, filters.launch)
    } catch {
      /* storage blocked — the filter just won't be remembered */
    }
  }, [filters?.launch])

  async function unlock(pw: string, silent = false): Promise<boolean> {
    if (!enc) return false
    try {
      const d = await decryptDataset(enc, pw)
      setDs(d)
      const saved = readSavedLaunch()
      const launch = saved && d.launches.some((l) => l.key === saved) ? saved : ALL
      setFilters({ launch, ...launchSpan(d, launch), preset: 'all' })
      sessionStorage.setItem(PW_KEY, pw)
      setGateErr(null)
      return true
    } catch {
      sessionStorage.removeItem(PW_KEY)
      if (!silent) setGateErr('Неверный пароль')
      return false
    }
  }

  const idx = useMemo(() => (ds ? buildIndex(ds) : null), [ds])
  const colors = useMemo(() => launchColors(ds?.launches || []), [ds])
  const rows = useMemo(
    () => (ds && idx && filters ? filterRows(ds, idx, filters) : []),
    [ds, idx, filters],
  )
  const metrics = useMemo(() => aggregate(rows), [rows])

  if (err) return <CenterMsg title="Ошибка загрузки" body={err} />
  if (!enc) return <CenterMsg title="Загрузка…" body="" spinner />
  if (!ds || !idx || !filters)
    return <PasswordGate project={PROJECT} error={gateErr} onSubmit={(pw) => unlock(pw)} />

  const span = launchSpan(ds, filters.launch)
  const today = todayIn(ds.account.timezone)
  const presets = buildPresets(
    span.from,
    span.to,
    today,
    filters.launch === ALL ? 'Всё время' : 'Весь запуск',
  )

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8 py-6">
        <Header
          ds={ds}
          idx={idx}
          colors={colors}
          filters={filters}
          setFilters={setFilters}
          presets={presets}
          today={today}
        />

        <main className="mt-6 space-y-8">
          <KpiGrid metrics={metrics} rows={rows} />
          {filters.launch === ALL && <LaunchSplit ds={ds} idx={idx} filters={filters} colors={colors} />}
          <TrendCharts rows={rows} />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2">
              <Funnel metrics={metrics} />
            </div>
            <div className="lg:col-span-3">
              <GeoTable ds={ds} idx={idx} filters={filters} />
            </div>
          </div>
          <Campaigns idx={idx} rows={rows} colors={colors} />
          <Placements ds={ds} idx={idx} filters={filters} />
          <CreativeGallery idx={idx} rows={rows} colors={colors} />
        </main>

        <footer className="mt-12 pt-6 border-t border-line text-xs text-dim flex flex-wrap items-center justify-between gap-2">
          <span>
            {ds.project} · {ds.account.name} · Meta Marketing API
          </span>
          <span>Обновляется автоматически каждые 3 часа · лид = подписка (Subscribe)</span>
        </footer>
      </div>
    </div>
  )
}

function CenterMsg({
  title,
  body,
  spinner = false,
}: {
  title: string
  body: string
  spinner?: boolean
}) {
  return (
    <div className="min-h-screen grid place-items-center px-6">
      <div className="text-center">
        {spinner && (
          <div className="mx-auto mb-4 h-8 w-8 rounded-full border-2 border-line border-t-[#d8b878] animate-spin" />
        )}
        <div className="font-display text-xl text-ink">{title}</div>
        {body && <div className="text-sm text-mute mt-2 max-w-md">{body}</div>}
      </div>
    </div>
  )
}
