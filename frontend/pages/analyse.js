import { useEffect, useState, useContext, useMemo } from 'react'
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
const RISK_ORDER = ['Normal', 'Suspect', 'Critical', 'Ghost Fleet']

const CHART_LAYOUT = (title) => ({
  title:         { text: title, font: { color: '#1e3a5f', size: 13, family: 'Manrope' } },
  paper_bgcolor: '#ffffff',
  plot_bgcolor:  '#f6f8fb',
  font:          { color: '#64748b', size: 11, family: 'Manrope' },
  xaxis:         { gridcolor: '#eef2f7', zerolinecolor: '#eef2f7', tickfont: { color: '#64748b', size: 11 } },
  yaxis:         { gridcolor: '#eef2f7', zerolinecolor: '#eef2f7', tickfont: { color: '#64748b', size: 11 } },
  margin:        { t: 40, b: 40, l: 60, r: 20 },
  legend:        { bgcolor: '#ffffff', bordercolor: '#e5ebf2', borderwidth: 1 },
  autosize:      true,
})
const CONF = { responsive: true, displayModeBar: false }

const DAYS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
const ANOM_TYPES = ['AIS Disabled', 'MMSI Spoofing', 'Speed Anomaly',
                    'Fake Position', 'Course Anomaly', 'Zone Crossing', 'Zone Violation']

