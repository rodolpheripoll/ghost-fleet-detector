import { useEffect, useState, useContext } from 'react'
import Link from 'next/link'
import { supabase, ModeContext } from '../lib/supabase'
import KPICard from '../components/KPICard'
import RiskChip from '../components/RiskChip'

function getRiskLevel(score) {
  if (score >= 0.68) return 'Ghost Fleet'
  if (score >= 0.44) return 'Critical'
  if (score >= 0.19) return 'Suspect'
  return 'Normal'
}

const RISK_ORDER = { 'Ghost Fleet': 4, 'Critical': 3, 'Suspect': 2, 'Normal': 1 }

function sortShips(list, field, dir) {
  return [...list].sort((a, b) => {
    let av, bv
    if (field === 'risk_level') {
      av = RISK_ORDER[a.risk_level || 'Normal'] || 0
      bv = RISK_ORDER[b.risk_level || 'Normal'] || 0
    } else if (field === 'score' || field === 'timestamp') {
      av = a[field] ?? 0
      bv = b[field] ?? 0
    } else {
      av = (a[field] ?? '').toString().toLowerCase()
      bv = (b[field] ?? '').toString().toLowerCase()
    }
    if (av < bv) return dir === 'desc' ? 1 : -1
    if (av > bv) return dir === 'desc' ? -1 : 1
    return 0
  })
}

function getRiskColor(level) {
  if (level === 'Ghost Fleet') return '#7f1d1d'
  if (level === 'Critical')    return '#ef4444'
  if (level === 'Suspect')     return '#f97316'
  return '#22c55e'
}

function formatTime(ts) {
  if (!ts) return '—'
  try { return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) }
  catch { return '—' }
}

