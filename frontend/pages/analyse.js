import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '../lib/supabase'
import ShipTable from '../components/ShipTable'

// Plotly has no SSR support
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false })

const RISK_PALETTE = {
  'Ghost Fleet': '#7f1d1d',
  'Critical':    '#dc2626',
  'Suspect':     '#d97706',
  'Normal':      '#6b7280',
}

function ScoreBadge({ score }) {
  const s = parseFloat(score) || 0
  let cls = 'bg-emerald-900 text-emerald-300'
  if (s >= 0.8) cls = 'bg-red-950 text-red-300'
  else if (s >= 0.6) cls = 'bg-red-900 text-red-300'
  else if (s >= 0.3) cls = 'bg-amber-900 text-amber-300'
  return <span className={`px-2 py-0.5 rounded text-xs font-bold ${cls}`}>{s.toFixed(2)}</span>
}

const CHART_LAYOUT = (title) => ({
  title:    { text: title, font: { color: '#e2e8f0', size: 14 } },
  paper_bgcolor: '#1e293b',
  plot_bgcolor:  '#1e293b',
  font:     { color: '#94a3b8' },
  xaxis:    { gridcolor: '#334155', zerolinecolor: '#334155' },
  yaxis:    { gridcolor: '#334155', zerolinecolor: '#334155' },
  margin:   { t: 40, b: 40, l: 50, r: 20 },
  legend:   { bgcolor: '#0f172a', bordercolor: '#334155', borderwidth: 1 },
  autosize: true,
})

