import { useEffect, useState, useContext } from 'react'
import dynamic from 'next/dynamic'
import { supabase, ModeContext } from '../lib/supabase'

const Plot = dynamic(() => import('react-plotly.js'), {
  ssr: false,
  loading: () => (
    <div className="animate-pulse rounded-lg" style={{ height: 220, background: 'var(--line-2)' }} />
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

  // ── DEMO chart computations ────────────────────────────────────────────────

  // Chart 1: Score histogram by risk level
  const histTraces = RISK_LEVELS.map(l => ({
    x: ships.filter(s => (s.risk_level || 'Normal') === l).map(s => +(s.score ?? 0).toFixed(4)),
    name: l,
    type: 'histogram',
    autobinx: false,
    xbins: { start: 0, end: 1.0, size: 0.05 },
    marker: { color: RISK_COLORS[l], opacity: 0.85 },
    hovertemplate: `<b>${l}</b><br>Score: %{x}<br>Navires: %{y}<extra></extra>`,
  }))

  // Chart 2: Anomaly types — distinct ships per type
  const typeShipMap = {}
  anomalies.forEach(a => {
    if (!a.type || !a.mmsi) return
    if (!typeShipMap[a.type]) typeShipMap[a.type] = new Set()
    typeShipMap[a.type].add(a.mmsi)
  })
  const anomTypes = Object.entries(typeShipMap).sort((a, b) => b[1].size - a[1].size)

  // Chart 3: Ship type vs risk level (stacked bar)
  const typeRiskMap = {}
  ships.forEach(s => {
    const t = (s.ship_type || s.type || 'Unknown').split(' ')[0]
    const l = s.risk_level || 'Normal'
    if (!typeRiskMap[t]) typeRiskMap[t] = {}
    typeRiskMap[t][l] = (typeRiskMap[t][l] || 0) + 1
  })
  const shipTypes = Object.keys(typeRiskMap)
    .sort((a, b) =>
      Object.values(typeRiskMap[b]).reduce((s, v) => s + v, 0) -
      Object.values(typeRiskMap[a]).reduce((s, v) => s + v, 0)
    ).slice(0, 8)
  const typeRiskTraces = RISK_LEVELS.map(l => ({
    x: shipTypes,
    y: shipTypes.map(t => typeRiskMap[t]?.[l] || 0),
    name: l,
    type: 'bar',
    marker: { color: RISK_COLORS[l] },
  }))

  // Chart 4: Detection funnel
  const funnelData = [{
    type: 'funnel',
    y: ['Navires analysés', 'Avec anomalies', 'Suspect', 'Critical', 'Ghost Fleet'],
    x: [
      ships.length,
      ships.filter(s => (s.score ?? 0) > 0).length,
      ships.filter(s => s.risk_level === 'Suspect').length,
      ships.filter(s => s.risk_level === 'Critical').length,
      ships.filter(s => s.risk_level === 'Ghost Fleet').length,
    ],
    textinfo: 'value+percent total',
    textposition: 'inside',
    marker: { color: ['#3a6aa8', '#264a78', '#f97316', '#ef4444', '#7f1d1d'] },
    connector: { line: { color: '#e2e8f0', width: 1 } },
  }]

  // Chart 5: Radar Ghost Fleet vs Normal
  const mmsiByType = {}
  anomalies.forEach(a => {
    if (!mmsiByType[a.type]) mmsiByType[a.type] = new Set()
    mmsiByType[a.type].add(a.mmsi)
  })
  function pctType(shipList, anomType) {
    if (!shipList.length) return 0
    const mmsis = new Set(shipList.map(s => s.mmsi))
    return [...(mmsiByType[anomType] || [])].filter(m => mmsis.has(m)).length / shipList.length
  }
  const ghostShips  = ships.filter(s => s.risk_level === 'Ghost Fleet')
  const normalShips = ships.filter(s => s.risk_level === 'Normal')
  const radarTheta  = ['Score', 'AIS Off', 'MMSI Spoof', 'Vitesse', 'Fake Pos.', 'Score']
  function radarR(list) {
    const avg = list.length ? list.reduce((s, v) => s + (v.score ?? 0), 0) / list.length : 0
    return [avg, pctType(list, 'AIS Disabled'), pctType(list, 'MMSI Spoofing'),
            pctType(list, 'Speed Anomaly'), pctType(list, 'Fake Position'), avg]
  }
  const radarTraces = [
    { type: 'scatterpolar', r: radarR(ghostShips),  theta: radarTheta, fill: 'toself',
      name: 'Ghost Fleet', line: { color: '#7f1d1d', width: 2 }, fillcolor: 'rgba(127,29,29,0.18)' },
    { type: 'scatterpolar', r: radarR(normalShips), theta: radarTheta, fill: 'toself',
      name: 'Normal',      line: { color: '#22c55e', width: 2 }, fillcolor: 'rgba(34,197,94,0.18)' },
  ]

  // Chart 6: Flag treemap
  const flagMap = {}
  ships.forEach(s => {
    const f = s.flag || 'Unknown'
    if (!flagMap[f]) flagMap[f] = { count: 0, nonNormal: 0 }
    flagMap[f].count++
    if ((s.risk_level || 'Normal') !== 'Normal') flagMap[f].nonNormal++
  })
  const topFlags = Object.entries(flagMap).sort((a, b) => b[1].count - a[1].count).slice(0, 14)
  const treemapData = [{
    type: 'treemap',
    labels: ['Pavillons', ...topFlags.map(([f]) => f)],
    parents: ['',          ...topFlags.map(() => 'Pavillons')],
    values:  [topFlags.reduce((s, [, d]) => s + d.count, 0), ...topFlags.map(([, d]) => d.count)],
    marker: {
      colors: ['#dbeafe', ...topFlags.map(([, d]) => {
        const r = d.count ? d.nonNormal / d.count : 0
        if (r >= 0.35) return '#7f1d1d'
        if (r >= 0.20) return '#ef4444'
        if (r >= 0.08) return '#f97316'
        return '#22c55e'
      })],
    },
    textinfo: 'label+value',
    hovertemplate: '<b>%{label}</b><br>Navires: %{value}<extra></extra>',
  }]

  // ── GRAPH chart computations ───────────────────────────────────────────────
  const gByRisk = {}
  RISK_LEVELS.forEach(l => { gByRisk[l] = graphShips.filter(s => s.risk_level === l) })

  const g1Traces = RISK_LEVELS.map(l => ({
    x: gByRisk[l].map(s => +(s.isolation_score ?? 0).toFixed(4)),
    y: gByRisk[l].map(s => +(s.score ?? 0).toFixed(4)),
    mode: 'markers', name: l, type: 'scatter',
    marker: { color: RISK_COLORS[l], size: 5, opacity: 0.65 },
    hovertemplate: `<b>${l}</b><br>Isolation: %{x:.3f}<br>Score: %{y:.3f}<extra></extra>`,
  }))

  const DIMS       = ['isolation_score', 'behavior_score', 'route_sim_score', 'zone_score']
  const DIM_LABELS = ['Isolation',       'Comportement',   'Route',           'Zone']
  const g2Traces   = RISK_LEVELS.map(l => ({
    x: DIM_LABELS,
    y: DIMS.map(d => {
      const vals = gByRisk[l].map(s => s[d] ?? 0)
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
    }),
    name: l, type: 'bar', marker: { color: RISK_COLORS[l] },
  }))

  const g3Traces = RISK_LEVELS.map(l => ({
    x: gByRisk[l].map(s => s.graph_degree ?? 0),
    name: l, type: 'histogram',
    marker: { color: RISK_COLORS[l], opacity: 0.8 },
    hovertemplate: `<b>${l}</b><br>Degré: %{x}<br>Navires: %{y}<extra></extra>`,
  }))

  const g4Traces = RISK_LEVELS.map(l => ({
    x: gByRisk[l].map(s => +(s.isolation_score ?? 0).toFixed(4)),
    y: gByRisk[l].map(s => +(s.behavior_score  ?? 0).toFixed(4)),
    mode: 'markers', name: l, type: 'scatter',
    marker: { color: RISK_COLORS[l], size: 5, opacity: 0.65 },
    hovertemplate: `<b>${l}</b><br>Isolation: %{x:.3f}<br>Comportement: %{y:.3f}<extra></extra>`,
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
          <div className="flex items-center gap-1.5 text-[12px] rounded-lg px-2.5 py-1.5 border"
            style={{ background: 'var(--paper)', borderColor: 'var(--line)' }}>
            <span style={{ color: 'var(--muted)' }}>Période</span>
            <span className="font-semibold">24 h</span>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
          </div>
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
          {/* ── DEMO TAB ───────────────────────────────────────────────── */}
          {tab === 'demo' && (
            <section className="grid grid-cols-3 gap-5">

              <ChartCard title="Distribution des scores" subtitle="Distribution"
                badge={`n = ${ships.length.toLocaleString('fr-FR')}`}>
                <Plot
                  data={histTraces}
                  layout={{ ...PL, barmode: 'stack',
                    xaxis: { title: 'Score d\'anomalie', range: [0, 1] },
                    yaxis: { title: 'Navires' },
                    showlegend: true, legend: legendH }}
                  config={CFG} style={{ width: '100%', height: 210 }} useResizeHandler
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

              <ChartCard title="Types d'anomalies détectées" subtitle="Anomalies"
                badge={`${anomalies.length.toLocaleString('fr-FR')} détections`}>
                <Plot
                  data={[{
                    x: anomTypes.map(([t]) => t),
                    y: anomTypes.map(([, s]) => s.size),
                    type: 'bar',
                    marker: {
                      color: anomTypes.map(([t]) => {
                        if (t === 'AIS Disabled' || t === 'MMSI Spoofing') return '#7f1d1d'
                        if (t === 'Speed Anomaly' || t === 'Name Change')   return '#ef4444'
                        if (t === 'Zone Crossing' || t === 'Zone Violation') return '#f97316'
                        return '#3a6aa8'
                      }),
                    },
                    hovertemplate: '<b>%{x}</b><br>Navires affectés: %{y}<extra></extra>',
                  }]}
                  layout={{ ...PL,
                    xaxis: { tickangle: -20 },
                    yaxis: { title: 'Navires affectés' } }}
                  config={CFG} style={{ width: '100%', height: 250 }} useResizeHandler
                />
              </ChartCard>

              <ChartCard title="Types de navires vs risque" subtitle="Flotte" badge="Top 8 types">
                <Plot
                  data={typeRiskTraces}
                  layout={{ ...PL, barmode: 'stack',
                    xaxis: { tickangle: -15 },
                    yaxis: { title: 'Navires' },
                    showlegend: true, legend: legendH }}
                  config={CFG} style={{ width: '100%', height: 250 }} useResizeHandler
                />
              </ChartCard>

              <ChartCard title="Entonnoir de détection" subtitle="Pipeline"
                badge="Navires → alertes">
                <Plot
                  data={funnelData}
                  layout={{ ...PL,
                    margin: { t: 8, r: 60, b: 8, l: 140 } }}
                  config={CFG} style={{ width: '100%', height: 250 }} useResizeHandler
                />
              </ChartCard>

              <ChartCard title="Ghost Fleet vs Normal — radar" subtitle="Profil de risque">
                <Plot
                  data={radarTraces}
                  layout={{
                    ...PL,
                    margin: { t: 20, r: 30, b: 40, l: 30 },
                    polar: { radialaxis: { visible: true, range: [0, 1], tickfont: { size: 9 } } },
                    showlegend: true, legend: legendH,
                  }}
                  config={CFG} style={{ width: '100%', height: 250 }} useResizeHandler
                />
              </ChartCard>

              <ChartCard title="Pavillons — carte de risque" subtitle="Pavillons" badge="Top 14">
                <Plot
                  data={treemapData}
                  layout={{ ...PL, margin: { t: 8, r: 8, b: 8, l: 8 } }}
                  config={CFG} style={{ width: '100%', height: 250 }} useResizeHandler
                />
              </ChartCard>

            </section>
          )}

          {/* ── GRAPH TAB ──────────────────────────────────────────────── */}
          {tab === 'graph' && (
            graphLoad ? (
              <div className="text-[13px] animate-pulse" style={{ color: 'var(--muted)' }}>
                Chargement des données graphe…
              </div>
            ) : (
              <section className="grid grid-cols-2 gap-5">

                <ChartCard title="Score isolation vs score final" subtitle="Corrélation"
                  badge={`n = ${graphShips.length.toLocaleString('fr-FR')}`}>
                  <Plot
                    data={g1Traces}
                    layout={{ ...PL,
                      xaxis: { title: 'Score isolation', range: [0, 1] },
                      yaxis: { title: 'Score final',     range: [0, 1] },
                      showlegend: true, legend: legendH }}
                    config={CFG} style={{ width: '100%', height: 280 }} useResizeHandler
                  />
                </ChartCard>

                <ChartCard title="Dimensions moyennes par niveau" subtitle="Dimensions">
                  <Plot
                    data={g2Traces}
                    layout={{ ...PL, barmode: 'group',
                      yaxis: { title: 'Score moyen', range: [0, 1] },
                      showlegend: true, legend: legendH }}
                    config={CFG} style={{ width: '100%', height: 280 }} useResizeHandler
                  />
                </ChartCard>

                <ChartCard title="Distribution des degrés de connexité" subtitle="Graphe">
                  <Plot
                    data={g3Traces}
                    layout={{ ...PL, barmode: 'stack',
                      xaxis: { title: 'Degré (connexions)' },
                      yaxis: { title: 'Navires' },
                      showlegend: true, legend: legendH }}
                    config={CFG} style={{ width: '100%', height: 280 }} useResizeHandler
                  />
                </ChartCard>

                <ChartCard title="Isolation vs score comportemental" subtitle="Corrélation">
                  <Plot
                    data={g4Traces}
                    layout={{ ...PL,
                      xaxis: { title: 'Score isolation',      range: [0, 1] },
                      yaxis: { title: 'Score comportemental', range: [0, 1] },
                      showlegend: true, legend: legendH }}
                    config={CFG} style={{ width: '100%', height: 280 }} useResizeHandler
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
