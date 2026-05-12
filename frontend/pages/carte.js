import { useEffect, useState, useContext } from 'react'
import dynamic from 'next/dynamic'
import { supabase, ModeContext } from '../lib/supabase'

const FullMap = dynamic(() => import('../components/FullMap'), { ssr: false })

function getRiskLevel(score) {
  if (score >= 0.68) return 'Ghost Fleet'
  if (score >= 0.44) return 'Critical'
  if (score >= 0.19) return 'Suspect'
  return 'Normal'
}

export default function Carte() {
  const { mode } = useContext(ModeContext)
  const [ships,     setShips]     = useState([])
  const [zones,     setZones]     = useState([])
  const [alerts,    setAlerts]    = useState([])
  const [anomCount, setAnomCount] = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [scoreThreshold, setScoreThreshold] = useState(0)
  const [layers, setLayers] = useState({
    allShips: true, convoyLinks: true, ghostOnly: false, tracks: true, ports: false, loitering: false,
  })
  const [riskFilter, setRiskFilter] = useState({
    'Ghost Fleet': true, Critical: true, Suspect: true, Normal: true,
  })

  useEffect(() => {
    setLoading(true)
    const table = mode === 'graph' ? 'ships_graph' : 'ships'
    const q = mode === 'graph'
      ? supabase.from(table).select('*').order('score', { ascending: false })
      : supabase.from(table).select('*').neq('flag', 'Unknown').order('score', { ascending: false })
    Promise.all([
      q,
      supabase.from('risk_zones').select('*'),
      supabase.from('alerts').select('severity, status'),
      supabase.from('anomalies').select('mmsi', { count: 'exact', head: true }),
    ]).then(([{ data: s }, { data: z }, { data: a }, { count: c }]) => {
      setShips(s ?? [])
      setZones(z ?? [])
      setAlerts(a ?? [])
      setAnomCount(c ?? 0)
    }).finally(() => setLoading(false))
  }, [mode])

  const displayed = ships.filter(s => {
    const score = s.score ?? 0
    const level = s.risk_level ?? getRiskLevel(score)
    if (score < scoreThreshold) return false
    if (layers.ghostOnly && level !== 'Ghost Fleet') return false
    if (!riskFilter[level]) return false
    return true
  })

  const ghostFleet = ships.filter(s => (s.score ?? 0) >= 0.68).length
  const critical   = ships.filter(s => (s.score ?? 0) >= 0.44 && (s.score ?? 0) < 0.68).length
  const suspect    = ships.filter(s => (s.score ?? 0) >= 0.19 && (s.score ?? 0) < 0.44).length
  const normal     = ships.filter(s => (s.score ?? 0) < 0.19).length
  const atRisk     = ships.filter(s => (s.score ?? 0) >= 0.44).length
  const fakeShips  = ships.filter(s => String(s.mmsi).startsWith('FAKE-')).length
  const avgSpeed   = ships.length > 0
    ? (ships.reduce((a, s) => a + (s.speed ?? 0), 0) / ships.length).toFixed(1)
    : '—'

  const critAlerts = alerts.filter(a => a.severity === 'Critical').length
  const highAlerts = alerts.filter(a => a.severity === 'High').length
  const medAlerts  = alerts.filter(a => a.severity === 'Medium').length

  return (
    <main className="flex" style={{ height: 'calc(100vh - 64px)', minHeight: 880 }}>

      {/* LEFT SIDEBAR */}
      <aside className="shrink-0 bg-white border-r flex flex-col overflow-y-auto" style={{ width: 320, borderColor: 'var(--line)' }}>

        {/* Header */}
        <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--line)' }}>
          <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Renseignement maritime</div>
          <h1 className="text-[20px] font-bold tracking-tight leading-tight">Carte 2D — théâtre mondial</h1>
          <div className="flex items-center gap-2 text-[11.5px] mt-2" style={{ color: 'var(--muted)' }}>
            <span className="dot" style={{ background: '#22c55e', boxShadow: '0 0 0 3px rgba(34,197,94,.18)' }} />
            Flux AIS · temps réel
          </div>
        </div>

        {/* Layers */}
        <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--line)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11.5px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-2)' }}>Couches</div>
            <button className="text-[11px] font-semibold hover:underline" style={{ color: 'var(--navy-3)' }}
              onClick={() => setLayers({ allShips: true, convoyLinks: true, ghostOnly: false, tracks: true, ports: false, loitering: false })}>
              Tout réinit.
            </button>
          </div>
          <div className="space-y-2.5 text-[13px]">
            {[
              { key: 'allShips',    label: 'Tous les navires',       count: ships.length.toLocaleString('fr-FR') },
              { key: 'convoyLinks', label: 'Liaisons de convoi',     count: '142' },
              { key: 'ghostOnly',   label: 'Ghost Fleet uniquement', count: String(ghostFleet), accent: true },
              { key: 'tracks',      label: 'Trajectoires (24 h)',    count: 'on' },
              { key: 'ports',       label: 'Ports surveillés',       count: '38' },
              { key: 'loitering',   label: 'Zones de loitering',     count: '21' },
            ].map(({ key, label, count, accent }) => (
              <label key={key} className="flex items-center justify-between gap-3 cursor-pointer">
                <span className="flex items-center gap-2.5">
                  <input type="checkbox" className="check" checked={layers[key]}
                    onChange={e => setLayers(l => ({ ...l, [key]: e.target.checked }))} />
                  {label}
                </span>
                <span className={`mono text-[11.5px] ${accent ? 'font-semibold' : ''}`}
                  style={{ color: accent ? 'var(--ghost)' : 'var(--muted)' }}>{count}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Risk filter */}
        <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--line)' }}>
          <div className="text-[11.5px] font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--ink-2)' }}>Filtrer par niveau de risque</div>
          <div className="space-y-2 text-[13px]">
            {[
              { level: 'Ghost Fleet', color: '#7f1d1d', count: ghostFleet },
              { level: 'Critical',    color: '#ef4444', count: critical },
              { level: 'Suspect',     color: '#f97316', count: suspect },
              { level: 'Normal',      color: '#22c55e', count: normal },
            ].map(({ level, color, count }) => (
              <label key={level} className="flex items-center justify-between gap-3 cursor-pointer">
                <span className="flex items-center gap-2.5">
                  <input type="checkbox" className="check" checked={riskFilter[level]}
                    onChange={e => setRiskFilter(f => ({ ...f, [level]: e.target.checked }))} />
                  <span className="dot" style={{ background: color }} /> {level}
                </span>
                <span className="mono text-[11.5px]" style={{ color: 'var(--muted)' }}>{count.toLocaleString('fr-FR')}</span>
              </label>
            ))}
          </div>

          {/* Score slider */}
          <div className="mt-5">
            <div className="flex items-center justify-between text-[11.5px] mb-1.5">
              <span className="font-bold uppercase tracking-wide" style={{ color: 'var(--ink-2)' }}>Seuil de score</span>
              <span className="mono" style={{ color: 'var(--muted)' }}>≥ {scoreThreshold.toFixed(2)}</span>
            </div>
            <input type="range" min="0" max="1" step="0.01" value={scoreThreshold}
              onChange={e => setScoreThreshold(parseFloat(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
              style={{ background: `linear-gradient(90deg, #22c55e, #f97316, #ef4444) 0 / ${scoreThreshold * 100}% 100%, var(--line) ${scoreThreshold * 100}% 100%` }} />
            <div className="flex justify-between text-[10.5px] mt-1 mono" style={{ color: 'var(--muted)' }}>
              <span>0.00</span><span>1.00</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--line)' }}>
          <div className="text-[11.5px] font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--ink-2)' }}>Statistiques</div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Affichés',     value: displayed.length.toLocaleString('fr-FR'), accent: false },
              { label: 'À risque',     value: atRisk.toLocaleString('fr-FR'), accent: true },
              { label: 'FAKE-MMSI',    value: String(fakeShips), accent: false },
              { label: 'Vélocité moy.', value: `${avgSpeed} kn`, accent: false },
            ].map(({ label, value, accent }) => (
              <div key={label} className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
                <div className="text-[10.5px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{label}</div>
                <div className={`text-[20px] font-bold mt-0.5 mono${accent ? ' text-[#ef4444]' : ''}`}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* FAKE-MMSI indicator */}
        <div className="px-5 py-4">
          <div className="text-[11.5px] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--ink-2)' }}>MMSI suspects</div>
          <div className="flex items-center gap-2 text-[12px]">
            <span className="dot" style={{ background: '#a855f7' }} />
            <span>{fakeShips} navires FAKE-MMSI</span>
          </div>
          <div className="text-[11px] mt-1" style={{ color: 'var(--muted)' }}>Marqués en violet sur la carte</div>
        </div>
      </aside>

      {/* MAP */}
      <section className="flex-1 relative overflow-hidden">
        {/* Stats overlay panel — top-left on map */}
        {!loading && (
          <div className="absolute top-4 left-4 z-[1000] rounded-xl shadow-lg border p-4"
            style={{ background: 'rgba(255,255,255,0.97)', borderColor: 'var(--line)', minWidth: 210 }}>
            <div className="text-[10.5px] font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--muted)' }}>
              Statistiques en direct
            </div>
            <div className="space-y-1.5 text-[12px]">
              <div className="flex items-center justify-between gap-6">
                <span>Total navires</span>
                <span className="mono font-bold">{ships.length.toLocaleString('fr-FR')}</span>
              </div>
              <div className="flex items-center justify-between gap-6">
                <span style={{ color: '#a855f7' }}>FAKE-MMSI</span>
                <span className="mono font-bold" style={{ color: '#a855f7' }}>{fakeShips}</span>
              </div>
              <div className="flex items-center justify-between gap-6">
                <span>Anomalies</span>
                <span className="mono font-bold">{anomCount.toLocaleString('fr-FR')}</span>
              </div>
              <div className="border-t my-1.5" style={{ borderColor: 'var(--line)' }} />
              <div className="flex items-center justify-between gap-6">
                <span className="flex items-center gap-1.5">
                  <span className="dot shrink-0" style={{ background: '#ef4444' }} />Critical
                </span>
                <span className="mono font-bold">{critAlerts}</span>
              </div>
              <div className="flex items-center justify-between gap-6">
                <span className="flex items-center gap-1.5">
                  <span className="dot shrink-0" style={{ background: '#f97316' }} />High
                </span>
                <span className="mono font-bold">{highAlerts}</span>
              </div>
              <div className="flex items-center justify-between gap-6">
                <span className="flex items-center gap-1.5">
                  <span className="dot shrink-0" style={{ background: '#eab308' }} />Medium
                </span>
                <span className="mono font-bold">{medAlerts}</span>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-full text-[13px] animate-pulse"
            style={{ color: 'var(--muted)', background: '#f0f4f8' }}>
            Chargement de la carte…
          </div>
        ) : (
          <FullMap ships={displayed} zones={zones} mode={mode} />
        )}
      </section>
    </main>
  )
}
