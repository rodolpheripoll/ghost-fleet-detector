import { useEffect, useState, useContext } from 'react'
import dynamic from 'next/dynamic'
import { supabase, ModeContext } from '../lib/supabase'
import ShipTable from '../components/ShipTable'

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false })

const RISK_PALETTE = {
  'Ghost Fleet': '#7c3aed',
  'Critical':    '#dc2626',
  'Suspect':     '#d97706',
  'Normal':      '#16a34a',
}

const CHART_LAYOUT = (title) => ({
  title:         { text: title, font: { color: '#0f172a', size: 13 } },
  paper_bgcolor: '#ffffff',
  plot_bgcolor:  '#f8fafc',
  font:          { color: '#64748b', size: 11 },
  xaxis:         { gridcolor: '#e2e8f0', zerolinecolor: '#e2e8f0' },
  yaxis:         { gridcolor: '#e2e8f0', zerolinecolor: '#e2e8f0' },
  margin:        { t: 45, b: 50, l: 55, r: 20 },
  legend:        { bgcolor: '#ffffff', bordercolor: '#e2e8f0', borderwidth: 1 },
  autosize:      true,
})

const CONF = { responsive: true, displayModeBar: false }

// Derive severity from confidence (anomalies table has no severity column)
function getSeverity(confidence) {
  const c = parseFloat(confidence ?? 0)
  if (c >= 0.9) return 'Critical'
  if (c >= 0.7) return 'High'
  if (c >= 0.5) return 'Medium'
  return 'Low'
}

const ANOM_TYPES  = ['AIS Disabled', 'MMSI Spoofing', 'Speed Anomaly', 'Fake Position', 'Name Change', 'Zone Violation', 'Course Anomaly']
const SEVERITIES  = ['Critical', 'High', 'Medium', 'Low']
const SHIP_TYPES  = ['Tanker', 'Container Ship', 'Bulk Carrier', 'Fishing Vessel', 'General Cargo', 'Passenger Ship']
const RISK_LEVELS = ['Normal', 'Suspect', 'Critical', 'Ghost Fleet']
const RADAR_TYPES = ['AIS Disabled', 'MMSI Spoofing', 'Speed Anomaly', 'Fake Position', 'Zone Violation']

