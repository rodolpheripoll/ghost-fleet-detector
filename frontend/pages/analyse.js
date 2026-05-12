import { useEffect, useState, useContext } from 'react'
import dynamic from 'next/dynamic'
import { supabase, ModeContext } from '../lib/supabase'

const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
  loading: () => (
    <div className="animate-pulse rounded-lg" style={{ height: 260, background: 'var(--line-2)' }} />
  ),
})

const PL = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: '#fafcfe',
  font: { family: 'Manrope, sans-serif', size: 10.5, color: '#64748b' },
  margin: { t: 8, r: 12, b: 40, l: 50 },
  hoverlabel: { font: { family: 'Manrope, sans-serif' } },
}
const CFG = { displayModeBar: false, responsive: true }

const RISK_COLORS = { Normal: '#22c55e', Suspect: '#f97316', Critical: '#ef4444', 'Ghost Fleet': '#7f1d1d' }
const RISK_LEVELS = ['Ghost Fleet', 'Critical', 'Suspect', 'Normal']

const WEIGHTS = {
  'AIS Disabled': 0.30, 'MMSI Spoofing': 0.25, 'Speed Anomaly': 0.20,
  'Name Change': 0.18, 'Fake Position': 0.15, 'ML Anomaly': 0.12,
  'Zone Crossing': 0.10, 'Zone Violation': 0.10, 'Course Anomaly': 0.08,
}

function ChartCard({ title, subtitle, badge, children }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[11px] uppercase font-semibold tracking-wide" style={{ color: 'var(--muted)' }}>{subtitle}</div>
          <h3 className="text-[15px] font-bold tracking-tight mt-0.5">{title}</h3>
        </div>
        {badge && <div className="mono text-[11px]" style={{ color: 'var(--muted)' }}>{badge}</div>}
      </div>
      {children}
    </div>
  )
}

