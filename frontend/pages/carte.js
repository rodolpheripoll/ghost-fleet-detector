import { useEffect, useState, useContext } from 'react'
import dynamic from 'next/dynamic'
import { supabase, ModeContext } from '../lib/supabase'
import RiskChip from '../components/RiskChip'

const FullMap = dynamic(() => import('../components/FullMap'), { ssr: false })

function getRiskLevel(score) {
  if (score >= 0.8) return 'Ghost Fleet'
  if (score >= 0.6) return 'Critical'
  if (score >= 0.3) return 'Suspect'
  return 'Normal'
}

export default function Carte() {
  const { mode } = useContext(ModeContext)
  const [ships,   setShips]   = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [scoreThreshold, setScoreThreshold] = useState(0)
  const [layers, setLayers]   = useState({
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
    q.then(({ data }) => setShips(data ?? [])).finally(() => setLoading(false))
  }, [mode])

  const displayed = ships.filter(s => {
    const score = s.score ?? 0
    const level = s.risk_level ?? getRiskLevel(score)
    if (score < scoreThreshold) return false
    if (layers.ghostOnly && level !== 'Ghost Fleet') return false
    if (!riskFilter[level]) return false
    return true
  })

  const ghostFleet = ships.filter(s => (s.score ?? 0) >= 0.8).length
  const atRisk     = ships.filter(s => (s.score ?? 0) >= 0.6).length
  const avgSpeed   = ships.length > 0
    ? (ships.reduce((a, s) => a + (s.speed ?? 0), 0) / ships.length).toFixed(1)
    : '—'

  const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <main className="flex" style={{ height: 'calc(100vh - 64px)', minHeight: 880 }}>

      {/* LEFT SIDEBAR */}
      <aside className="shrink-0 bg-white border-r flex flex-col overflow-y-auto" style={{ width: 320, borderColor: 'var(--line)' }}>

        {/* Header */}
        <div className="px-5 py-5 border-b" style={{ borderColor: 'var(--line)' }}>
          <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Renseignement maritime</div>
          <h1 className="text-[20px] font-bold tracking-tight leading-tight">Carte 3D — théâtre mondial</h1>
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
              { key: 'allShips',    label: 'Tous les navires',    count: ships.length.toLocaleString('fr-FR') },
              { key: 'convoyLinks', label: 'Liaisons de convoi',  count: '142' },
              { key: 'ghostOnly',   label: 'Ghost Fleet uniquement', count: String(ghostFleet), accent: true },
              { key: 'tracks',      label: 'Trajectoires (24 h)', count: 'on' },
              { key: 'ports',       label: 'Ports surveillés',    count: '38' },
              { key: 'loitering',   label: 'Zones de loitering',  count: '21' },
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
              { level: 'Critical',    color: '#ef4444', count: atRisk - ghostFleet },
              { level: 'Suspect',     color: '#f97316', count: ships.filter(s => (s.score ?? 0) >= 0.3 && (s.score ?? 0) < 0.6).length },
              { level: 'Normal',      color: '#22c55e', count: ships.filter(s => (s.score ?? 0) < 0.3).length },
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
              { label: 'Convois',      value: '7', accent: false },
              { label: 'Vélocité moy.', value: `${avgSpeed} kn`, accent: false },
            ].map(({ label, value, accent }) => (
              <div key={label} className="rounded-lg border p-3" style={{ borderColor: 'var(--line)' }}>
                <div className="text-[10.5px] uppercase tracking-wide" style={{ color: 'var(--muted)' }}>{label}</div>
                <div className={`text-[20px] font-bold mt-0.5 mono${accent ? ' text-[#ef4444]' : ''}`}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Style */}
        <div className="px-5 py-5">
          <div className="text-[11.5px] font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--ink-2)' }}>Style de carte</div>
          <div className="grid grid-cols-3 gap-2">
            <button className="aspect-[4/3] rounded-md border-2 border-[var(--navy-2)] bg-[#0b1530]" aria-pressed="true" />
            <button className="aspect-[4/3] rounded-md border bg-gradient-to-br from-[#dde7f3] to-[#ffffff]" style={{ borderColor: 'var(--line)' }} />
            <button className="aspect-[4/3] rounded-md border bg-gradient-to-br from-[#0f2945] to-[#1e3a5f]" style={{ borderColor: 'var(--line)' }} />
          </div>
          <div className="grid grid-cols-3 text-[10.5px] text-center mt-1.5" style={{ color: 'var(--muted)' }}>
            <div className="font-semibold" style={{ color: 'var(--ink)' }}>Sombre</div><div>Clair</div><div>Satellite</div>
          </div>
        </div>
      </aside>

      {/* GLOBE / MAP */}
      <section className="flex-1 relative overflow-hidden"
        style={{ background: 'radial-gradient(ellipse at center, #0e1f36 0%, #06101f 70%, #030814 100%)' }}>

        {/* Starfield */}
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          <defs>
            <pattern id="carteDots" width="60" height="60" patternUnits="userSpaceOnUse">
              <circle cx="2"  cy="6"  r="0.5" fill="#fff" opacity=".15"/>
              <circle cx="28" cy="34" r="0.5" fill="#fff" opacity=".10"/>
              <circle cx="48" cy="14" r="0.5" fill="#fff" opacity=".18"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#carteDots)"/>
        </svg>

        {/* Top HUD */}
        <div className="absolute top-5 left-5 flex items-center gap-2 z-10">
          <div className="bg-[#0b1530]/85 backdrop-blur border border-white/10 rounded-lg px-3 py-2 text-white text-[12px] flex items-center gap-2">
            <span className="dot" style={{ background: '#22c55e', boxShadow: '0 0 0 3px rgba(34,197,94,.2)' }} />
            <span className="mono text-[11px]">LIVE · {now} UTC</span>
          </div>
          <div className="bg-[#0b1530]/85 backdrop-blur border border-white/10 rounded-lg px-3 py-2 text-white text-[12px] mono">
            {ships.length.toLocaleString('fr-FR')} navires · {displayed.length.toLocaleString('fr-FR')} affichés
          </div>
        </div>

        {/* Zoom controls */}
        <div className="absolute top-5 right-5 flex flex-col gap-2 z-10">
          <div className="bg-white rounded-lg border shadow-lg flex flex-col" style={{ borderColor: 'var(--line)' }}>
            {[
              { title: 'Zoom +', icon: <><path d="M12 5v14M5 12h14"/></> },
              { title: 'Zoom −', icon: <><path d="M5 12h14"/></> },
              { title: 'Centrer', icon: <><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></> },
              { title: 'Plein écran', icon: <><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></> },
            ].map(({ title, icon }, i, arr) => (
              <button key={title} title={title}
                className={`w-10 h-10 flex items-center justify-center hover:bg-[var(--line-2)]${i < arr.length - 1 ? ' border-b' : ''}`}
                style={{ borderColor: 'var(--line)' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1e3a5f" strokeWidth="2">{icon}</svg>
              </button>
            ))}
          </div>
        </div>

        {/* The globe SVG */}
        <div className="absolute inset-0 flex items-center justify-center">
          {loading ? (
            <div className="text-white text-[13px] animate-pulse">Chargement de la carte…</div>
          ) : (
            <svg width="720" height="720" viewBox="0 0 720 720" fill="none">
              <defs>
                <radialGradient id="carteOcean" cx="42%" cy="36%" r="62%">
                  <stop offset="0%"   stopColor="#244c7a"/>
                  <stop offset="55%"  stopColor="#15304f"/>
                  <stop offset="100%" stopColor="#08182c"/>
                </radialGradient>
                <radialGradient id="carteRim" cx="50%" cy="50%" r="50%">
                  <stop offset="92%"  stopColor="#3a6aa8" stopOpacity="0"/>
                  <stop offset="100%" stopColor="#3a6aa8" stopOpacity=".6"/>
                </radialGradient>
              </defs>
              <circle cx="360" cy="360" r="320" fill="url(#carteOcean)"/>
              <circle cx="360" cy="360" r="320" fill="url(#carteRim)"/>
              <g stroke="#3a6aa8" strokeOpacity=".22" fill="none">
                <ellipse cx="360" cy="360" rx="320" ry="60"/><ellipse cx="360" cy="360" rx="320" ry="130"/>
                <ellipse cx="360" cy="360" rx="320" ry="200"/><ellipse cx="360" cy="360" rx="320" ry="270"/>
                <ellipse cx="360" cy="360" rx="60"  ry="320"/><ellipse cx="360" cy="360" rx="130" ry="320"/>
                <ellipse cx="360" cy="360" rx="200" ry="320"/><ellipse cx="360" cy="360" rx="270" ry="320"/>
              </g>
              <ellipse cx="360" cy="360" rx="320" ry="0.5" stroke="#3a6aa8" strokeOpacity=".45" fill="none"/>
              <g fill="#1e3a5f" fillOpacity=".55" stroke="#3a6aa8" strokeOpacity=".35">
                <path d="M340 180 q40 -10 60 10 t10 60 q5 40 -10 60 q-5 30 -20 50 q-10 50 -25 90 q-10 35 -35 30 q-20 -10 -25 -50 q-15 -60 -5 -120 q5 -50 20 -70 q10 -30 30 -60Z"/>
                <path d="M430 200 q60 -20 100 20 q35 30 40 80 q5 40 -25 60 q-30 20 -70 10 q-30 -10 -45 -40 q-15 -40 -20 -80 q0 -30 20 -50Z"/>
                <path d="M180 200 q30 -10 50 20 q15 40 0 80 q-10 60 -30 100 q-15 50 -35 80 q-20 30 -40 10 q-20 -30 -10 -80 q5 -60 25 -120 q10 -50 40 -90Z"/>
                <path d="M520 460 q35 -10 55 10 q20 20 5 45 q-25 25 -55 15 q-25 -10 -25 -35 q5 -25 20 -35Z"/>
              </g>
              {/* Ghost fleet dots with ping */}
              {displayed.filter(s => (s.score ?? 0) >= 0.8).slice(0, 3).map((s, i) => {
                const cx = 325 + i * 85; const cy = 285 + i * 18
                return (
                  <g key={s.mmsi} transform={`translate(${cx} ${cy})`}>
                    <circle r="16" fill="#7f1d1d" opacity=".3" className="ping"/>
                    <circle r="6" fill="#7f1d1d" style={{ filter: 'drop-shadow(0 0 6px #7f1d1d)' }}
                      onClick={() => setSelected(s)} style={{ cursor: 'pointer' }}/>
                  </g>
                )
              })}
              {/* Critical dots */}
              {[366,295,535,466,395,445,200,555,350].map((cx,i) => (
                <circle key={i} cx={cx} cy={[278,320,340,320,290,360,345,420,445][i]} r="5" fill="#ef4444"
                  style={{ filter: 'drop-shadow(0 0 4px #ef4444)' }}/>
              ))}
              {/* Suspect dots */}
              {[240,280,380,430,500,555].map((cx,i) => (
                <circle key={i} cx={cx} cy={[300,380,350,395,270,380][i]} r="4" fill="#f97316"/>
              ))}
              {/* Normal dots */}
              {[155,220,280,320,450,540,595].map((cx,i) => (
                <circle key={i} cx={cx} cy={[240,180,225,160,170,225,290][i]} r="3" fill="#22c55e"/>
              ))}
              {/* Convoy lines */}
              <g stroke="#3a6aa8" strokeOpacity=".55" fill="none" strokeDasharray="2 4">
                <path d="M325 285 Q345 270 366 278"/><path d="M366 278 Q380 295 395 290"/>
                <path d="M325 285 Q310 305 295 320"/><path d="M495 320 Q515 330 535 340"/>
              </g>
            </svg>
          )}
        </div>

        {/* Selected ship tooltip */}
        {selected && (
          <div className="absolute z-20" style={{ left: 'calc(50% + 60px)', top: 'calc(50% - 200px)' }}>
            <div className="bg-white rounded-xl shadow-2xl border overflow-hidden w-[280px]" style={{ borderColor: 'var(--line)' }}>
              <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--line)' }}>
                <div>
                  <div className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: 'var(--muted)' }}>MMSI</div>
                  <div className="mono text-[13px] font-bold">{selected.mmsi}</div>
                </div>
                <RiskChip level={selected.risk_level ?? getRiskLevel(selected.score ?? 0)} />
              </div>
              <div className="px-4 py-3">
                <div className="text-[15px] font-bold">{selected.ship_name || selected.name || 'INCONNU'}</div>
                <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--muted)' }}>
                  {selected.flag} · {selected.type || 'N/A'} · {selected.length ? `${selected.length} m` : '—'}
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3 text-[11.5px]">
                  <div>
                    <div className="text-[10px] uppercase font-semibold tracking-wide" style={{ color: 'var(--muted)' }}>Score</div>
                    <div className="mono font-bold text-[14px]">{(selected.score ?? 0).toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-semibold tracking-wide" style={{ color: 'var(--muted)' }}>Position</div>
                    <div className="mono text-[11.5px]">{selected.latitude?.toFixed(2)}° · {selected.longitude?.toFixed(2)}°</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-semibold tracking-wide" style={{ color: 'var(--muted)' }}>Vitesse</div>
                    <div className="mono">{selected.speed ? `${selected.speed} kn` : '—'}</div>
                  </div>
                </div>
              </div>
              <div className="px-4 py-2.5 border-t flex items-center justify-between" style={{ background: '#fafcfe', borderColor: 'var(--line)' }}>
                <button className="text-[12px] font-semibold hover:underline" style={{ color: 'var(--navy)' }}>Voir la fiche →</button>
                <button className="text-[11.5px] font-semibold text-white rounded-md px-2.5 py-1.5"
                  style={{ background: 'var(--navy)' }}
                  onClick={() => setSelected(null)}>Fermer</button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom legend */}
        <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4 pointer-events-none z-10">
          <div className="bg-[#0b1530]/85 backdrop-blur border border-white/10 rounded-lg px-4 py-3 text-white">
            <div className="text-[10px] uppercase font-semibold tracking-wider mb-2" style={{ color: '#9fb0c8' }}>Légende — niveaux de risque</div>
            <div className="flex items-center gap-5 text-[12px]">
              <span className="flex items-center gap-2"><span className="dot" style={{ background: '#7f1d1d', boxShadow: '0 0 6px #7f1d1d' }} /> Ghost Fleet · {ships.filter(s=>(s.score??0)>=0.8).length}</span>
              <span className="flex items-center gap-2"><span className="dot" style={{ background: '#ef4444', boxShadow: '0 0 6px #ef4444' }} /> Critical · {ships.filter(s=>(s.score??0)>=0.6&&(s.score??0)<0.8).length}</span>
              <span className="flex items-center gap-2"><span className="dot" style={{ background: '#f97316', boxShadow: '0 0 6px #f97316' }} /> Suspect · {ships.filter(s=>(s.score??0)>=0.3&&(s.score??0)<0.6).length}</span>
              <span className="flex items-center gap-2"><span className="dot" style={{ background: '#22c55e' }} /> Normal · {ships.filter(s=>(s.score??0)<0.3).length}</span>
            </div>
          </div>
          <div className="bg-[#0b1530]/85 backdrop-blur border border-white/10 rounded-lg px-4 py-3 text-white">
            <div className="text-[10px] uppercase font-semibold tracking-wider mb-1" style={{ color: '#9fb0c8' }}>Projection · Caméra</div>
            <div className="mono text-[12px]">Ortho · 360°/45° · alt. 18 200 km</div>
          </div>
        </div>
      </section>
    </main>
  )
}