export default function AnalysePage() {
  const { mode } = useContext(ModeContext)
  const [tab,        setTab]       = useState('demo')
  const [ships,      setShips]     = useState([])
  const [graphShips, setGraphShips]= useState([])
  const [anomalies,  setAnomalies] = useState([])
  const [alerts,     setAlerts]    = useState([])
  const [loading,    setLoading]   = useState(true)

  useEffect(() => { setTab(mode) }, [mode])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase.from('ships').select('*'),
      supabase.from('ships_graph').select('*'),
      supabase.from('anomalies').select('mmsi,type,confidence,detected_by,timestamp'),
      supabase.from('alerts').select('alert_id,status,severity,type'),
    ]).then(([{ data: s }, { data: g }, { data: a }, { data: al }]) => {
      setShips(s ?? [])
      setGraphShips(g ?? [])
      setAnomalies(a ?? [])
      setAlerts(al ?? [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  // ── Chart 1 — Heatmap sévérité des anomalies ──────────────────────────────
  const heatMatrix = SEVERITIES.map(sev =>
    ANOM_TYPES.map(type =>
      anomalies.filter(a => a.type === type && getSeverity(a.confidence) === sev).length
    )
  )
  const heatmapTrace = [{
    type: 'heatmap',
    x: ANOM_TYPES,
    y: SEVERITIES,
    z: heatMatrix,
    colorscale: [[0,'#fff7f7'],[0.3,'#fca5a5'],[0.7,'#ef4444'],[1,'#7f1d1d']],
    showscale: true,
    hoverongaps: false,
    hovertemplate: '<b>%{x}</b><br>Sévérité : %{y}<br>Nombre : %{z}<extra></extra>',
  }]

  // ── Chart 2 — Grouped bar type de navire vs risque ────────────────────────
  const shipTypeTraces = RISK_LEVELS.map(risk => ({
    type: 'bar',
    name: risk,
    x: SHIP_TYPES,
    y: SHIP_TYPES.map(st =>
      ships.filter(s => s.ship_type === st && s.risk_level === risk).length
    ),
    marker: { color: RISK_PALETTE[risk] },
  }))

  // ── Chart 3 — Funnel pipeline alertes ─────────────────────────────────────
  const alertCounts = { Open: 0, Investigating: 0, Closed: 0 }
  alerts.forEach(a => { if (a.status in alertCounts) alertCounts[a.status]++ })
  const totalAlerts = alerts.length
  const funnelTrace = [{
    type: 'funnel',
    y: ['Open', 'Investigating', 'Closed'],
    x: [alertCounts.Open, alertCounts.Investigating, alertCounts.Closed],
    textinfo: 'value+percent initial',
    marker: { color: ['#dc2626', '#d97706', '#16a34a'] },
    connector: { line: { color: '#e2e8f0', width: 2 } },
  }]

  // ── Chart 4 — Radar Ghost Fleet vs Normal ─────────────────────────────────
  const ghostMMSIs  = new Set(ships.filter(s => s.risk_level === 'Ghost Fleet').map(s => s.mmsi))
  const normalMMSIs = new Set(ships.filter(s => s.risk_level === 'Normal').map(s => s.mmsi))

  const calcRate = (mmsiSet) =>
    RADAR_TYPES.map(type => {
      if (!mmsiSet.size) return 0
      const uniqShips = new Set(anomalies.filter(a => a.type === type && mmsiSet.has(a.mmsi)).map(a => a.mmsi))
      return uniqShips.size / mmsiSet.size
    })

  const ghostRates  = calcRate(ghostMMSIs)
  const normalRates = calcRate(normalMMSIs)
  const theta = [...RADAR_TYPES, RADAR_TYPES[0]]
  const radarTraces = [
    {
      type: 'scatterpolar', fill: 'toself', name: 'Ghost Fleet',
      r: [...ghostRates, ghostRates[0]], theta,
      line: { color: '#7c3aed', width: 2 },
      fillcolor: 'rgba(124,58,237,0.15)',
    },
    {
      type: 'scatterpolar', fill: 'toself', name: 'Normal',
      r: [...normalRates, normalRates[0]], theta,
      line: { color: '#16a34a', width: 2 },
      fillcolor: 'rgba(22,163,74,0.15)',
    },
  ]
  const radarLayout = {
    ...CHART_LAYOUT('Profil d\'anomalies : Ghost Fleet vs Navires normaux'),
    polar: {
      radialaxis: { visible: true, range: [0, 1], tickformat: '.0%', gridcolor: '#e2e8f0' },
      angularaxis: { gridcolor: '#e2e8f0' },
      bgcolor: '#f8fafc',
    },
  }

  // ── Chart 5 — Treemap pavillons ───────────────────────────────────────────
  const flagMap = {}
  ships.forEach(s => {
    const flag  = s.flag      || 'Unknown'
    const stype = s.ship_type || 'Unknown'
    const key   = `${flag}||${stype}`
    if (!flagMap[key]) flagMap[key] = { flag, stype, count: 0, totalScore: 0 }
    flagMap[key].count++
    flagMap[key].totalScore += (s.score ?? 0)
  })

  const tmIds = ['root'], tmLabels = ['Navires'], tmParents = [''], tmValues = [0], tmColors = [0]
  const flagTotals = {}
  Object.values(flagMap).forEach(({ flag, stype, count, totalScore }) => {
    if (!flagTotals[flag]) flagTotals[flag] = { count: 0, score: 0 }
    flagTotals[flag].count += count
    flagTotals[flag].score += totalScore
  })
  Object.entries(flagTotals).forEach(([flag, { count, score }]) => {
    tmIds.push(flag); tmLabels.push(flag); tmParents.push('root')
    tmValues.push(count); tmColors.push(count > 0 ? score / count : 0)
  })
  Object.values(flagMap).forEach(({ flag, stype, count, totalScore }) => {
    const id = `${flag}/${stype}`
    tmIds.push(id); tmLabels.push(stype); tmParents.push(flag)
    tmValues.push(count); tmColors.push(count > 0 ? totalScore / count : 0)
  })
  const treemapTrace = [{
    type: 'treemap',
    ids: tmIds, labels: tmLabels, parents: tmParents, values: tmValues,
    marker: {
      colors: tmColors,
      colorscale: [[0,'#dcfce7'],[0.3,'#fef9c3'],[0.6,'#fee2e2'],[1,'#581c87']],
      showscale: true,
      colorbar: { title: 'Score moy.' },
    },
    hovertemplate: '<b>%{label}</b><br>Navires: %{value}<br>Score moy: %{color:.2f}<extra></extra>',
    branchvalues: 'total',
  }]

  // ── Chart 6 — Histogram vitesses avec seuil IMO ───────────────────────────
  const allSpeeds    = ships.filter(s => s.speed != null && s.speed > 0)
  const speedsNormal = allSpeeds.filter(s => s.speed <= 25).map(s => s.speed)
  const speedsHigh   = allSpeeds.filter(s => s.speed >  25).map(s => s.speed)
  const aboveCount   = speedsHigh.length
  const speedTraces  = [
    {
      type: 'histogram', x: speedsNormal, name: 'Vitesse normale (≤ 25 kn)',
      marker: { color: '#16a34a', opacity: 0.8 }, nbinsx: 40,
    },
    {
      type: 'histogram', x: speedsHigh, name: `Vitesse anormale (> 25 kn) — ${aboveCount} cas`,
      marker: { color: '#dc2626', opacity: 0.85 }, nbinsx: 20,
    },
  ]
  const speedLayout = {
    ...CHART_LAYOUT(`Distribution des vitesses — ${aboveCount} positions au-delà du seuil physique`),
    barmode: 'overlay',
    xaxis: { ...CHART_LAYOUT('').xaxis, title: 'Vitesse (kn)' },
    yaxis: { ...CHART_LAYOUT('').yaxis, title: 'Nombre de positions' },
    shapes: [{
      type: 'line', x0: 25, x1: 25, y0: 0, y1: 1, yref: 'paper',
      line: { color: '#dc2626', width: 2, dash: 'dash' },
    }],
    annotations: [{
      x: 26, y: 0.92, yref: 'paper', xanchor: 'left',
      text: 'Seuil IMO — Maersk Triple-E max',
      showarrow: false, font: { color: '#dc2626', size: 11 },
    }],
  }

  // ── GRAPH tab charts ──────────────────────────────────────────────────────
  const gRiskGroups = {}
  graphShips.forEach(s => {
    const rl = s.risk_level ?? 'Normal'
    if (!gRiskGroups[rl]) gRiskGroups[rl] = { mmsi: [], degree: [], score: [], iso: [], beh: [] }
    gRiskGroups[rl].mmsi.push(s.mmsi)
    gRiskGroups[rl].degree.push(s.graph_degree ?? 0)
    gRiskGroups[rl].score.push(s.score ?? 0)
    gRiskGroups[rl].iso.push(s.isolation_score ?? 0)
    gRiskGroups[rl].beh.push(s.behavior_score ?? 0)
  })
  const isoScatterTraces = Object.entries(gRiskGroups).map(([risk, d]) => ({
    type: 'scatter', mode: 'markers', name: risk,
    x: d.degree, y: d.score, text: d.mmsi,
    hovertemplate: '<b>%{text}</b><br>Voisins: %{x}<br>Score: %{y:.2f}<extra></extra>',
    marker: { color: RISK_PALETTE[risk] ?? '#6b7280', size: 7, opacity: 0.8 },
  }))
  const avgDims = ['isolation_score','behavior_score','route_sim_score','zone_score']
  const avgVals = avgDims.map(dim =>
    graphShips.length ? graphShips.reduce((s, r) => s + (r[dim] ?? 0), 0) / graphShips.length : 0
  )
  const dimBarTrace = [{
    type: 'bar',
    x: ['Isolation (35%)', 'Comportement (25%)', 'Similarité route (25%)', 'Zone (15%)'],
    y: avgVals,
    marker: { color: ['#7c3aed','#dc2626','#0ea5e9','#16a34a'] },
    hovertemplate: '<b>%{x}</b><br>Moyenne: %{y:.3f}<extra></extra>',
  }]
  const allDegrees = graphShips.map(s => s.graph_degree ?? 0)
  const degreeHistTrace = [{ type: 'histogram', x: allDegrees, marker: { color: '#7c3aed', opacity: 0.8 }, nbinsx: 20 }]
  const isoBehTraces = Object.entries(gRiskGroups).map(([risk, d]) => ({
    type: 'scatter', mode: 'markers', name: risk,
    x: d.iso, y: d.beh, text: d.mmsi,
    marker: { color: RISK_PALETTE[risk] ?? '#6b7280', size: d.score.map(s => 6 + s * 14), opacity: 0.8 },
    hovertemplate: '<b>%{text}</b><br>Isolation: %{x:.2f}<br>Comportement: %{y:.2f}<extra></extra>',
  }))

  if (loading) return (
    <main className="max-w-7xl mx-auto px-4 py-8 text-[#64748b] animate-pulse">
      Chargement des analyses...
    </main>
  )

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[#0f172a]">Analyse</h1>
        <div className="flex items-center gap-1 bg-slate-100 rounded-full p-1">
          <button onClick={() => setTab('demo')}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
              tab === 'demo' ? 'bg-[#0ea5e9] text-white shadow-sm' : 'text-[#64748b] hover:text-[#0f172a]'
            }`}>
            Analyse DEMO
          </button>
          <button onClick={() => setTab('graph')}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
              tab === 'graph' ? 'bg-[#7c3aed] text-white shadow-sm' : 'text-[#64748b] hover:text-[#0f172a]'
            }`}>
            Analyse GRAPH
          </button>
        </div>
      </div>

      {/* ── DEMO TAB ── */}
      {tab === 'demo' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">

            {/* Chart 1 — Heatmap sévérité */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <Plot
                data={heatmapTrace}
                layout={{
                  ...CHART_LAYOUT('Matrice de sévérité — Quelles anomalies sont les plus critiques ?'),
                  xaxis: { ...CHART_LAYOUT('').xaxis, tickangle: -30 },
                }}
                config={CONF} style={{ width: '100%' }}
              />
            </div>

            {/* Chart 2 — Grouped bar type navire vs risque */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <Plot
                data={shipTypeTraces}
                layout={{
                  ...CHART_LAYOUT('Les pétroliers sont-ils plus suspects que les autres ?'),
                  barmode: 'group',
                  xaxis: { ...CHART_LAYOUT('').xaxis, tickangle: -25 },
                  yaxis: { ...CHART_LAYOUT('').yaxis, title: 'Nombre de navires' },
                }}
                config={CONF} style={{ width: '100%' }}
              />
            </div>

            {/* Chart 3 — Funnel alertes */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <Plot
                data={funnelTrace}
                layout={{
                  ...CHART_LAYOUT(`Funnel d'investigation — ${alertCounts.Closed} alertes résolues sur ${totalAlerts}`),
                  funnelmode: 'stack',
                  showlegend: false,
                }}
                config={CONF} style={{ width: '100%' }}
              />
            </div>

            {/* Chart 4 — Radar Ghost Fleet vs Normal */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <Plot
                data={radarTraces}
                layout={radarLayout}
                config={CONF} style={{ width: '100%' }}
              />
            </div>

            {/* Chart 5 — Treemap pavillons */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm lg:col-span-2">
              <Plot
                data={treemapTrace}
                layout={{
                  ...CHART_LAYOUT('Pavillons à risque — Les Marshall Islands et Panama dominent'),
                  margin: { t: 45, b: 10, l: 10, r: 10 },
                  height: 380,
                }}
                config={CONF} style={{ width: '100%' }}
              />
            </div>

            {/* Chart 6 — Histogram vitesses */}
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm lg:col-span-2">
              <Plot
                data={speedTraces}
                layout={speedLayout}
                config={CONF} style={{ width: '100%' }}
              />
            </div>

          </div>
        </>
      )}

      {/* ── GRAPH TAB ── */}
      {tab === 'graph' && (
        <>
          <section className="bg-[#f5f3ff] border border-purple-200 rounded-xl p-5 mb-8 shadow-sm">
            <h2 className="text-base font-semibold text-[#7c3aed] mb-2">Scoring par théorie des graphes</h2>
            <p className="text-sm text-[#0f172a] leading-relaxed">
              Chaque navire est un nœud dans un graphe de proximité (arête = distance &lt; 20 nm).
              L&apos;<b>isolation (35%)</b> mesure le degré du nœud — un navire seul est suspect.
              La <b>similarité de route (25%)</b> compare la route du navire avec celle des navires suspects via la similarité de Jaccard (cellules 3°×3°).
              Les <b>comportements (25%)</b> agrègent les violations AIS/MMSI/vitesse (booléen par type, non cumulatif).
              Le <b>contexte géographique (15%)</b> pondère la présence en zone sanctionnée.
            </p>
          </section>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <Plot data={isoScatterTraces} layout={CHART_LAYOUT('Isolation vs Score (degré de voisinage)')} config={CONF} style={{ width: '100%' }} />
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <Plot data={dimBarTrace} layout={CHART_LAYOUT('Score moyen par dimension')} config={CONF} style={{ width: '100%' }} />
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <Plot data={degreeHistTrace} layout={CHART_LAYOUT('Distribution des voisins à 20 nm')} config={CONF} style={{ width: '100%' }} />
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <Plot data={isoBehTraces} layout={{
                ...CHART_LAYOUT('Isolation vs Comportement (taille = score)'),
                xaxis: { ...CHART_LAYOUT('').xaxis, title: 'Isolation' },
                yaxis: { ...CHART_LAYOUT('').yaxis, title: 'Comportement' },
              }} config={CONF} style={{ width: '100%' }} />
            </div>
          </div>
        </>
      )}
    </main>
  )
}
