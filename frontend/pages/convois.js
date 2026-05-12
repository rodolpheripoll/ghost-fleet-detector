import { useEffect, useState, useContext } from 'react'
import dynamic from 'next/dynamic'
import { supabase, ModeContext } from '../lib/supabase'
import RiskChip from '../components/RiskChip'

const ConvoisMap = dynamic(() => import('../components/ConvoisMap'), { ssr: false })

function getRiskColor(level) {
  if (level === 'Ghost Fleet') return '#7f1d1d'
  if (level === 'Critical')    return '#ef4444'
  if (level === 'Suspect')     return '#f97316'
  return '#22c55e'
}

export default function Convois() {
  const { mode }                      = useContext(ModeContext)
  const [convoys,    setConvoys]      = useState([])
  const [loading,    setLoading]      = useState(true)
  const [selectedId, setSelectedId]  = useState(null)
  const [riskFilter, setRiskFilter]  = useState('all')

  useEffect(() => {
    setLoading(true)
    supabase
      .from('convoys')
      .select('*')
      .order('avg_score', { ascending: false })
      .limit(200)
      .then(({ data }) => setConvoys(data ?? []))
      .finally(() => setLoading(false))
  }, [])

  const filtered = riskFilter === 'all'
    ? convoys
    : convoys.filter(c => c.risk_level === riskFilter)

  const selected = convoys.find(c => c.convoy_id === selectedId)
  const multiShip    = convoys.filter(c => (c.size ?? 1) > 1)
  const ghostConvois = convoys.filter(c => c.risk_level === 'Ghost Fleet').length
  const critConvois  = convoys.filter(c => c.risk_level === 'Critical').length
  const suspConvois  = convoys.filter(c => c.risk_level === 'Suspect').length
  const totalShips   = convoys.reduce((a, c) => a + (c.size ?? 1), 0)
  const avgScore     = convoys.length > 0
    ? (convoys.reduce((a, c) => a + (c.avg_score ?? 0), 0) / convoys.length).toFixed(2)
    : '—'

  return (
    <main className="flex" style={{ height: 'calc(100vh - 64px)', minHeight: 700 }}>

      {/* LEFT PANEL */}
      <aside className="shrink-0 bg-white border-r flex flex-col" style={{ width: 320, borderColor: 'var(--line)' }}>

        {/* Header */}
        <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--line)' }}>
          <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>
            Renseignement maritime / Convois
          </div>
          <h1 className="text-[18px] font-bold tracking-tight">Groupes de navires suspects</h1>
          <div className="text-[11.5px] mt-1" style={{ color: 'var(--muted)' }}>
            Regroupements détectés par similarité de route et proximité spatio-temporelle.
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
            <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Convois</div>
            <div className="mono text-[20px] font-extrabold mt-0.5">{convoys.length}</div>
          </div>
          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
            <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Navires</div>
            <div className="mono text-[20px] font-extrabold mt-0.5">{totalShips.toLocaleString('fr-FR')}</div>
          </div>
          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
            <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Ghost Fleet</div>
            <div className="mono text-[20px] font-extrabold mt-0.5" style={{ color: '#7f1d1d' }}>{ghostConvois}</div>
          </div>
          <div className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
            <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>Score moy.</div>
            <div className="mono text-[20px] font-extrabold mt-0.5">{avgScore}</div>
          </div>
        </div>

        {/* Risk filter */}
        <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
          <div className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: 'var(--ink-2)' }}>Filtrer</div>
          <div className="flex flex-wrap gap-1.5">
            {['all', 'Ghost Fleet', 'Critical', 'Suspect', 'Normal'].map(level => (
              <button key={level}
                onClick={() => setRiskFilter(level)}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-md border"
                style={{
                  borderColor: riskFilter === level ? 'var(--navy)' : 'var(--line)',
                  background: riskFilter === level ? '#f5f8fd' : 'var(--paper)',
                  color: riskFilter === level ? 'var(--navy)' : 'var(--muted)',
                }}>
                {level === 'all' ? 'Tous' : level}
              </button>
            ))}
          </div>
        </div>

        {/* Convoy list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="px-5 py-4 text-[12px] animate-pulse" style={{ color: 'var(--muted)' }}>Chargement…</div>
          ) : (
            filtered.slice(0, 50).map((convoy, idx) => {
              const color    = getRiskColor(convoy.risk_level)
              const isActive = convoy.convoy_id === selectedId
              return (
                <button key={convoy.convoy_id} onClick={() => setSelectedId(convoy.convoy_id)}
                  className="w-full text-left px-5 py-3.5 border-b hover:bg-[var(--line-2)]"
                  style={{
                    borderColor: 'var(--line-2)',
                    background: isActive ? '#f5f8fd' : 'transparent',
                    borderLeft: isActive ? `3px solid ${color}` : '3px solid transparent',
                  }}>
                  <div className="flex items-center justify-between">
                    <div className="mono text-[10.5px]" style={{ color: 'var(--muted)' }}>{convoy.convoy_id}</div>
                    <RiskChip level={convoy.risk_level ?? 'Normal'} />
                  </div>
                  <div className="text-[13px] font-semibold mt-0.5">
                    Convoi {String(idx + 1).padStart(2, '0')} — {convoy.size ?? 1} navire{(convoy.size ?? 1) > 1 ? 's' : ''}
                  </div>
                  <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--muted)' }}>
                    {convoy.centroid_lat?.toFixed(2)}°N · {convoy.centroid_lon?.toFixed(2)}°E · score {(convoy.avg_score ?? 0).toFixed(2)}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </aside>

      {/* MAP + detail */}
      <section className="flex-1 flex flex-col">
        {/* Top stats bar */}
        <div className="flex items-center gap-6 px-6 py-3 border-b text-[12px] bg-white" style={{ borderColor: 'var(--line)' }}>
          <span className="font-semibold" style={{ color: 'var(--ink-2)' }}>
            {filtered.length} convoi{filtered.length > 1 ? 's' : ''} affichés
          </span>
          <span style={{ color: 'var(--muted)' }}>·</span>
          <span>{totalShips.toLocaleString('fr-FR')} navires impliqués</span>
          <span style={{ color: 'var(--muted)' }}>·</span>
          <span style={{ color: '#7f1d1d' }}>{ghostConvois} Ghost Fleet</span>
          <span style={{ color: '#ef4444' }}>{critConvois} Critical</span>
          <span style={{ color: '#f97316' }}>{suspConvois} Suspect</span>
          <span className="ml-auto mono text-[11px]" style={{ color: 'var(--muted)' }}>GRAPH mode · convois actifs</span>
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          {!loading && (
            <ConvoisMap
              convoys={filtered}
              selectedId={selectedId}
              onSelect={id => setSelectedId(id === selectedId ? null : id)}
            />
          )}

          {/* Selected convoy detail overlay */}
          {selected && (
            <div className="absolute top-4 right-4 z-[1000] bg-white rounded-xl shadow-lg border p-5"
              style={{ borderColor: 'var(--line)', width: 260 }}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="mono text-[10px]" style={{ color: 'var(--muted)' }}>{selected.convoy_id}</div>
                  <div className="text-[16px] font-bold mt-0.5">Détail du convoi</div>
                </div>
                <div className="flex items-center gap-2">
                  <RiskChip level={selected.risk_level ?? 'Normal'} />
                  <button onClick={() => setSelectedId(null)} className="text-[12px] font-semibold px-2 py-1 rounded-md border"
                    style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>×</button>
                </div>
              </div>
              <div className="space-y-2 text-[12.5px]">
                {[
                  { label: 'Navires', value: selected.size ?? 1 },
                  { label: 'Score moyen', value: (selected.avg_score ?? 0).toFixed(3) },
                  { label: 'Latitude', value: `${selected.centroid_lat?.toFixed(4)}°N` },
                  { label: 'Longitude', value: `${selected.centroid_lon?.toFixed(4)}°E` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span style={{ color: 'var(--muted)' }}>{label}</span>
                    <span className="mono font-semibold">{value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--line)' }}>
                <div className="meter">
                  <div style={{
                    width: `${Math.round((selected.avg_score ?? 0) * 100)}%`,
                    background: getRiskColor(selected.risk_level),
                  }} />
                </div>
                <div className="text-[10.5px] mt-1" style={{ color: 'var(--muted)' }}>
                  Score composite {((selected.avg_score ?? 0) * 100).toFixed(0)}%
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
