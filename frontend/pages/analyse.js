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
  title:         { text: title, font: { color: '#0f172a', size: 14 } },
  paper_bgcolor: '#ffffff',
  plot_bgcolor:  '#f8fafc',
  font:          { color: '#64748b' },
  xaxis:         { gridcolor: '#e2e8f0', zerolinecolor: '#e2e8f0' },
  yaxis:         { gridcolor: '#e2e8f0', zerolinecolor: '#e2e8f0' },
  margin:        { t: 40, b: 40, l: 50, r: 20 },
  legend:        { bgcolor: '#ffffff', bordercolor: '#e2e8f0', borderwidth: 1 },
  autosize:      true,
})

const CONF = { responsive: true }

export default function AnalysePage() {
  const { mode } = useContext(ModeContext)
  const [tab,         setTab]         = useState('demo')
  const [demoShips,   setDemoShips]   = useState([])
  const [graphShips,  setGraphShips]  = useState([])
  const [anomalies,   setAnomalies]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [filter,      setFilter]      = useState('')
  const [typeFilter,  setTypeFilter]  = useState('all')

  // Sync tab with global mode
  useEffect(() => { setTab(mode) }, [mode])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase.from('ships').select('*'),
      supabase.from('ships_graph').select('*'),
      supabase.from('anomalies').select('*').order('timestamp', { ascending: true }),
    ]).then(([{ data: s }, { data: g }, { data: a }]) => {
      setDemoShips(s ?? [])
      setGraphShips(g ?? [])
      setAnomalies(a ?? [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  // ── DEMO charts ─────────────────────────────────────────────────────────────
  const riskGroups = {}
  demoShips.forEach(s => {
    const rl = s.risk_level ?? 'Normal'
    if (!riskGroups[rl]) riskGroups[rl] = { mmsi: [], speed: [], score: [] }
    riskGroups[rl].mmsi.push(s.mmsi)
    riskGroups[rl].speed.push(s.speed ?? 0)
    riskGroups[rl].score.push(s.score ?? 0)
  })
  const scatterTraces = Object.entries(riskGroups).map(([risk, d]) => ({
    type: 'scatter', mode: 'markers', name: risk,
    x: d.speed, y: d.score, text: d.mmsi,
    hovertemplate: '<b>%{text}</b><br>Vitesse: %{x} kn<br>Score: %{y:.2f}<extra></extra>',
    marker: { color: RISK_PALETTE[risk] ?? '#6b7280', size: 8, opacity: 0.85 },
  }))

  const typeCounts = {}
  anomalies.forEach(a => { typeCounts[a.type] = (typeCounts[a.type] ?? 0) + 1 })
  const barTrace = [{
    type: 'bar', x: Object.keys(typeCounts), y: Object.values(typeCounts),
    marker: { color: '#3b82f6' },
    hovertemplate: '<b>%{x}</b><br>%{y} anomalie(s)<extra></extra>',
  }]

  const byDay = {}
  anomalies.forEach(a => {
    if (!a.timestamp) return
    const day = a.timestamp.slice(0, 10)
    byDay[day] = (byDay[day] ?? 0) + 1
  })
  const sortedDays = Object.keys(byDay).sort()
  const lineTrace = [{
    type: 'scatter', mode: 'lines+markers',
    x: sortedDays, y: sortedDays.map(d => byDay[d]),
    line: { color: '#8b5cf6', width: 2 }, marker: { color: '#8b5cf6' },
  }]

  const riskCounts = {}
  demoShips.forEach(s => { const rl = s.risk_level ?? 'Normal'; riskCounts[rl] = (riskCounts[rl] ?? 0) + 1 })
  const pieTrace = [{
    type: 'pie', labels: Object.keys(riskCounts), values: Object.values(riskCounts),
    marker: { colors: Object.keys(riskCounts).map(r => RISK_PALETTE[r] ?? '#6b7280') },
    textinfo: 'label+percent',
  }]

  const top10demo = [...demoShips].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 10)
  const hbarTrace = [{
    type: 'bar', orientation: 'h',
    y: top10demo.map(s => s.mmsi), x: top10demo.map(s => s.score ?? 0),
    marker: { color: top10demo.map(s => RISK_PALETTE[s.risk_level] ?? '#6b7280') },
  }]

  // ── GRAPH charts ─────────────────────────────────────────────────────────────
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

  // Chart 1: Isolation vs Score (scatter degree vs score)
  const isoScatterTraces = Object.entries(gRiskGroups).map(([risk, d]) => ({
    type: 'scatter', mode: 'markers', name: risk,
    x: d.degree, y: d.score, text: d.mmsi,
    hovertemplate: '<b>%{text}</b><br>Voisins: %{x}<br>Score: %{y:.2f}<extra></extra>',
    marker: { color: RISK_PALETTE[risk] ?? '#6b7280', size: 7, opacity: 0.8 },
  }))

  // Chart 2: Average dimension scores
  const avgDims = ['isolation_score', 'behavior_score', 'route_sim_score', 'zone_score']
  const avgVals = avgDims.map(dim =>
    graphShips.length
      ? graphShips.reduce((sum, s) => sum + (s[dim] ?? 0), 0) / graphShips.length
      : 0
  )
  const dimBarTrace = [{
    type: 'bar',
    x: ['Isolation (35%)', 'Comportement (25%)', 'Similarité route (25%)', 'Zone (15%)'],
    y: avgVals,
    marker: { color: ['#7c3aed', '#dc2626', '#0ea5e9', '#16a34a'] },
    hovertemplate: '<b>%{x}</b><br>Moyenne: %{y:.3f}<extra></extra>',
  }]

  // Chart 3: Degree distribution histogram
  const allDegrees = graphShips.map(s => s.graph_degree ?? 0)
  const degreeHistTrace = [{
    type: 'histogram', x: allDegrees,
    marker: { color: '#7c3aed', opacity: 0.8 },
    nbinsx: 20,
  }]

  // Chart 4: isolation vs behavior scatter
  const isoBehTraces = Object.entries(gRiskGroups).map(([risk, d]) => ({
    type: 'scatter', mode: 'markers', name: risk,
    x: d.iso, y: d.beh, text: d.mmsi,
    marker: {
      color: RISK_PALETTE[risk] ?? '#6b7280',
      size: d.score.map(s => 6 + s * 14),
      opacity: 0.8,
    },
    hovertemplate: '<b>%{text}</b><br>Isolation: %{x:.2f}<br>Comportement: %{y:.2f}<extra></extra>',
  }))

  const anomTypes  = ['all', ...new Set(anomalies.map(a => a.type))]
  const filteredAnom = anomalies.filter(a => {
    const matchMmsi = !filter || String(a.mmsi).toLowerCase().includes(filter.toLowerCase())
    const matchType = typeFilter === 'all' || a.type === typeFilter
    return matchMmsi && matchType
  })

  const anomColumns = [
    { key: 'mmsi',        label: 'MMSI' },
    { key: 'type',        label: 'Type' },
    { key: 'description', label: 'Description', render: v => <span className="text-xs text-[#64748b]">{v}</span> },
    { key: 'confidence',  label: 'Confiance',   render: v => <span className={`text-xs font-bold ${parseFloat(v) >= 0.85 ? 'text-[#dc2626]' : 'text-[#d97706]'}`}>{(parseFloat(v ?? 0) * 100).toFixed(0)}%</span> },
    { key: 'detected_by', label: 'Méthode',     render: v => <span className={`px-2 py-0.5 rounded text-xs ${v === 'isolation_forest' ? 'bg-[#ede9fe] text-[#7c3aed]' : v === 'both' ? 'bg-[#fee2e2] text-[#dc2626]' : 'bg-[#dbeafe] text-[#1d4ed8]'}`}>{v}</span> },
    { key: 'timestamp',   label: 'Timestamp',   render: v => v ? new Date(v).toLocaleString('fr-FR') : 'N/A' },
  ]

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
          <button
            onClick={() => setTab('demo')}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
              tab === 'demo' ? 'bg-[#0ea5e9] text-white shadow-sm' : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            Analyse DEMO
          </button>
          <button
            onClick={() => setTab('graph')}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
              tab === 'graph' ? 'bg-[#7c3aed] text-white shadow-sm' : 'text-[#64748b] hover:text-[#0f172a]'
            }`}
          >
            Analyse GRAPH
          </button>
        </div>
      </div>

      {/* ── DEMO TAB ── */}
      {tab === 'demo' && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <Plot data={scatterTraces} layout={CHART_LAYOUT('Vitesse vs Score de suspicion')} config={CONF} style={{ width: '100%' }} />
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <Plot data={barTrace} layout={CHART_LAYOUT('Anomalies par type')} config={CONF} style={{ width: '100%' }} />
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <Plot data={lineTrace} layout={CHART_LAYOUT('Anomalies détectées par jour')} config={CONF} style={{ width: '100%' }} />
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <Plot data={pieTrace} layout={{ ...CHART_LAYOUT('Répartition par niveau de risque'), showlegend: true }} config={CONF} style={{ width: '100%' }} />
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm lg:col-span-2">
              <Plot data={hbarTrace} layout={{ ...CHART_LAYOUT('Top 10 navires par score'), yaxis: { ...CHART_LAYOUT('').yaxis, autorange: 'reversed' } }} config={CONF} style={{ width: '100%' }} />
            </div>
          </div>

          <section className="bg-white border border-slate-200 rounded-xl p-6 mb-8 shadow-sm">
            <h2 className="text-lg font-semibold text-[#0f172a] mb-4">Méthodologie de détection</h2>
            <div className="space-y-4 text-sm text-[#0f172a]">
              <div>
                <h3 className="text-[#0ea5e9] font-semibold mb-1">Isolation Forest (ML)</h3>
                <p>L&apos;Isolation Forest isole les anomalies en partitionnant aléatoirement l&apos;espace des caractéristiques. Paramètre <code className="bg-slate-100 px-1 rounded">contamination=0.05</code> (5% de navires suspects).</p>
              </div>
              <div>
                <h3 className="text-[#0ea5e9] font-semibold mb-1">Score composite</h3>
                <pre className="bg-slate-50 border border-slate-200 rounded p-3 text-xs overflow-x-auto">{`score = max_confidence_per_type × weight_per_type`}</pre>
              </div>
            </div>
          </section>

          <section>
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <h2 className="text-lg font-semibold text-[#0f172a]">Tableau des anomalies</h2>
              <input type="text" placeholder="Filtrer par MMSI..." value={filter} onChange={e => setFilter(e.target.value)}
                className="bg-white border border-slate-300 text-[#0f172a] rounded px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]" />
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                className="bg-white border border-slate-300 text-[#0f172a] rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]">
                {anomTypes.map(t => <option key={t} value={t}>{t === 'all' ? 'Tous les types' : t}</option>)}
              </select>
              <span className="text-[#64748b] text-xs">{filteredAnom.length} anomalie(s)</span>
            </div>
            <ShipTable ships={filteredAnom} columns={anomColumns} />
          </section>
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
              La <b>similarité de route (25%)</b> compare la route du navire avec celle des navires suspects connus via la similarité de Jaccard (cellules 3°×3°).
              Les <b>comportements (25%)</b> agrègent les violations AIS/MMSI/vitesse (booléen par type, non cumulatif).
              Le <b>contexte géographique (15%)</b> pondère la présence en zone sanctionnée.
            </p>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <Plot data={isoScatterTraces}
                layout={CHART_LAYOUT('Isolation vs Score (degré de voisinage)')}
                config={CONF} style={{ width: '100%' }} />
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <Plot data={dimBarTrace}
                layout={CHART_LAYOUT('Score moyen par dimension')}
                config={CONF} style={{ width: '100%' }} />
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <Plot data={degreeHistTrace}
                layout={CHART_LAYOUT('Distribution des voisins à 20 nm')}
                config={CONF} style={{ width: '100%' }} />
            </div>
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
              <Plot data={isoBehTraces}
                layout={{
                  ...CHART_LAYOUT('Isolation vs Comportement (taille = score)'),
                  xaxis: { ...CHART_LAYOUT('').xaxis, title: 'Isolation' },
                  yaxis: { ...CHART_LAYOUT('').yaxis, title: 'Comportement' },
                }}
                config={CONF} style={{ width: '100%' }} />
            </div>
          </div>
        </>
      )}
    </main>
  )
}