export default function Analyse() {
  const { mode }              = useContext(ModeContext)
  const [ships,   setShips]   = useState([])
  const [anomalies, setAnom]  = useState([])
  const [loading, setLoad]    = useState(true)
  const [tab, setTab]         = useState('demo')
  const [graphShips, setGS]   = useState([])
  const [graphLoad, setGL]    = useState(false)

  useEffect(() => {
    setLoad(true)
    const table = mode === 'graph' ? 'ships_graph' : 'ships'
    const sq = mode === 'graph'
      ? supabase.from(table).select('*').order('score', { ascending: false })
      : supabase.from(table).select('*').neq('flag', 'Unknown').order('score', { ascending: false })
    Promise.all([sq, supabase.from('anomalies').select('*')])
      .then(([{ data: s }, { data: a }]) => { setShips(s ?? []); setAnom(a ?? []) })
      .finally(() => setLoad(false))
  }, [mode])

  useEffect(() => {
    if (tab === 'graph' && graphShips.length === 0) {
      setGL(true)
      supabase.from('ships_graph').select('*').order('score', { ascending: false })
        .then(({ data }) => setGS(data ?? []))
        .finally(() => setGL(false))
    }
  }, [tab])

  // ── DEMO chart 1: Pie — risk level distribution ────────────────────────────
  const riskCounts = RISK_LEVELS.map(l => ships.filter(s => (s.risk_level || 'Normal') === l).length)
  const pieData = [{
    type: 'pie',
    labels: RISK_LEVELS,
    values: riskCounts,
    marker: { colors: RISK_LEVELS.map(l => RISK_COLORS[l]) },
    textinfo: 'label+percent',
    hovertemplate: '<b>%{label}</b><br>%{value} navires<br>%{percent}<extra></extra>',
    hole: 0.35,
  }]

  // ── DEMO chart 2: Horizontal bar — anomaly types by count ──────────────────
  const typeCountMap = {}
  anomalies.forEach(a => {
    if (!a.type) return
    typeCountMap[a.type] = (typeCountMap[a.type] || 0) + 1
  })
  const anomTypesSorted = Object.entries(typeCountMap).sort((a, b) => b[1] - a[1])
  const anomBarData = [{
    type: 'bar',
    orientation: 'h',
    y: anomTypesSorted.map(([t]) => t),
    x: anomTypesSorted.map(([, c]) => c),
    marker: {
      color: anomTypesSorted.map(([t]) => (WEIGHTS[t] || 0) >= 0.25 ? '#7f1d1d' : '#f97316'),
    },
    hovertemplate: '<b>%{y}</b><br>%{x} détections<extra></extra>',
  }]

  // ── DEMO chart 3: Grouped bar — severity per anomaly type ──────────────────
  const severities = ['Critical', 'High', 'Medium', 'Low']
  const sevColors  = { Critical: '#7f1d1d', High: '#ef4444', Medium: '#f97316', Low: '#eab308' }
  const topTypes   = anomTypesSorted.slice(0, 6).map(([t]) => t)
  const sevMap = {}
  anomalies.forEach(a => {
    if (!a.type || !a.severity) return
    if (!sevMap[a.type]) sevMap[a.type] = {}
    sevMap[a.type][a.severity] = (sevMap[a.type][a.severity] || 0) + 1
  })
  const sevTraces = severities.map(sev => ({
    type: 'bar',
    name: sev,
    x: topTypes,
    y: topTypes.map(t => sevMap[t]?.[sev] || 0),
    marker: { color: sevColors[sev] },
  }))

  // ── DEMO chart 4: Bar — average score by ship type ─────────────────────────
  const typeScoreMap = {}
  ships.forEach(s => {
    const t = (s.ship_type || s.type || 'Unknown').split(' ')[0]
    if (!typeScoreMap[t]) typeScoreMap[t] = []
    typeScoreMap[t].push(s.score ?? 0)
  })
  const typeAvgScores = Object.entries(typeScoreMap)
    .map(([t, scores]) => ({ type: t, avg: scores.reduce((a, b) => a + b, 0) / scores.length }))
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 10)
  const typeScoreBar = [{
    type: 'bar',
    x: typeAvgScores.map(d => d.type),
    y: typeAvgScores.map(d => +d.avg.toFixed(4)),
    marker: {
      color: typeAvgScores.map(d =>
        d.avg >= 0.68 ? '#7f1d1d' : d.avg >= 0.44 ? '#ef4444' : d.avg >= 0.19 ? '#f97316' : '#22c55e'
      ),
    },
    hovertemplate: '<b>%{x}</b><br>Score moyen: %{y:.3f}<extra></extra>',
  }]

  // ── GRAPH charts ───────────────────────────────────────────────────────────
  const gByRisk = {}
  RISK_LEVELS.forEach(l => { gByRisk[l] = graphShips.filter(s => s.risk_level === l) })

  // GRAPH chart 1: Scatter — degree vs score
  const degreeScatterTraces = RISK_LEVELS.map(l => ({
    x: gByRisk[l].map(s => s.graph_degree ?? 0),
    y: gByRisk[l].map(s => +(s.score ?? 0).toFixed(4)),
    mode: 'markers', name: l, type: 'scatter',
    marker: { color: RISK_COLORS[l], size: 6, opacity: 0.7 },
    hovertemplate: `<b>${l}</b><br>Degré: %{x}<br>Score: %{y:.3f}<extra></extra>`,
  }))

  // GRAPH chart 2: Bar — 4 dimensions averages
  const DIMS       = ['isolation_score', 'behavior_score', 'route_sim_score', 'zone_score']
  const DIM_LABELS = ['Isolation (35%)', 'Comportement (40%)', 'Route (10%)', 'Zone (15%)']
  const dimTraces  = RISK_LEVELS.map(l => ({
    x: DIM_LABELS,
    y: DIMS.map(d => {
      const vals = gByRisk[l].map(s => s[d] ?? 0)
      return vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(4) : 0
    }),
    name: l, type: 'bar', marker: { color: RISK_COLORS[l] },
  }))

  const normal  = ships.filter(s => s.risk_level === 'Normal').length
  const suspect = ships.filter(s => s.risk_level === 'Suspect').length
  const critical= ships.filter(s => s.risk_level === 'Critical').length
  const ghost   = ships.filter(s => s.risk_level === 'Ghost Fleet').length
  const legendH = { orientation: 'h', y: -0.28, font: { size: 10 } }

  return (
    <main className="px-8 py-7">
      {/* Page header */}
      <section className="flex items-end justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 text-[12px] mb-2" style={{ color: 'var(--muted)' }}>
            <span>Renseignement maritime</span>
            <span style={{ color: 'var(--line)' }}>/</span>
            <span className="font-semibold" style={{ color: 'var(--ink-2)' }}>Analyse ML</span>
          </div>
          <h1 className="text-[26px] font-bold tracking-tight" style={{ color: 'var(--ink)' }}>
            Analyse des scores et anomalies
          </h1>
          <div className="text-[13.5px] mt-1" style={{ color: 'var(--muted)' }}>
            Visualisation des sorties du moteur de détection — {ships.length.toLocaleString('fr-FR')} navires analysés.
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button className="text-[13px] font-semibold px-3.5 py-2 rounded-lg border"
            style={{ borderColor: 'var(--line)', background: 'var(--paper)' }}>Exporter PNG</button>
          <button className="text-[13px] font-semibold px-3.5 py-2 rounded-lg text-white"
            style={{ background: 'var(--navy)' }}>Recalculer</button>
        </div>
      </section>

      {/* Tabs */}
      <div className="flex items-center justify-between mb-6">
        <div className="tabbar">
          <button className={`tab${tab === 'demo' ? ' active' : ''}`} onClick={() => setTab('demo')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>
            Analyse DEMO
            <span className="badge">Isolation Forest</span>
          </button>
          <button className={`tab${tab === 'graph' ? ' active' : ''}`} onClick={() => setTab('graph')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/>
              <circle cx="18" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/>
              <path d="M8 6h8M6 8v8M18 8v8M8 18h8"/>
            </svg>
            Analyse GRAPH
            <span className="badge">Réseau de navires</span>
          </button>
        </div>
        <div className="flex items-center gap-3 text-[12px]" style={{ color: 'var(--muted)' }}>
          <span className="flex items-center gap-1.5">
            <span className="dot" style={{ background: '#22c55e', boxShadow: '0 0 0 3px rgba(34,197,94,.18)' }} />
            Modèle entraîné · v2.4.1
          </span>
          <span>·</span>
          <span className="mono">AUC 0.94 · F1 0.89</span>
        </div>
      </div>

      {loading ? (
        <div className="text-[13px] animate-pulse" style={{ color: 'var(--muted)' }}>Chargement…</div>
      ) : (
        <>
          {/* ── DEMO TAB ─────────────────────────────────────────── */}
          {tab === 'demo' && (
            <section className="grid grid-cols-2 gap-5">

              {/* Chart 1: Pie — risk level distribution */}
              <ChartCard title="Répartition des niveaux de risque" subtitle="Distribution"
                badge={`n = ${ships.length.toLocaleString('fr-FR')}`}>
                <Plot
                  data={pieData}
                  layout={{
                    ...PL,
                    margin: { t: 8, r: 12, b: 8, l: 12 },
                    showlegend: true,
                    legend: legendH,
                  }}
                  config={CFG} style={{ width: '100%', height: 260 }} useResizeHandler
                />
                <div className="grid grid-cols-4 gap-1 text-[11px] mt-2 text-center">
                  {[{ l: 'Normal', v: normal }, { l: 'Suspect', v: suspect },
                    { l: 'Critical', v: critical }, { l: 'Ghost', v: ghost }].map(({ l, v }) => (
                    <div key={l}>
                      <div style={{ color: 'var(--muted)' }}>{l}</div>
                      <div className="mono font-bold">{v.toLocaleString('fr-FR')}</div>
                    </div>
                  ))}
                </div>
              </ChartCard>

              {/* Chart 2: Horizontal bar — anomaly types by count */}
              <ChartCard title="Types d'anomalies détectées" subtitle="Anomalies"
                badge={`${anomalies.length.toLocaleString('fr-FR')} détections`}>
                <div className="text-[11px] mb-2" style={{ color: 'var(--muted)' }}>
                  <span className="dot" style={{ background: '#7f1d1d', display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} />Poids majeur (≥ 0.25)
                  <span className="dot ml-4" style={{ background: '#f97316', display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} />Poids mineur
                </div>
                <Plot
                  data={anomBarData}
                  layout={{
                    ...PL,
                    margin: { t: 8, r: 20, b: 30, l: 120 },
                    xaxis: { title: 'Nombre de détections' },
                    yaxis: { automargin: true },
                    showlegend: false,
                  }}
                  config={CFG} style={{ width: '100%', height: 260 }} useResizeHandler
                />
              </ChartCard>

              {/* Chart 3: Grouped bar — severity per anomaly type */}
              <ChartCard title="Sévérité par type d'anomalie" subtitle="Sévérité" badge="Top 6 types">
                <Plot
                  data={sevTraces}
                  layout={{
                    ...PL,
                    barmode: 'group',
                    xaxis: { tickangle: -15 },
                    yaxis: { title: 'Occurrences' },
                    showlegend: true,
                    legend: legendH,
                  }}
                  config={CFG} style={{ width: '100%', height: 260 }} useResizeHandler
                />
              </ChartCard>

              {/* Chart 4: Bar — average score by ship type */}
              <ChartCard title="Score moyen par type de navire" subtitle="Flotte" badge="Top 10 types">
                <Plot
                  data={typeScoreBar}
                  layout={{
                    ...PL,
                    xaxis: { tickangle: -20 },
                    yaxis: { title: 'Score moyen', range: [0, 1] },
                    showlegend: false,
                  }}
                  config={CFG} style={{ width: '100%', height: 260 }} useResizeHandler
                />
              </ChartCard>

            </section>
          )}

          {/* ── GRAPH TAB ───────────────────────────────────────── */}
          {tab === 'graph' && (
            graphLoad ? (
              <div className="text-[13px] animate-pulse" style={{ color: 'var(--muted)' }}>
                Chargement des données graphe…
              </div>
            ) : (
              <section className="grid grid-cols-2 gap-5">

                {/* GRAPH chart 1: Scatter — degree vs score */}
                <ChartCard
                  title="Un navire seul est un navire suspect"
                  subtitle="Degré de connexité vs score"
                  badge={`n = ${graphShips.length.toLocaleString('fr-FR')}`}>
                  <div className="text-[11px] mb-2 px-1 py-1.5 rounded-md"
                    style={{ background: '#fef9ec', color: '#92400e', border: '1px solid #fde68a' }}>
                    Degré 0 = aucun voisin à 20 nautiques — signal fort d'isolement délibéré
                  </div>
                  <Plot
                    data={degreeScatterTraces}
                    layout={{
                      ...PL,
                      xaxis: { title: 'Degré graphe (voisins à 20 nm)', zeroline: true },
                      yaxis: { title: 'Score composite', range: [0, 1] },
                      showlegend: true,
                      legend: legendH,
                    }}
                    config={CFG} style={{ width: '100%', height: 300 }} useResizeHandler
                  />
                </ChartCard>

                {/* GRAPH chart 2: Bar — 4 dimensions */}
                <ChartCard title="Dimensions moyennes par niveau de risque" subtitle="Dimensions">
                  <Plot
                    data={dimTraces}
                    layout={{
                      ...PL,
                      barmode: 'group',
                      xaxis: { tickangle: -10, automargin: true },
                      yaxis: { title: 'Score moyen', range: [0, 1] },
                      showlegend: true,
                      legend: legendH,
                    }}
                    config={CFG} style={{ width: '100%', height: 300 }} useResizeHandler
                  />
                </ChartCard>

              </section>
            )
          )}

          {/* Formula card */}
          <section className="card mt-6 p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="text-[11px] uppercase font-semibold tracking-wide" style={{ color: 'var(--muted)' }}>Méthodologie</div>
                <h2 className="text-[18px] font-bold tracking-tight">Formule de scoring — mode DEMO</h2>
                <div className="text-[13px] mt-1" style={{ color: 'var(--muted)' }}>
                  Score boolean par type : chaque type d'anomalie présent contribue son poids brut (confiance = 1), clippé à [0, 1].
                </div>
              </div>
              <button className="text-[12px] font-semibold border rounded-lg px-3 py-1.5"
                style={{ borderColor: 'var(--line)', background: 'var(--paper)' }}>Documentation →</button>
            </div>

            <div className="grid grid-cols-12 gap-6 mt-4">
              <div className="col-span-7 rounded-xl border p-5"
                style={{ background: 'linear-gradient(135deg,#f5f8fd,#eaf1fb)', borderColor: 'var(--line)' }}>
                <div className="mono text-[14px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
                  <span className="text-[15px] font-bold">score(s)</span>{' '}
                  = clip(Σ{' '}
                  <span className="font-bold" style={{ color: 'var(--navy-3)' }}>wᵢ</span>
                  {' '}· 𝟙[typeᵢ présent], 0, 1)
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 text-[12.5px]">
                  {[
                    { w: 'AIS Disabled · 0.30',  desc: 'Coupure complète du transpondeur AIS (SOLAS V)' },
                    { w: 'MMSI Spoofing · 0.25', desc: 'Usurpation d\'identité maritime (IMO Circ.289)' },
                    { w: 'Speed Anomaly · 0.20', desc: 'Vitesse physiquement impossible — manipulation AIS' },
                  ].map(({ w, desc }) => (
                    <div key={w} className="rounded-lg p-3 border" style={{ background: 'var(--paper)', borderColor: 'var(--line)' }}>
                      <div className="mono font-bold text-[11px]" style={{ color: 'var(--navy)' }}>{w}</div>
                      <div className="mt-0.5 text-[11px]" style={{ color: 'var(--muted)' }}>{desc}</div>
                    </div>
                  ))}
                </div>
                <div className="text-[12px] mt-4" style={{ color: 'var(--muted)' }}>
                  Score normalisé sur [0, 1]. Seuils calibrés sur les percentiles empiriques (p65/p90/p98) du jeu de données.
                </div>
              </div>

              <div className="col-span-5 rounded-xl border p-5" style={{ background: 'var(--paper)', borderColor: 'var(--line)' }}>
                <div className="text-[12px] uppercase font-bold tracking-wide mb-3" style={{ color: 'var(--ink-2)' }}>Seuils de classification</div>
                <div className="space-y-2.5 text-[13px]">
                  {[
                    { color: '#22c55e', label: 'Normal',      range: '0.00 ≤ s < 0.19' },
                    { color: '#f97316', label: 'Suspect',     range: '0.19 ≤ s < 0.44' },
                    { color: '#ef4444', label: 'Critical',    range: '0.44 ≤ s < 0.68' },
                    { color: '#7f1d1d', label: 'Ghost Fleet', range: '0.68 ≤ s ≤ 1.00' },
                  ].map(({ color, label, range }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <span className="dot" style={{ background: color }} /> {label}
                      </span>
                      <span className="mono">{range}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t text-[12px]" style={{ borderColor: 'var(--line)', color: 'var(--muted)' }}>
                  La bascule <span className="font-semibold mono text-[11.5px]" style={{ color: 'var(--ink)' }}>GRAPH</span> remplace le scoring boolean par un score de centralité dans le réseau de proximité (PageRank + similarité de route).
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
