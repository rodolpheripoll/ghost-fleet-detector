import { useEffect, useState, useContext } from 'react'
import { supabase, ModeContext } from '../lib/supabase'
import RiskChip from '../components/RiskChip'

function getRiskColor(level) {
  if (level === 'Ghost Fleet') return '#7f1d1d'
  if (level === 'Critical')    return '#ef4444'
  if (level === 'Suspect')     return '#f97316'
  return '#22c55e'
}

// Generate a deterministic mini route SVG path from convoy centroid
function routePath(lat, lon) {
  const x1 = 30
  const y1 = 60 + (lat % 40)
  const mx = 160
  const my = 40 + ((lon ?? 0) % 40)
  const x2 = 290
  const y2 = 35 + (lat % 30)
  return `M${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`
}

export default function Convois() {
  const { mode }                = useContext(ModeContext)
  const [convoys,  setConvoys]  = useState([])
  const [loading,  setLoading]  = useState(true)

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

  const multiShip    = convoys.filter(c => c.size > 1)
  const ghostConvois = convoys.filter(c => c.risk_level === 'Ghost Fleet').length
  const critConvois  = convoys.filter(c => c.risk_level === 'Critical').length
  const suspConvois  = convoys.filter(c => c.risk_level === 'Suspect').length
  const totalShips   = convoys.reduce((a, c) => a + (c.size ?? 1), 0)
  const avgScore     = convoys.length > 0
    ? (convoys.reduce((a, c) => a + (c.avg_score ?? 0), 0) / convoys.length).toFixed(2)
    : '—'

  // Top 6 multi-ship convoys for the card grid
  const topConvoys = multiShip.slice(0, 6)
  // Remaining shown as compact rows
  const restConvoys = multiShip.slice(6, 13)

  return (
    <main className="px-8 py-7">
      {/* Page header */}
      <section className="flex items-end justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-[12px] mb-2" style={{ color: 'var(--muted)' }}>
            <span>Renseignement maritime</span>
            <span style={{ color: 'var(--line)' }}>/</span>
            <span className="font-semibold" style={{ color: 'var(--ink-2)' }}>Convois</span>
          </div>
          <h1 className="text-[26px] font-bold tracking-tight" style={{ color: 'var(--ink)' }}>
            Détection de convois — groupes de navires
          </h1>
          <div className="text-[13.5px] mt-1" style={{ color: 'var(--muted)' }}>
            Regroupements détectés par similarité de route, proximité spatio-temporelle et co-occurrence portuaire — fenêtre 7 j.
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {[{ label: 'Niveau', value: 'Tous' }, { label: 'Taille', value: '≥ 2' }].map(({ label, value }) => (
            <div key={label} className="flex items-center gap-1.5 text-[12px] rounded-lg px-2.5 py-1.5 border"
              style={{ background: 'var(--paper)', borderColor: 'var(--line)' }}>
              <span style={{ color: 'var(--muted)' }}>{label}</span>
              <span className="font-semibold">{value}</span>
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
            </div>
          ))}
          <button className="text-[13px] font-semibold px-3.5 py-2 rounded-lg border"
            style={{ borderColor: 'var(--line)', background: 'var(--paper)' }}>
            Exporter CSV
          </button>
        </div>
      </section>

      {/* KPI cards */}
      <section className="grid grid-cols-4 gap-5 mb-6">
        <div className="card p-5">
          <div className="text-[11px] uppercase font-semibold tracking-wide" style={{ color: 'var(--muted)' }}>Convois détectés</div>
          <div className="mono text-[28px] font-extrabold mt-1">{convoys.length.toLocaleString('fr-FR')}</div>
          <div className="text-[11.5px] mt-1" style={{ color: 'var(--muted)' }}>{multiShip.length} groupes · {totalShips.toLocaleString('fr-FR')} navires</div>
        </div>
        <div className="card p-5">
          <div className="text-[11px] uppercase font-semibold tracking-wide" style={{ color: 'var(--muted)' }}>Convois Ghost Fleet</div>
          <div className="mono text-[28px] font-extrabold mt-1" style={{ color: '#7f1d1d' }}>{ghostConvois}</div>
          <div className="text-[11.5px] mt-1" style={{ color: 'var(--muted)' }}>{critConvois} Critical · {suspConvois} Suspect</div>
        </div>
        <div className="card p-5">
          <div className="text-[11px] uppercase font-semibold tracking-wide" style={{ color: 'var(--muted)' }}>Navires impliqués</div>
          <div className="mono text-[28px] font-extrabold mt-1">{totalShips.toLocaleString('fr-FR')}</div>
          <div className="text-[11.5px] mt-1" style={{ color: 'var(--muted)' }}>tous niveaux de risque</div>
        </div>
        <div className="card p-5">
          <div className="text-[11px] uppercase font-semibold tracking-wide" style={{ color: 'var(--muted)' }}>Score moyen convoi</div>
          <div className="mono text-[28px] font-extrabold mt-1">{avgScore}</div>
          <div className="text-[11.5px] mt-1" style={{ color: 'var(--muted)' }}>index de risque agrégé</div>
        </div>
      </section>

      {loading ? (
        <div className="text-[13px] animate-pulse" style={{ color: 'var(--muted)' }}>Chargement des convois…</div>
      ) : (
        <>
          {/* Convoy cards grid */}
          <section className="grid grid-cols-3 gap-5">
            {topConvoys.map((convoy, idx) => {
              const color = getRiskColor(convoy.risk_level)
              const path  = routePath(convoy.centroid_lat ?? 0, convoy.centroid_lon ?? 0)
              return (
                <div key={convoy.convoy_id} className={`card convoy-card p-5 flex flex-col${idx === 0 ? ' selected' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="mono text-[10.5px]" style={{ color: 'var(--muted)' }}>{convoy.convoy_id}</div>
                      <h3 className="text-[17px] font-bold tracking-tight mt-0.5">
                        Convoi {String(idx + 1).padStart(2, '0')}
                      </h3>
                    </div>
                    <RiskChip level={convoy.risk_level ?? 'Normal'} />
                  </div>
                  <div className="text-[12.5px] mt-1" style={{ color: 'var(--muted)' }}>
                    {convoy.centroid_lat?.toFixed(2)}° N · {convoy.centroid_lon?.toFixed(2)}° E
                  </div>

                  {/* Mini route SVG */}
                  <svg viewBox="0 0 320 120" className="w-full mt-3 rounded-lg"
                    style={{ background: 'linear-gradient(180deg,#eaf1fb,#dde7f3)' }}>
                    <path d={path} fill="none" stroke={color} strokeWidth="2" strokeDasharray="5 3"/>
                    <circle cx="30"  cy={parseInt(path.match(/M\d+ (\d+)/)?.[1] ?? 60)} r="5" fill={color}/>
                    <circle cx="290" cy={parseInt(path.match(/(\d+)$/)?.[1] ?? 35)} r="5" fill={color}/>
                    <text x="22"  y="115" fontFamily="JetBrains Mono" fontSize="9" fill="#475569">
                      {convoy.centroid_lat?.toFixed(1)}°N
                    </text>
                    <text x="255" y="22" fontFamily="JetBrains Mono" fontSize="9" fill="#475569">
                      {convoy.centroid_lon?.toFixed(1)}°E
                    </text>
                  </svg>

                  <div className="grid grid-cols-3 gap-2 mt-3 text-center text-[11px]">
                    <div className="rounded-md py-1.5" style={{ background: 'var(--line-2)' }}>
                      <div style={{ color: 'var(--muted)' }}>Navires</div>
                      <div className="mono font-bold text-[13px]">{convoy.size}</div>
                    </div>
                    <div className="rounded-md py-1.5" style={{ background: 'var(--line-2)' }}>
                      <div style={{ color: 'var(--muted)' }}>Score</div>
                      <div className="mono font-bold text-[13px]">{(convoy.avg_score ?? 0).toFixed(2)}</div>
                    </div>
                    <div className="rounded-md py-1.5" style={{ background: 'var(--line-2)' }}>
                      <div style={{ color: 'var(--muted)' }}>Niveau</div>
                      <div className="mono font-bold text-[13px]" style={{ color }}>{convoy.risk_level?.split(' ')[0] ?? '—'}</div>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t flex items-center justify-between text-[11.5px]" style={{ borderColor: 'var(--line)' }}>
                    <span style={{ color: 'var(--muted)' }}>
                      {convoy.size} membre{convoy.size > 1 ? 's' : ''} · score <span className="font-bold mono" style={{ color: 'var(--ink)' }}>{(convoy.avg_score ?? 0).toFixed(2)}</span>
                    </span>
                    <button className="font-semibold hover:underline" style={{ color: 'var(--navy)' }}>Analyser →</button>
                  </div>
                </div>
              )
            })}
          </section>

          {/* Remaining convoys as compact rows */}
          {restConvoys.map(convoy => (
            <section key={convoy.convoy_id} className="card mt-4 p-5 flex items-center justify-between">
              <div className="flex items-center gap-5">
                <div className="mono text-[10.5px]" style={{ color: 'var(--muted)' }}>{convoy.convoy_id}</div>
                <div>
                  <div className="text-[15px] font-bold">
                    Convoi — {convoy.centroid_lat?.toFixed(1)}°N · {convoy.centroid_lon?.toFixed(1)}°E
                  </div>
                  <div className="text-[12px]" style={{ color: 'var(--muted)' }}>
                    {convoy.size} navires · score {(convoy.avg_score ?? 0).toFixed(2)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <RiskChip level={convoy.risk_level ?? 'Normal'} />
                <button className="text-[12px] font-semibold border rounded-lg px-3 py-1.5"
                  style={{ borderColor: 'var(--line)', background: 'var(--paper)' }}>Voir →</button>
              </div>
            </section>
          ))}

          {multiShip.length > 13 && (
            <div className="mt-4 text-center text-[12px]" style={{ color: 'var(--muted)' }}>
              + {(multiShip.length - 13).toLocaleString('fr-FR')} convois supplémentaires
            </div>
          )}

          {/* Footer */}
          <div className="mt-8 text-[11.5px] flex items-center justify-between" style={{ color: 'var(--muted)' }}>
            <div>Ministère des Armées · DRM · Cellule Ghost Fleet</div>
            <div className="flex items-center gap-4">
              <span>Diffusion restreinte</span><span>·</span><span>Build 2.4.1</span><span>·</span><span>© RF 2026</span>
            </div>
          </div>
        </>
      )}
    </main>
  )
}
