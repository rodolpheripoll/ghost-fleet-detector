import { useEffect, useState, useContext } from 'react'
import dynamic from 'next/dynamic'
import { supabase, ModeContext } from '../lib/supabase'
import { useAisStream } from '../lib/useAisStream'
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

export default function AnalysePage() {
  const { mode }         = useContext(ModeContext)
  const [demoShips,      setDemoShips]     = useState([])
  const [anomalies,      setAnomalies]     = useState([])
  const [demoLoading,    setDemoLoading]   = useState(true)
  const [filter,         setFilter]        = useState('')
  const [typeFilter,     setTypeFilter]    = useState('all')

  const { ships: liveShips, status: liveStatus } = useAisStream(mode === 'live')

  useEffect(() => {
    if (mode !== 'demo') return
    setDemoLoading(true)
    Promise.all([
      supabase.from('ships').select('*'),
      supabase.from('anomalies').select('*').order('timestamp', { ascending: true }),
    ]).then(([{ data: s }, { data: a }]) => {
      setDemoShips(s ?? [])
      setAnomalies(a ?? [])
    }).catch(console.error).finally(() => setDemoLoading(false))
  }, [mode])

  const ships   = mode === 'live' ? liveShips : demoShips
  const loading = mode === 'live' ? liveStatus === 'connecting' : demoLoading

  // ── Chart data ────────────────────────────────────────────────────────────
  const riskGroups = {}
  ships.forEach(s => {
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
  ships.forEach(s => { const rl = s.risk_level ?? 'Normal'; riskCounts[rl] = (riskCounts[rl] ?? 0) + 1 })
  const pieTrace = [{
    type: 'pie', labels: Object.keys(riskCounts), values: Object.values(riskCounts),
    marker: { colors: Object.keys(riskCounts).map(r => RISK_PALETTE[r] ?? '#6b7280') },
    textinfo: 'label+percent',
  }]

  const top10 = [...ships].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 10)
  const hbarTrace = [{
    type: 'bar', orientation: 'h',
    y: top10.map(s => s.mmsi), x: top10.map(s => s.score ?? 0),
    marker: { color: top10.map(s => RISK_PALETTE[s.risk_level] ?? '#6b7280') },
  }]

  const anomTypes = ['all', ...new Set(anomalies.map(a => a.type))]
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

  const CONF = { responsive: true }

  if (loading) return (
    <main className="max-w-7xl mx-auto px-4 py-8 text-[#64748b] animate-pulse">
      {mode === 'live' ? 'Connexion à aisstream.io...' : 'Chargement des analyses...'}
    </main>
  )

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-[#0f172a]">Analyse ML — Isolation Forest</h1>
        {mode === 'live' && (
          <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-1 rounded-full">
            Données temps réel — {ships.length} navires
          </span>
        )}
      </div>

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

      {/* Methodology */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 mb-8 shadow-sm">
        <h2 className="text-lg font-semibold text-[#0f172a] mb-4">Méthodologie de détection</h2>
        <div className="space-y-4 text-sm text-[#0f172a]">
          <div>
            <h3 className="text-[#0ea5e9] font-semibold mb-1">Isolation Forest (ML)</h3>
            <p>L&apos;Isolation Forest isole les anomalies en partitionnant aléatoirement l&apos;espace des caractéristiques. Le paramètre <code className="bg-slate-100 px-1 rounded">contamination=0.05</code> reflète le taux estimé de 5% de navires fantômes (source : Windward Maritime AI Annual Report 2022).</p>
          </div>
          <div>
            <h3 className="text-[#0ea5e9] font-semibold mb-1">Score composite</h3>
            <pre className="bg-slate-50 border border-slate-200 rounded p-3 text-xs overflow-x-auto">{`score = 0.30×ais_off + 0.25×mmsi_spoof + 0.20×speed_anomaly + 0.15×position_jump + 0.10×critical_zone`}</pre>
          </div>
          <div>
            <h3 className="text-[#0ea5e9] font-semibold mb-1">Seuils</h3>
            <ul className="text-xs text-[#64748b] list-disc list-inside space-y-1">
              <li><b>Vitesse &gt; 25 kn</b> — max commercial IMO (Maersk Triple-E)</li>
              <li><b>Saut &gt; 0.05°</b> (~5.5 km) — téléportation impossible</li>
              <li><b>AIS off &gt; 2h</b> — SOLAS Chap. V Reg. 19.2.4</li>
              <li><b>MMSI FAKE-</b> — non conforme ITU-R M.585</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Anomaly table */}
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
    </main>
  )
}