export default function AnalysePage() {
  const [ships,     setShips]     = useState([])
  const [anomalies, setAnomalies] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [filter,    setFilter]    = useState('')
  const [typeFilter, setTypeFilter] = useState('all')

  useEffect(() => {
    async function fetchData() {
      const [{ data: s }, { data: a }] = await Promise.all([
        supabase.from('ships').select('*'),
        supabase.from('anomalies').select('*').order('timestamp', { ascending: true }),
      ])
      setShips(s ?? [])
      setAnomalies(a ?? [])
      setLoading(false)
    }
    fetchData()
  }, [])

  // ── Chart data prep ───────────────────────────────────────────────────────
  const riskGroups = {}
  ships.forEach(s => {
    const rl = s.risk_level ?? 'Normal'
    if (!riskGroups[rl]) riskGroups[rl] = { mmsi: [], speed: [], score: [] }
    riskGroups[rl].mmsi.push(s.mmsi)
    riskGroups[rl].speed.push(s.speed ?? 0)
    riskGroups[rl].score.push(s.score ?? 0)
  })

  // 1. Scatter speed vs score
  const scatterTraces = Object.entries(riskGroups).map(([risk, d]) => ({
    type: 'scatter', mode: 'markers',
    name: risk,
    x:    d.speed,
    y:    d.score,
    text: d.mmsi,
    hovertemplate: '<b>%{text}</b><br>Vitesse: %{x} kn<br>Score: %{y:.2f}<extra></extra>',
    marker: { color: RISK_PALETTE[risk] ?? '#6b7280', size: 8, opacity: 0.85 },
  }))

  // 2. Bar: anomaly count by type
  const typeCounts = {}
  anomalies.forEach(a => { typeCounts[a.type] = (typeCounts[a.type] ?? 0) + 1 })
  const barTrace = [{
    type: 'bar',
    x:    Object.keys(typeCounts),
    y:    Object.values(typeCounts),
    marker: { color: '#3b82f6' },
    hovertemplate: '<b>%{x}</b><br>%{y} anomalie(s)<extra></extra>',
  }]

  // 3. Line: anomalies per day
  const byDay = {}
  anomalies.forEach(a => {
    if (!a.timestamp) return
    const day = a.timestamp.slice(0, 10)
    byDay[day] = (byDay[day] ?? 0) + 1
  })
  const sortedDays = Object.keys(byDay).sort()
  const lineTrace  = [{
    type: 'scatter', mode: 'lines+markers',
    x:    sortedDays,
    y:    sortedDays.map(d => byDay[d]),
    line: { color: '#8b5cf6', width: 2 },
    marker: { color: '#8b5cf6' },
  }]

  // 4. Pie: ships by risk level
  const riskCounts = {}
  ships.forEach(s => {
    const rl = s.risk_level ?? 'Normal'
    riskCounts[rl] = (riskCounts[rl] ?? 0) + 1
  })
  const pieTrace = [{
    type: 'pie',
    labels: Object.keys(riskCounts),
    values: Object.values(riskCounts),
    marker: { colors: Object.keys(riskCounts).map(r => RISK_PALETTE[r] ?? '#6b7280') },
    textinfo: 'label+percent',
    hovertemplate: '<b>%{label}</b><br>%{value} navires (%{percent})<extra></extra>',
  }]

  // 5. Horizontal bar: top 10 ships by score
  const top10 = [...ships].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 10)
  const hbarTrace = [{
    type:        'bar',
    orientation: 'h',
    y:    top10.map(s => s.mmsi),
    x:    top10.map(s => s.score ?? 0),
    marker: { color: top10.map(s => RISK_PALETTE[s.risk_level] ?? '#6b7280') },
    hovertemplate: '<b>%{y}</b><br>Score: %{x:.2f}<extra></extra>',
  }]

  // ── Anomaly table filter ──────────────────────────────────────────────────
  const anomTypes = ['all', ...new Set(anomalies.map(a => a.type))]
  const filteredAnom = anomalies.filter(a => {
    const matchMmsi = !filter || String(a.mmsi).toLowerCase().includes(filter.toLowerCase())
    const matchType = typeFilter === 'all' || a.type === typeFilter
    return matchMmsi && matchType
  })

  const anomColumns = [
    { key: 'mmsi',        label: 'MMSI' },
    { key: 'type',        label: 'Type' },
    { key: 'description', label: 'Description', render: v => (
      <span className="text-xs text-slate-400 line-clamp-2">{v}</span>
    )},
    { key: 'confidence',  label: 'Confiance', render: v => (
      <span className={`text-xs font-bold ${parseFloat(v) >= 0.85 ? 'text-red-400' : 'text-amber-400'}`}>
        {(parseFloat(v ?? 0) * 100).toFixed(0)}%
      </span>
    )},
    { key: 'detected_by', label: 'Methode', render: v => (
      <span className={`px-2 py-0.5 rounded text-xs ${
        v === 'isolation_forest' ? 'bg-purple-900 text-purple-300' :
        v === 'both'             ? 'bg-red-900 text-red-300' :
                                   'bg-blue-900 text-blue-300'
      }`}>{v}</span>
    )},
    { key: 'timestamp',   label: 'Timestamp', render: v => v ? new Date(v).toLocaleString('fr-FR') : 'N/A' },
  ]

  const CONF_OPTIONS = { responsive: true }

  if (loading) return (
    <main className="max-w-7xl mx-auto px-4 py-8 text-slate-400 animate-pulse">
      Chargement des analyses...
    </main>
  )

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">Analyse ML — Isolation Forest</h1>

      {/* Charts grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <Plot data={scatterTraces} layout={CHART_LAYOUT('Vitesse vs Score de suspicion')} config={CONF_OPTIONS} style={{ width: '100%' }} />
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <Plot data={barTrace} layout={CHART_LAYOUT('Anomalies par type')} config={CONF_OPTIONS} style={{ width: '100%' }} />
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <Plot data={lineTrace} layout={CHART_LAYOUT('Anomalies detectees par jour')} config={CONF_OPTIONS} style={{ width: '100%' }} />
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <Plot data={pieTrace} layout={{ ...CHART_LAYOUT('Repartition par niveau de risque'), showlegend: true }} config={CONF_OPTIONS} style={{ width: '100%' }} />
        </div>
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 lg:col-span-2">
          <Plot
            data={hbarTrace}
            layout={{ ...CHART_LAYOUT('Top 10 navires par score'), yaxis: { ...CHART_LAYOUT('').yaxis, autorange: 'reversed' } }}
            config={CONF_OPTIONS}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {/* Explanation */}
      <section className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">Methodologie de detection</h2>

        <div className="space-y-4 text-sm text-slate-300">
          <div>
            <h3 className="text-blue-400 font-semibold mb-1">Isolation Forest (ML)</h3>
            <p>
              L&apos;Isolation Forest isole les anomalies en partitionnant aleatoirement l&apos;espace des
              caracteristiques : les points aberrants necessitent moins de coupures pour etre isoles,
              resultant en une longueur de chemin plus courte. Le modele est entraine sur les features
              <em> vitesse, cap, delta_lat, delta_lon, temps_depuis_dernier_signal</em>.
              Le parametre <code>contamination=0.05</code> reflète le taux estime de 5% de navires fantomes
              dans les donnees AIS mondiales (source : Windward Maritime AI Annual Report 2022).
              Les scores negatifs bruts sont inverses pour que des valeurs plus elevees indiquent
              une plus grande anomalie.
            </p>
          </div>

          <div>
            <h3 className="text-blue-400 font-semibold mb-1">Formule de score composite</h3>
            <pre className="bg-slate-900 rounded p-3 text-xs overflow-x-auto text-slate-300">
{`score = clip(
  0.30 × ais_off_flag        # SOLAS Ch.V — disparition totale des radars
+ 0.25 × mmsi_spoof_flag     # Fraude d'identite — IMO Circ.289
+ 0.20 × speed_anomaly_flag  # Vitesse physiquement impossible (> 25 kn)
+ 0.15 × position_jump_flag  # Faux GPS (> 0.05° = 5.5 km)
+ 0.10 × critical_zone_flag  # Zone critique (mer Rouge, golfe Persique)
, 0, 1)`}
            </pre>
            <p className="mt-2 text-xs text-slate-400">
              Seuil critique = 0.6 → combination d&apos;au moins 2 comportements simultanement suspects.
            </p>
          </div>

          <div>
            <h3 className="text-blue-400 font-semibold mb-1">Regles metier et seuils</h3>
            <ul className="space-y-1 text-xs text-slate-400 list-disc list-inside">
              <li><b>Vitesse &gt; 25 kn</b> — vitesse max des navires commerciaux les plus rapides (Maersk Triple-E). Source : IMO.</li>
              <li><b>Saut de position &gt; 0.05°</b> (~5.5 km) — teleportation impossible pour tout navire. Source : physique maritime.</li>
              <li><b>AIS off &gt; 2h</b> — obligation SOLAS Chapitre V Reg. 19.2.4 de transmission continue.</li>
              <li><b>MMSI FAKE-</b> — identifiant non conforme (9 chiffres requis). Source : ITU-R M.585.</li>
              <li><b>Changement de cap &gt; 90° en &lt; 10 min</b> — physiquement impossible pour les grands tonnages. Source : IMO COLREGS Regle 8.</li>
              <li><b>Zone critique</b> — mer Rouge, golfe Persique, detroit d&apos;Hormuz. Source : OFAC, ONU.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Anomaly table */}
      <section>
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <h2 className="text-lg font-semibold text-white">Tableau des anomalies</h2>
          <input
            type="text"
            placeholder="Filtrer par MMSI..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            className="bg-slate-800 border border-slate-600 text-slate-200 rounded px-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="bg-slate-800 border border-slate-600 text-slate-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {anomTypes.map(t => (
              <option key={t} value={t}>{t === 'all' ? 'Tous les types' : t}</option>
            ))}
          </select>
          <span className="text-slate-400 text-xs">{filteredAnom.length} anomalie(s)</span>
        </div>
        <ShipTable ships={filteredAnom} columns={anomColumns} />
      </section>
    </main>
  )
}