export default function AnalysePage() {
  const { mode } = useContext(ModeContext)
  const [tab,        setTab]       = useState('demo')
  const [demoShips,  setDemoShips]  = useState([])
  const [graphShips, setGraphShips] = useState([])
  const [anomalies,  setAnomalies]  = useState([])
  const [zoneStats,  setZoneStats]  = useState([])
  const [loading,    setLoading]    = useState(true)
  const [filter,     setFilter]     = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  useEffect(() => { setTab(mode) }, [mode])

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase.from('ships').select('*'),
      supabase.from('ships_graph').select('*'),
      supabase.from('anomalies').select('*').order('timestamp', { ascending: true }),
      supabase.from('zone_stats').select('*').order('suspicious_behavior_count', { ascending: false }),
    ]).then(([{ data: s }, { data: g }, { data: a }, { data: z }]) => {
      setDemoShips(s ?? [])
      setGraphShips(g ?? [])
      setAnomalies(a ?? [])
      setZoneStats(z ?? [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  // ── DEMO charts ─────────────────────────────────────────────────────────────
  const riskGroups = useMemo(() => {
    const g = {}
    demoShips.forEach(s => {
      const rl = s.risk_level ?? 'Normal'
      if (!g[rl]) g[rl] = { mmsi: [], speed: [], score: [] }
      g[rl].mmsi.push(s.mmsi); g[rl].speed.push(s.speed ?? 0); g[rl].score.push(s.score ?? 0)
    })
    return g
  }, [demoShips])

  const scatterTraces = Object.entries(riskGroups).map(([risk, d]) => ({
    type: 'scatter', mode: 'markers', name: risk,
    x: d.speed, y: d.score, text: d.mmsi,
    hovertemplate: '<b>%{text}</b><br>Vitesse: %{x} kn<br>Score: %{y:.2f}<extra></extra>',
    marker: { color: RISK_PALETTE[risk] ?? '#6b7280', size: 7, opacity: 0.85 },
  }))

  const typeCounts = useMemo(() => {
    const c = {}
    anomalies.forEach(a => { c[a.type] = (c[a.type] ?? 0) + 1 })
    return c
  }, [anomalies])

  const barTrace = [{
    type: 'bar', x: Object.keys(typeCounts), y: Object.values(typeCounts),
    marker: { color: '#3b82f6' },
    hovertemplate: '<b>%{x}</b><br>%{y}<extra></extra>',
  }]

  // Timeline : anomalies by type per month
  const timelineTraces = useMemo(() => {
    const byTypeMonth = {}
    anomalies.forEach(a => {
      if (!a.timestamp) return
      const month = a.timestamp.slice(0, 7)
      const t = a.type
      if (!byTypeMonth[t]) byTypeMonth[t] = {}
      byTypeMonth[t][month] = (byTypeMonth[t][month] ?? 0) + 1
    })
    const allMonths = [...new Set(anomalies.map(a => a.timestamp?.slice(0, 7)).filter(Boolean))].sort()
    return ANOM_TYPES.filter(t => byTypeMonth[t]).map(t => ({
      type: 'scatter', mode: 'lines+markers', name: t,
      x: allMonths,
      y: allMonths.map(m => byTypeMonth[t]?.[m] ?? 0),
      line: { width: 2 },
    }))
  }, [anomalies])

  const radarData = useMemo(() => {
    const anomByMmsi = {}
    anomalies.forEach(a => {
      if (!anomByMmsi[a.mmsi]) anomByMmsi[a.mmsi] = new Set()
      anomByMmsi[a.mmsi].add(a.type)
    })
    const groups = { 'Ghost Fleet': [], Normal: [] }
    demoShips.forEach(s => {
      const rl = s.risk_level ?? 'Normal'
      if (rl === 'Ghost Fleet') groups['Ghost Fleet'].push(s.mmsi)
      else if (rl === 'Normal') groups.Normal.push(s.mmsi)
    })
    const axes = ['AIS Disabled', 'MMSI Spoofing', 'Speed Anomaly', 'Fake Position', 'Zone Crossing']
    return ['Ghost Fleet', 'Normal'].map(grp => {
      const ships = groups[grp]
      if (!ships.length) return null
      const vals = axes.map(ax =>
        Math.round(100 * ships.filter(m => anomByMmsi[m]?.has(ax)).length / ships.length)
      )
      return {
        type: 'scatterpolar', name: grp, fill: 'toself',
        r: [...vals, vals[0]], theta: [...axes, axes[0]],
        line: { color: RISK_PALETTE[grp] },
        marker: { color: RISK_PALETTE[grp] },
        hovertemplate: '<b>%{theta}</b><br>%{r}% des navires<extra></extra>',
      }
    }).filter(Boolean)
  }, [demoShips, anomalies])

  // Top 10 pavillons
  const flagTrace = useMemo(() => {
    const flagCounts = {}
    demoShips.filter(s => s.flag && (s.score ?? 0) > 0.3).forEach(s => {
      flagCounts[s.flag] = (flagCounts[s.flag] ?? 0) + 1
    })
    const sorted = Object.entries(flagCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)
    return [{
      type: 'bar', orientation: 'h',
      y: sorted.map(([f]) => f).reverse(),
      x: sorted.map(([, n]) => n).reverse(),
      marker: { color: '#dc2626', opacity: 0.8 },
      hovertemplate: '<b>%{y}</b><br>%{x} navires suspects<extra></extra>',
    }]
  }, [demoShips])

  // Co-occurrence matrix
  const coOccurrenceData = useMemo(() => {
    const anomByMmsi = {}
    anomalies.forEach(a => {
      if (!anomByMmsi[a.mmsi]) anomByMmsi[a.mmsi] = new Set()
      anomByMmsi[a.mmsi].add(a.type)
    })
    const types = ANOM_TYPES.filter(t => typeCounts[t])
    const matrix = types.map(ti =>
      types.map(tj => {
        if (ti === tj) return 0
        return Object.values(anomByMmsi).filter(s => s.has(ti) && s.has(tj)).length
      })
    )
    return [{ type: 'heatmap', x: types, y: types, z: matrix,
      colorscale: 'Blues',
      hovertemplate: '%{y} ∩ %{x}<br>%{z} navires<extra></extra>' }]
  }, [anomalies, typeCounts])

  const top10demo = [...demoShips].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 10)
  const hbarTrace = [{
    type: 'bar', orientation: 'h',
    y: top10demo.map(s => s.mmsi), x: top10demo.map(s => s.score ?? 0),
    marker: { color: top10demo.map(s => RISK_PALETTE[s.risk_level] ?? '#6b7280') },
    hovertemplate: '<b>%{y}</b><br>Score: %{x:.3f}<extra></extra>',
  }]

  // ── GRAPH charts ─────────────────────────────────────────────────────────────

  // Sankey : DEMO → GRAPH reclassification
  const sankeyData = useMemo(() => {
    const demoRisk = {}
    demoShips.forEach(s => { demoRisk[s.mmsi] = s.risk_level ?? 'Normal' })

    const flows = {}
    graphShips.forEach(s => {
      const dr = demoRisk[s.mmsi] ?? 'Normal'
      const gr = s.risk_level ?? 'Normal'
      const key = `${dr}→${gr}`
      flows[key] = (flows[key] ?? 0) + 1
    })

    // Nodes: 0-3 = DEMO levels, 4-7 = GRAPH levels
    const labels = [
      'Normal (DEMO)', 'Suspect (DEMO)', 'Critical (DEMO)', 'Ghost Fleet (DEMO)',
      'Normal (GRAPH)', 'Suspect (GRAPH)', 'Critical (GRAPH)', 'Ghost Fleet (GRAPH)',
    ]
    const colors = [
      '#16a34a88','#d9770688','#dc262688','#7c3aed88',
      '#16a34a','#d97706','#dc2626','#7c3aed',
    ]
    const nodeIdx = { Normal: 0, Suspect: 1, Critical: 2, 'Ghost Fleet': 3 }

    const sources = [], targets = [], values = []
    Object.entries(flows).forEach(([key, count]) => {
      const [dr, gr] = key.split('→')
      if (nodeIdx[dr] !== undefined && nodeIdx[gr] !== undefined) {
        sources.push(nodeIdx[dr])
        targets.push(nodeIdx[gr] + 4)
        values.push(count)
      }
    })

    return [{ type: 'sankey',
      node: { pad: 20, thickness: 24, label: labels, color: colors,
        line: { color: '#e2e8f0', width: 0.5 } },
      link: { source: sources, target: targets, value: values,
        color: sources.map(s => colors[s].replace('88', '44')) },
    }]
  }, [demoShips, graphShips])

  // DEMO vs GRAPH scatter
  const gRiskGroups = useMemo(() => {
    const g = {}
    graphShips.forEach(s => {
      const rl = s.risk_level ?? 'Normal'
      if (!g[rl]) g[rl] = { mmsi: [], demo: [], graph: [] }
      g[rl].mmsi.push(s.mmsi)
      g[rl].demo.push(s.demo_score ?? s.score ?? 0)
      g[rl].graph.push(s.score ?? 0)
    })
    return g
  }, [graphShips])

  const demoVsGraphTraces = [
    { type: 'scatter', mode: 'lines', name: 'Référence (y=x)',
      x: [0, 1], y: [0, 1], line: { color: '#94a3b8', dash: 'dash', width: 1.5 }, hoverinfo: 'skip' },
    ...Object.entries(gRiskGroups).map(([risk, d]) => ({
      type: 'scatter', mode: 'markers', name: risk,
      x: d.demo, y: d.graph, text: d.mmsi,
      hovertemplate: '<b>%{text}</b><br>DEMO: %{x:.3f}<br>GRAPH: %{y:.3f}<extra></extra>',
      marker: { color: RISK_PALETTE[risk] ?? '#6b7280', size: 6, opacity: 0.8 },
    })),
  ]

  // Group discount distribution
  const discountCounts = useMemo(() => {
    const c = {}
    graphShips.forEach(s => {
      const d = ((s.group_discount ?? 0) * 100).toFixed(0) + '%'
      c[d] = (c[d] ?? 0) + 1
    })
    return c
  }, [graphShips])
  const discountOrder = ['0%','5%','10%','20%','30%','40%','50%']
  const discountBarTrace = [{
    type: 'bar',
    x: discountOrder.filter(k => discountCounts[k]),
    y: discountOrder.filter(k => discountCounts[k]).map(k => discountCounts[k]),
    marker: { color: '#7c3aed', opacity: 0.85 },
    hovertemplate: 'Réduction %{x}<br>%{y} navires<extra></extra>',
  }]

  // Score delta box
  const deltaBins = useMemo(() => {
    const b = {}
    graphShips.forEach(s => {
      const rl = s.risk_level ?? 'Normal'
      if (!b[rl]) b[rl] = []
      b[rl].push((s.demo_score ?? s.score ?? 0) - (s.score ?? 0))
    })
    return b
  }, [graphShips])
  const deltaBoxTraces = Object.entries(deltaBins).filter(([, v]) => v.length).map(([risk, vals]) => ({
    type: 'box', name: risk, y: vals,
    marker: { color: RISK_PALETTE[risk] ?? '#6b7280' },
    hovertemplate: '<b>' + risk + '</b><br>Réduction: %{y:.3f}<extra></extra>',
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
    <main className="max-w-7xl mx-auto px-8 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[26px] font-bold text-[#1e3a5f]">Analyse</h1>
        <div className="flex items-center gap-1 bg-slate-100 rounded-full p-1">
          <button onClick={() => setTab('demo')}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
              tab === 'demo' ? 'bg-[#0ea5e9] text-white shadow-sm' : 'text-[#64748b] hover:text-[#0f172a]'}`}>
            Analyse DEMO
          </button>
          <button onClick={() => setTab('graph')}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
              tab === 'graph' ? 'bg-[#7c3aed] text-white shadow-sm' : 'text-[#64748b] hover:text-[#0f172a]'}`}>
            Analyse GRAPH
          </button>
        </div>
      </div>

      {/* ── DEMO TAB ── */}
      {tab === 'demo' && (
        <>
          {/* Row 1: scatter + bar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-[14px] p-4 border border-[#e5ebf2] shadow-card">
              <Plot data={scatterTraces} layout={CHART_LAYOUT('Vitesse vs Score de suspicion')} config={CONF} style={{ width: '100%' }} />
            </div>
            <div className="bg-white rounded-[14px] p-4 border border-[#e5ebf2] shadow-card">
              <Plot data={barTrace} layout={CHART_LAYOUT('Anomalies par type')} config={CONF} style={{ width: '100%' }} />
            </div>
          </div>

          {/* Row 2: timeline + top 10 flags */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-[14px] p-4 border border-[#e5ebf2] shadow-card">
              <Plot data={timelineTraces}
                layout={{ ...CHART_LAYOUT('Anomalies par type dans le temps'), showlegend: true }}
                config={CONF} style={{ width: '100%' }} />
            </div>
            <div className="bg-white rounded-[14px] p-4 border border-[#e5ebf2] shadow-card">
              <Plot data={flagTrace}
                layout={{ ...CHART_LAYOUT('Top 10 pavillons — navires suspects (score > 0.3)'),
                  yaxis: { ...CHART_LAYOUT('').yaxis, autorange: true } }}
                config={CONF} style={{ width: '100%' }} />
            </div>
          </div>

          {/* Row 3: radar */}
          <div className="mb-6">
            <div className="bg-white rounded-[14px] p-4 border border-[#e5ebf2] shadow-card">
              <Plot data={radarData}
                layout={{ ...CHART_LAYOUT('Profil anomalie — Ghost Fleet vs Normal'),
                  polar: { radialaxis: { visible: true, range: [0, 100] } },
                  showlegend: true }}
                config={CONF} style={{ width: '100%' }} />
            </div>
          </div>

          {/* Row 4: top 10 ships + co-occurrence */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-[14px] p-4 border border-[#e5ebf2] shadow-card">
              <Plot data={hbarTrace}
                layout={{ ...CHART_LAYOUT('Top 10 navires par score'),
                  yaxis: { ...CHART_LAYOUT('').yaxis, autorange: 'reversed' } }}
                config={CONF} style={{ width: '100%' }} />
            </div>
            <div className="bg-white rounded-[14px] p-4 border border-[#e5ebf2] shadow-card">
              <Plot data={coOccurrenceData}
                layout={{ ...CHART_LAYOUT('Co-occurrence des types d\'anomalie'),
                  xaxis: { ...CHART_LAYOUT('').xaxis, tickangle: -30 } }}
                config={CONF} style={{ width: '100%' }} />
            </div>
          </div>

          {/* Methodology */}
          <section className="bg-white border border-[#e5ebf2] rounded-[14px] p-6 mb-8 shadow-card">
            <h2 className="text-[18px] font-bold text-[#1e3a5f] mb-4">Méthodologie de détection</h2>
            <div className="space-y-4 text-sm text-[#0f172a]">
              <div>
                <h3 className="text-[#0ea5e9] font-semibold mb-1">Isolation Forest (ML)</h3>
                <p>L&apos;Isolation Forest isole les anomalies en partitionnant aléatoirement l&apos;espace des caractéristiques. Paramètre <code className="bg-slate-100 px-1 rounded">contamination=0.05</code> (5% de navires suspects).</p>
              </div>
              <div>
                <h3 className="text-[#0ea5e9] font-semibold mb-1">Fake Position — vitesse implicite</h3>
                <p>Flaggué uniquement si la vitesse impliquée entre deux points AIS consécutifs dépasse 60 nœuds — plafond physique absolu (les navires militaires les plus rapides atteignent ~55 kn).</p>
              </div>
            </div>
          </section>

          {/* Q9 — Zone stats table */}
          {zoneStats.length > 0 && (
            <section className="bg-white border border-[#e5ebf2] rounded-[14px] p-6 mb-8 shadow-card">
              <h2 className="text-[18px] font-bold text-[#1e3a5f] mb-2">Statistiques par zone de risque</h2>
              {(() => {
                const top = zoneStats[0]
                return top ? (
                  <p className="text-sm text-[#64748b] mb-4">
                    Zone la plus dangereuse : <b className="text-[#dc2626]">{top.name}</b> avec{' '}
                    <b>{top.suspicious_behavior_count}</b> comportements suspects
                  </p>
                ) : null
              })()}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-[#64748b] text-xs uppercase tracking-wide">
                      <th className="px-4 py-2 text-left">Zone</th>
                      <th className="px-4 py-2 text-left">Niveau de risque</th>
                      <th className="px-4 py-2 text-right">Navires détectés</th>
                      <th className="px-4 py-2 text-right">Comportements suspects</th>
                      <th className="px-4 py-2 text-right">Navires critiques</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zoneStats.map((z, i) => {
                      const isTop = i === 0
                      const badge = {
                        Critical: 'bg-red-100 text-red-700',
                        High:     'bg-orange-100 text-orange-700',
                        Medium:   'bg-yellow-100 text-yellow-700',
                        Low:      'bg-green-100 text-green-700',
                      }[z.risk_level] ?? 'bg-slate-100 text-slate-600'
                      return (
                        <tr key={z.zone_id} className={`border-t border-slate-100 ${isTop ? 'font-semibold bg-red-50' : ''}`}>
                          <td className="px-4 py-2 text-[#0f172a]">{z.name}</td>
                          <td className="px-4 py-2">
                            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${badge}`}>{z.risk_level}</span>
                          </td>
                          <td className="px-4 py-2 text-right text-[#0f172a]">{z.ship_count}</td>
                          <td className="px-4 py-2 text-right text-[#dc2626] font-medium">{z.suspicious_behavior_count}</td>
                          <td className="px-4 py-2 text-right text-[#d97706] font-medium">{z.critical_ship_count}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Anomaly table */}
          <section>
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <h2 className="text-[18px] font-bold text-[#1e3a5f]">Tableau des anomalies</h2>
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
          {/* Explanation */}
          <section className="bg-[#f5f3ff] border border-purple-200 rounded-xl p-5 mb-6 shadow-sm">
            <h2 className="text-base font-semibold text-[#7c3aed] mb-2">
              Mode GRAPH — Raffinement par appartenance au groupe H3
            </h2>
            <p className="text-sm text-[#0f172a] leading-relaxed mb-3">
              Le mode GRAPH affine le scoring DEMO par la théorie des groupes H3 (Uber).
              Les navires appartenant à un convoi reçoivent une <b>réduction de score</b> —
              la flotte fantôme ne navigue <em>jamais</em> en groupe.
              Les navires isolés conservent leur score DEMO intégral.
            </p>
            <div className="grid grid-cols-3 gap-3 text-xs">
              {[['2–3 navires','10–20%'],['4–5 navires','30–40%'],['6+ navires','50% (max)']].map(([label, pct]) => (
                <div key={label} className="bg-white rounded-lg p-3 border border-purple-100">
                  <p className="text-[#7c3aed] font-bold mb-1">Convoi {label}</p>
                  <p className="text-[#475569]">Réduction : {pct}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Sankey — most impactful chart */}
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm mb-6">
            <Plot data={sankeyData}
              layout={{
                ...CHART_LAYOUT('Flux de reclassification DEMO → GRAPH (faux positifs éliminés)'),
                font: { size: 12 },
              }}
              config={CONF} style={{ width: '100%', minHeight: 360 }} />
          </div>

          {/* DEMO vs GRAPH scatter + discount bar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="bg-white rounded-[14px] p-4 border border-[#e5ebf2] shadow-card">
              <Plot data={demoVsGraphTraces}
                layout={{
                  ...CHART_LAYOUT('Score DEMO vs Score GRAPH'),
                  xaxis: { ...CHART_LAYOUT('').xaxis, title: 'Score DEMO', range: [0, 1] },
                  yaxis: { ...CHART_LAYOUT('').yaxis, title: 'Score GRAPH', range: [0, 1] },
                }}
                config={CONF} style={{ width: '100%' }} />
            </div>
            <div className="bg-white rounded-[14px] p-4 border border-[#e5ebf2] shadow-card">
              <Plot data={discountBarTrace}
                layout={CHART_LAYOUT('Répartition des réductions de score par taille de groupe')}
                config={CONF} style={{ width: '100%' }} />
            </div>
          </div>

          {/* Score delta box */}
          <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm mb-6">
            <Plot data={deltaBoxTraces}
              layout={{
                ...CHART_LAYOUT('Réduction score DEMO→GRAPH par niveau de risque final'),
                yaxis: { ...CHART_LAYOUT('').yaxis, title: 'demo_score − graph_score', zeroline: true },
              }}
              config={CONF} style={{ width: '100%' }} />
          </div>
        </>
      )}
    </main>
  )
}
