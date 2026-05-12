import { useEffect, useState, useContext } from 'react'
import Link from 'next/link'
import { supabase, ModeContext } from '../lib/supabase'
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

function KPI({ title, value, sub, icon, color }) {
  return (
    <div className="card p-5 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase font-semibold tracking-wide" style={{ color: 'var(--muted)' }}>{title}</div>
        {icon}
      </div>
      <div className="mono text-[28px] font-extrabold mt-0.5" style={{ color: color || 'var(--ink)' }}>{value}</div>
      <div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>{sub}</div>
    </div>
  )
}

export default function Dashboard() {
  const { mode }                    = useContext(ModeContext)
  const [ships,    setShips]        = useState([])
  const [anomalies,setAnom]         = useState([])
  const [openAlerts, setAlerts]     = useState(0)
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
      : supabase.from(table).select('*').order('score', { ascending: false })

    Promise.all([
      shipsQ,
      mode === 'demo'
        ? supabase.from('anomalies').select('*')
        : Promise.resolve({ data: [], error: null }),
      supabase.from('alerts').select('status', { count: 'exact', head: true }).eq('status', 'Open'),
    ]).then(([{ data: s }, { data: a }, { count: c }]) => {
      setShips(s ?? [])
      setAnom(a ?? [])
      setAlerts(c ?? 0)
    }).finally(() => setLoad(false))
  }, [mode])

  const sorted     = sortShips(ships, sortField, sortDir)
  const top10      = sorted.slice(0, 10)
  const ghostCount = ships.filter(s => (s.score ?? 0) >= 0.68).length
  const critical   = ships.filter(s => (s.score ?? 0) >= 0.44).length
  const suspicious = ships.filter(s => (s.score ?? 0) >= 0.19).length
  const fakeShips  = ships.filter(s => String(s.mmsi).startsWith('FAKE-')).length

  const anomByMmsi = {}
  anomalies.forEach(a => {
    if (!anomByMmsi[a.mmsi]) anomByMmsi[a.mmsi] = []
    anomByMmsi[a.mmsi].push(a)
  })

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
          <Link href="/rapport">
            <button className="text-[13px] font-semibold px-3.5 py-2 rounded-lg text-white hover:bg-[var(--navy-2)]"
              style={{ background: 'var(--navy)' }}>
              Exporter le rapport
            </button>
          </Link>
        </div>
      </section>

      {loading ? (
        <div className="text-[13px] animate-pulse" style={{ color: 'var(--muted)' }}>Chargement des données…</div>
      ) : (
        <>
          {/* KPI Row 1 */}
          <section className="grid grid-cols-3 gap-5 mb-4">
            <KPI
              title="Navires analysés"
              value={ships.length.toLocaleString('fr-FR')}
              sub="couverture AIS 96.4%"
              icon={<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#1e3a5f" strokeWidth="1.8"><path d="M3 17h18M5 17l-2-5h18l-2 5M7 12V8h10v4"/><path d="M12 8V4"/></svg>}
            />
            <KPI
              title="Flotte fantôme suspectée"
              value={ghostCount.toLocaleString('fr-FR')}
              sub={`score ≥ 0.68 · ${critical - ghostCount} Critical en plus`}
              color="#7f1d1d"
              icon={<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#7f1d1d" strokeWidth="1.8"><path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>}
            />
            <KPI
              title="Navires Critical"
              value={critical.toLocaleString('fr-FR')}
              sub={`score ≥ 0.44 · ${suspicious - critical} Suspect`}
              color="#ef4444"
              icon={<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#ef4444" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/></svg>}
            />
          </section>

          {/* KPI Row 2 */}
          <section className="grid grid-cols-3 gap-5 mb-6">
            <KPI
              title="Navires FAKE-MMSI"
              value={fakeShips.toLocaleString('fr-FR')}
              sub="MMSI commençant par FAKE-"
              color="#a855f7"
              icon={<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#a855f7" strokeWidth="1.8"><path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><path d="M12 9v4M12 17h.01"/></svg>}
            />
            <KPI
              title="Anomalies détectées"
              value={anomalies.length.toLocaleString('fr-FR')}
              sub="tous types · mode DEMO"
              color="#f97316"
              icon={<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#f97316" strokeWidth="1.8"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>}
            />
            <KPI
              title="Alertes ouvertes"
              value={openAlerts.toLocaleString('fr-FR')}
              sub="statut Open · toutes sévérités"
              color="#ef4444"
              icon={<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#ef4444" strokeWidth="1.8"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9Z"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>}
            />
          </section>

          {/* Table — full width */}
          <section className="card overflow-hidden">
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
              style={{ gridTemplateColumns: '40px 150px 1fr 110px 130px 1fr 60px', background: '#fafcfe', borderColor: 'var(--line)', color: 'var(--muted)' }}>
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
                const isFake = String(ship.mmsi).startsWith('FAKE-')
                return (
                  <div key={ship.mmsi}
                    className="grid px-5 py-3 items-center row-hover border-b"
                    style={{ gridTemplateColumns: '40px 150px 1fr 110px 130px 1fr 60px', borderColor: 'var(--line-2)' }}>
                    <div className="mono text-[12px]" style={{ color: 'var(--muted)' }}>
                      {String(i + 1).padStart(2, '0')}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="mono text-[12.5px] font-semibold truncate">{ship.mmsi}</span>
                      {isFake && (
                        <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-md text-white shrink-0"
                          style={{ background: '#a855f7' }}>FAKE</span>
                      )}
                    </div>
                    <div>
                      <div className="text-[13.5px] font-semibold">{ship.ship_name || ship.name || 'INCONNU'}</div>
                      <div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>
                        {ship.flag} · {ship.type || 'N/A'}{ship.length ? ` · ${ship.length} m` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="meter w-14">
                        <div style={{ width: `${Math.round(score * 100)}%`, background: isFake ? '#a855f7' : color }} />
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
                <span className="flex items-center gap-1.5"><span className="dot" style={{ background: '#a855f7' }} /> FAKE-MMSI</span>
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