export default function Dashboard() {
  const { mode }                    = useContext(ModeContext)
  const [ships,    setShips]        = useState([])
  const [anomalies,setAnom]         = useState([])
  const [loading,  setLoad]         = useState(true)
  const [sortField, setSortField]   = useState('score')
  const [sortDir,   setSortDir]     = useState('desc')

  function handleSort(field) {
    if (sortField === field) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortField(field); setSortDir('desc') }
  }
  function arrow(field) {
    if (sortField !== field) return ' ↕'
    return sortDir === 'desc' ? ' ↓' : ' ↑'
  }

  useEffect(() => {
    setLoad(true)
    const table = mode === 'graph' ? 'ships_graph' : 'ships'
    const shipsQ = mode === 'graph'
      ? supabase.from(table).select('*').order('score', { ascending: false })
      : supabase.from(table).select('*').neq('flag', 'Unknown').order('score', { ascending: false })

    Promise.all([
      shipsQ,
      mode === 'demo'
        ? supabase.from('anomalies').select('*')
        : Promise.resolve({ data: [], error: null }),
    ]).then(([{ data: s }, { data: a }]) => {
      setShips(s ?? [])
      setAnom(a ?? [])
    }).finally(() => setLoad(false))
  }, [mode])

  const sorted     = sortShips(ships, sortField, sortDir)
  const top10      = sorted.slice(0, 10)
  const suspicious = ships.filter(s => (s.score ?? 0) >= 0.19).length
  const critical   = ships.filter(s => (s.score ?? 0) >= 0.44).length
  const ghostCount = ships.filter(s => (s.score ?? 0) >= 0.68).length

  const anomByMmsi = {}
  anomalies.forEach(a => {
    if (!anomByMmsi[a.mmsi]) anomByMmsi[a.mmsi] = []
    anomByMmsi[a.mmsi].push(a)
  })

  const aisGap     = anomalies.filter(a => (a.type ?? '').toLowerCase().includes('gap')).length
  const stsSpoofing= anomalies.filter(a => { const t = (a.type ?? '').toLowerCase(); return t.includes('sts') || t.includes('spoof') }).length
  const autres     = Math.max(0, anomalies.length - aisGap - stsSpoofing)

  const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })

  return (
    <main className="px-8 py-7">
      {/* Page header */}
      <section className="flex items-end justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-[12px] mb-2" style={{ color: 'var(--muted)' }}>
            <span>Renseignement maritime</span>
            <span style={{ color: 'var(--line)' }}>/</span>
            <span className="font-semibold" style={{ color: 'var(--ink-2)' }}>Tableau de bord</span>
          </div>
          <h1 className="text-[26px] font-bold tracking-tight" style={{ color: 'var(--ink)' }}>
            Système de détection de la flotte fantôme
          </h1>
          <div className="text-[13.5px] mt-1" style={{ color: 'var(--muted)' }}>
            Ministère des Armées — synthèse opérationnelle sur 24 heures, théâtre Atlantique Nord & Méditerranée orientale.
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 text-[12.5px] mr-2" style={{ color: 'var(--muted)' }}>
            <span className="dot" style={{ background: '#22c55e', boxShadow: '0 0 0 3px rgba(34,197,94,.15)' }} />
            Flux AIS · temps réel
            <span className="mono text-[11px] ml-2" style={{ color: 'var(--ink-3)' }}>{now} UTC</span>
          </div>
          <button className="text-[13px] font-semibold px-3.5 py-2 rounded-lg border hover:bg-[var(--line-2)]"
            style={{ borderColor: 'var(--line)', background: 'var(--paper)' }}>
            Filtres
          </button>
          <button className="text-[13px] font-semibold px-3.5 py-2 rounded-lg text-white hover:bg-[var(--navy-2)]"
            style={{ background: 'var(--navy)' }}>
            Exporter le rapport
          </button>
        </div>
      </section>

      {loading ? (
        <div className="text-[13px] animate-pulse" style={{ color: 'var(--muted)' }}>Chargement des données…</div>
      ) : (
        <>
          {/* KPI Row */}
          <section className="grid grid-cols-4 gap-5 mb-6">
            <KPICard
              title="Navires analysés"
              gradient="default"
              icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#1e3a5f" strokeWidth="1.8"><path d="M3 17h18M5 17l-2-5h18l-2 5M7 12V8h10v4"/><path d="M12 8V4"/></svg>}
              value={ships.length.toLocaleString('fr-FR')}
              delta="▲ 4.2%"
              deltaGood={true}
            >
              <div className="mt-3 flex items-center justify-between">
                <div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>Couverture AIS</div>
                <div className="mono text-[11.5px] font-semibold">96.4%</div>
              </div>
              <div className="meter mt-1.5">
                <div style={{ width: '96.4%', background: 'linear-gradient(90deg,#3a6aa8,#1e3a5f)' }} />
              </div>
            </KPICard>

            <KPICard
              title="Navires suspects"
              gradient="blue"
              icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#c2410c" strokeWidth="1.8"><path d="M12 9v4M12 17h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/></svg>}
              value={suspicious.toLocaleString('fr-FR')}
              delta="▲ 11.8%"
              deltaGood={false}
            >
              <div className="mt-3 flex items-center justify-between">
                <div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>
                  {ships.length > 0 ? ((suspicious / ships.length) * 100).toFixed(2) : 0}% de la flotte suivie
                </div>
                <svg width="80" height="22" viewBox="0 0 80 22" fill="none">
                  <polyline points="0,15 10,16 20,12 30,13 40,9 50,11 60,7 70,8 80,4" stroke="#1e3a5f" strokeWidth="1.5"/>
                </svg>
              </div>
            </KPICard>

            <KPICard
              title="Navires critiques"
              gradient="default"
              icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ef4444" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/></svg>}
              value={critical.toLocaleString('fr-FR')}
              delta="▲ 6.1%"
              deltaGood={false}
            >
              <div className="mt-3 flex items-center justify-between">
                <div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>
                  dont {ghostCount} « Ghost Fleet »
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-3 rounded-sm inline-block" style={{ background: '#7f1d1d' }} />
                  <span className="w-1.5 h-4 rounded-sm inline-block" style={{ background: '#ef4444' }} />
                  <span className="w-1.5 h-3 rounded-sm inline-block" style={{ background: '#f97316' }} />
                  <span className="w-1.5 h-2 rounded-sm inline-block" style={{ background: '#22c55e' }} />
                </div>
              </div>
            </KPICard>

            <KPICard
              title="Anomalies totales"
              gradient="blue"
              icon={<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#1e3a5f" strokeWidth="1.8"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>}
              value={anomalies.length.toLocaleString('fr-FR')}
              delta="▼ 2.0%"
              deltaGood={true}
            >
              <div className="mt-3 text-[11.5px] flex items-center justify-between" style={{ color: 'var(--muted)' }}>
                <span>AIS gap</span><span className="mono">{aisGap.toLocaleString('fr-FR')}</span>
              </div>
              <div className="text-[11.5px] flex items-center justify-between" style={{ color: 'var(--muted)' }}>
                <span>STS · spoofing</span><span className="mono">{stsSpoofing.toLocaleString('fr-FR')}</span>
              </div>
              <div className="text-[11.5px] flex items-center justify-between" style={{ color: 'var(--muted)' }}>
                <span>Autres</span><span className="mono">{autres.toLocaleString('fr-FR')}</span>
              </div>
            </KPICard>
          </section>

          {/* Split: table + globe */}
          <section className="grid grid-cols-12 gap-5">
            {/* Table */}
            <div className="col-span-8 card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
                <div>
                  <h2 className="text-[15.5px] font-bold tracking-tight">Top 10 — navires les plus suspects</h2>
                  <div className="text-[12px] mt-0.5" style={{ color: 'var(--muted)' }}>
                    Tri par score décroissant · source {mode.toUpperCase()} · Isolation Forest + règles métier
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-[12px] rounded-lg px-2.5 py-1.5 border"
                    style={{ background: 'var(--line-2)', borderColor: 'var(--line)' }}>
                    <span>Période</span><span className="font-semibold">24 h</span>
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
                  </div>
                  <button className="text-[12px] font-semibold rounded-lg px-2.5 py-1.5 border"
                    style={{ borderColor: 'var(--line)' }}>CSV</button>
                </div>
              </div>

              {/* Table header */}
              <div className="grid px-5 py-2.5 text-[11px] font-semibold tracking-wide uppercase border-b select-none"
                style={{ gridTemplateColumns: '40px 120px 1fr 110px 120px 1fr 60px', background: '#fafcfe', borderColor: 'var(--line)', color: 'var(--muted)' }}>
                <div>#</div>
                <div className="cursor-pointer hover:text-[var(--ink)]" onClick={() => handleSort('mmsi')}>MMSI{arrow('mmsi')}</div>
                <div className="cursor-pointer hover:text-[var(--ink)]" onClick={() => handleSort('ship_name')}>Navire / pavillon{arrow('ship_name')}</div>
                <div className="cursor-pointer hover:text-[var(--ink)]" onClick={() => handleSort('score')}>Score{arrow('score')}</div>
                <div className="cursor-pointer hover:text-[var(--ink)]" onClick={() => handleSort('risk_level')}>Niveau{arrow('risk_level')}</div>
                <div>Anomalies</div>
                <div className="text-right cursor-pointer hover:text-[var(--ink)]" onClick={() => handleSort('timestamp')}>Vu{arrow('timestamp')}</div>
              </div>

              {/* Table rows */}
              <div>
                {top10.map((ship, i) => {
                  const score  = ship.score ?? 0
                  const level  = ship.risk_level ?? getRiskLevel(score)
                  const color  = getRiskColor(level)
                  const anoms  = (anomByMmsi[ship.mmsi] ?? []).slice(0, 3)
                  return (
                    <div key={ship.mmsi}
                      className="grid px-5 py-3 items-center row-hover border-b"
                      style={{ gridTemplateColumns: '40px 120px 1fr 110px 120px 1fr 60px', borderColor: 'var(--line-2)' }}>
                      <div className="mono text-[12px]" style={{ color: 'var(--muted)' }}>
                        {String(i + 1).padStart(2, '0')}
                      </div>
                      <div className="mono text-[12.5px] font-semibold">{ship.mmsi}</div>
                      <div>
                        <div className="text-[13.5px] font-semibold">{ship.ship_name || ship.name || 'INCONNU'}</div>
                        <div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>
                          {ship.flag} · {ship.type || 'N/A'}{ship.length ? ` · ${ship.length} m` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="meter w-14">
                          <div style={{ width: `${Math.round(score * 100)}%`, background: color }} />
                        </div>
                        <span className="mono text-[12.5px] font-semibold">{score.toFixed(2)}</span>
                      </div>
                      <div><RiskChip level={level} /></div>
                      <div className="flex flex-wrap gap-1">
                        {anoms.length > 0 ? anoms.map((a, ai) => (
                          <span key={ai} className="text-[10.5px] font-semibold rounded-md px-1.5 py-0.5 border"
                            style={{ background: 'var(--line-2)', borderColor: 'var(--line)' }}>
                            {a.type}
                          </span>
                        )) : (
                          <span className="text-[10.5px] font-semibold rounded-md px-1.5 py-0.5 border"
                            style={{ background: 'var(--line-2)', borderColor: 'var(--line)', color: 'var(--muted)' }}>—</span>
                        )}
                      </div>
                      <div className="mono text-[11px] text-right" style={{ color: 'var(--muted)' }}>
                        {formatTime(ship.last_seen)}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Table footer */}
              <div className="flex items-center justify-between px-5 py-3 border-t text-[12px]"
                style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>
                <div>Affichage 1–10 sur <span className="font-semibold" style={{ color: 'var(--ink)' }}>{suspicious.toLocaleString('fr-FR')}</span> navires suspects</div>
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5"><span className="dot" style={{ background: '#7f1d1d' }} /> Ghost Fleet</span>
                  <span className="flex items-center gap-1.5"><span className="dot" style={{ background: '#ef4444' }} /> Critical</span>
                  <span className="flex items-center gap-1.5"><span className="dot" style={{ background: '#f97316' }} /> Suspect</span>
                  <span className="flex items-center gap-1.5"><span className="dot" style={{ background: '#22c55e' }} /> Normal</span>
                </div>
              </div>
            </div>

            {/* Globe */}
            <div className="col-span-4 card overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--line)' }}>
                <div>
                  <h2 className="text-[15.5px] font-bold tracking-tight">Vue mondiale</h2>
                  <div className="text-[12px] mt-0.5" style={{ color: 'var(--muted)' }}>
                    Positions des navires colorées par niveau de risque
                  </div>
                </div>
                <Link href="/carte" className="text-[12px] font-semibold hover:underline" style={{ color: 'var(--navy)' }}>
                  Ouvrir la carte →
                </Link>
              </div>

              <div className="relative grad-arc" style={{ height: 380 }}>
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 380" preserveAspectRatio="none">
                  <defs>
                    <pattern id="dashGr" width="20" height="20" patternUnits="userSpaceOnUse">
                      <path d="M20 0H0V20" fill="none" stroke="#1e3a5f" strokeOpacity=".05"/>
                    </pattern>
                  </defs>
                  <rect width="400" height="380" fill="url(#dashGr)"/>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg width="300" height="300" viewBox="0 0 300 300" fill="none">
                    <defs>
                      <radialGradient id="globeGrad" cx="38%" cy="34%" r="70%">
                        <stop offset="0%" stopColor="#ffffff"/>
                        <stop offset="65%" stopColor="#cfe0f5"/>
                        <stop offset="100%" stopColor="#1e3a5f" stopOpacity=".55"/>
                      </radialGradient>
                      <linearGradient id="sweepGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#1e3a5f" stopOpacity="0"/>
                        <stop offset="100%" stopColor="#1e3a5f" stopOpacity=".8"/>
                      </linearGradient>
                    </defs>
                    <circle cx="150" cy="150" r="140" fill="url(#globeGrad)" stroke="#1e3a5f" strokeOpacity=".25"/>
                    <g stroke="#1e3a5f" strokeOpacity=".18" fill="none">
                      <ellipse cx="150" cy="150" rx="140" ry="35"/>
                      <ellipse cx="150" cy="150" rx="140" ry="75"/>
                      <ellipse cx="150" cy="150" rx="140" ry="115"/>
                      <ellipse cx="150" cy="150" rx="35" ry="140"/>
                      <ellipse cx="150" cy="150" rx="75" ry="140"/>
                      <ellipse cx="150" cy="150" rx="115" ry="140"/>
                    </g>
                    <g>
                      <circle cx="105" cy="105" r="5" fill="#7f1d1d"/>
                      <circle cx="105" cy="105" r="10" fill="none" stroke="#7f1d1d" strokeOpacity=".35"/>
                      <circle cx="200" cy="138" r="5" fill="#7f1d1d"/>
                      <circle cx="200" cy="138" r="10" fill="none" stroke="#7f1d1d" strokeOpacity=".35"/>
                      <circle cx="170" cy="120" r="4" fill="#ef4444"/>
                      <circle cx="230" cy="170" r="4" fill="#ef4444"/>
                      <circle cx="80"  cy="160" r="4" fill="#ef4444"/>
                      <circle cx="180" cy="200" r="4" fill="#ef4444"/>
                      <circle cx="130" cy="190" r="3.5" fill="#f97316"/>
                      <circle cx="215" cy="100" r="3.5" fill="#f97316"/>
                      <circle cx="150" cy="225" r="3.5" fill="#f97316"/>
                      <circle cx="240" cy="200" r="3.5" fill="#f97316"/>
                      <circle cx="70"  cy="130" r="3" fill="#22c55e"/>
                      <circle cx="140" cy="80"  r="3" fill="#22c55e"/>
                      <circle cx="260" cy="150" r="3" fill="#22c55e"/>
                      <circle cx="185" cy="245" r="3" fill="#22c55e"/>
                      <circle cx="95"  cy="220" r="3" fill="#22c55e"/>
                    </g>
                    <g className="sweep" opacity=".18">
                      <path d="M150 150 L150 10 A140 140 0 0 1 290 150 Z" fill="url(#sweepGrad)"/>
                    </g>
                  </svg>
                </div>
              </div>

              <div className="px-5 py-4 border-t grid grid-cols-2 gap-3" style={{ borderColor: 'var(--line)' }}>
                <div>
                  <div className="text-[11px] uppercase font-semibold tracking-wide" style={{ color: 'var(--muted)' }}>Bassin chaud</div>
                  <div className="text-[14px] font-semibold mt-0.5">Mer Noire · Kerch</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase font-semibold tracking-wide" style={{ color: 'var(--muted)' }}>Convois actifs</div>
                  <div className="text-[14px] font-semibold mt-0.5">7 groupes</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase font-semibold tracking-wide" style={{ color: 'var(--muted)' }}>Refresh</div>
                  <div className="mono text-[13px] mt-0.5">{now} UTC</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase font-semibold tracking-wide" style={{ color: 'var(--muted)' }}>Latence flux</div>
                  <div className="mono text-[13px] mt-0.5">2.1 s</div>
                </div>
              </div>
            </div>
          </section>

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
