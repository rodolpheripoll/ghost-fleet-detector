import { useEffect, useState, useContext, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { supabase, ModeContext } from '../lib/supabase'

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false })

const RISK_COLORS = {
  'Normal':      '#6b7280',
  'Suspect':     '#d97706',
  'Critical':    '#dc2626',
  'Ghost Fleet': '#7f1d1d',
}

const CONF = { responsive: true, displayModeBar: false }

const NIGHT_HOURS = new Set([20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6])

export default function TemporalPage() {
  const { mode }    = useContext(ModeContext)
  const [ships, setShips]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    const table = mode === 'graph' ? 'ships_graph' : 'ships'
    supabase
      .from(table)
      .select('mmsi, hour_of_day, risk_level, ais_active')
      .then(({ data, error: e }) => {
        if (e) throw e
        setShips((data ?? []).filter(s => s.hour_of_day != null))
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [mode])

  // ── Données dérivées ────────────────────────────────────────────────────────
  const hours = Array.from({ length: 24 }, (_, i) => i)

  const byHourRisk = useMemo(() => {
    const levels = ['Normal', 'Suspect', 'Critical', 'Ghost Fleet']
    return levels.map(level => {
      const counts = hours.map(h =>
        ships.filter(s => s.hour_of_day === h && s.risk_level === level).length
      )
      return { level, counts }
    })
  }, [ships])

  const aisOffByHour = useMemo(() =>
    hours.map(h => ships.filter(s => s.hour_of_day === h && s.ais_active === false).length),
  [ships])

  const peakHour = useMemo(() => {
    let max = -1, peak = 0
    aisOffByHour.forEach((v, h) => { if (v > max) { max = v; peak = h } })
    return peak
  }, [aisOffByHour])

  const tableStats = useMemo(() =>
    hours.map(h => {
      const shipH    = ships.filter(s => s.hour_of_day === h)
      const total    = shipH.length
      const aisOff   = shipH.filter(s => s.ais_active === false).length
      const suspects = shipH.filter(s => s.risk_level === 'Suspect' || s.risk_level === 'Critical' || s.risk_level === 'Ghost Fleet').length
      return {
        h,
        total,
        aisOff,
        pct: total > 0 ? ((aisOff / total) * 100).toFixed(1) : '0.0',
        suspects,
      }
    }),
  [ships])

  // Fond nuit pour le line chart (shapes)
  const nightShapes = useMemo(() => {
    const ranges = [[20, 23.9], [0, 6.1]]
    return ranges.map(([x0, x1]) => ({
      type: 'rect', xref: 'x', yref: 'paper',
      x0, x1, y0: 0, y1: 1,
      fillcolor: '#1e3a5f', opacity: 0.18, line: { width: 0 },
    }))
  }, [])

  // ── Graphique 1 — Barres groupées par risk_level ────────────────────────────
  const barTraces = byHourRisk.map(({ level, counts }) => ({
    type:    'bar',
    name:    level,
    x:       hours.map(h => `${h}h`),
    y:       counts,
    marker:  { color: RISK_COLORS[level] },
  }))

  // ── Graphique 2 — Courbe AIS désactivés ─────────────────────────────────────
  const lineTrace = [{
    type: 'scatter', mode: 'lines+markers',
    name: 'AIS désactivé',
    x:    hours.map(h => `${h}h`),
    y:    aisOffByHour,
    line:    { color: '#f97316', width: 2.5 },
    marker:  { color: '#f97316', size: 6 },
  }]

  if (loading) return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <div className="text-[#64748b] animate-pulse">Chargement...</div>
    </main>
  )

  return (
    <main className="max-w-7xl mx-auto px-8 py-8 space-y-8">
      <div>
        <h1 className="text-[26px] font-bold text-[#1e3a5f]">
          Analyse Temporelle
        </h1>
        <p className="text-[#64748b] mt-1 text-sm">
          Quand les navires désactivent leur AIS ? — {ships.length} navires analysés
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
      )}

      {/* Stat clé */}
      <div className="bg-[#fff7ed] border border-orange-200 rounded-[14px] px-6 py-4 flex items-center gap-4">
        <div>
          <p className="text-[#0f172a] font-bold text-lg">
            Heure de pointe des désactivations AIS : <span className="text-[#f97316]">{peakHour}h00</span>
          </p>
          <p className="text-[#64748b] text-sm">
            {aisOffByHour[peakHour]} navires ont désactivé leur AIS à {peakHour}h00 UTC
            {NIGHT_HOURS.has(peakHour) ? ' — heure nocturne (comportement typique flotte fantôme)' : ''}
          </p>
        </div>
      </div>

      {/* Graphique 1 — Distribution horaire par niveau de risque */}
      <div className="bg-white rounded-[14px] border border-[#e5ebf2] shadow-card p-5">
        <h2 className="text-[18px] font-bold text-[#1e3a5f] mb-4">
          Distribution horaire des positions AIS par niveau de risque
        </h2>
        <Plot
          data={barTraces}
          layout={{
            barmode:   'group',
            paper_bgcolor: '#fff',
            plot_bgcolor:  '#f6f8fb',
            font:      { color: '#0b1220', size: 11, family: 'Manrope' },
            xaxis:     { title: 'Heure UTC', gridcolor: '#eef2f7', tickfont: { color: '#64748b', size: 11 } },
            yaxis:     { title: 'Nombre de navires', gridcolor: '#eef2f7', tickfont: { color: '#64748b', size: 11 } },
            legend:    { orientation: 'h', y: -0.2 },
            margin:    { t: 10, r: 10, b: 60, l: 50 },
            height:    360,
          }}
          config={CONF}
          style={{ width: '100%' }}
        />
      </div>

      {/* Graphique 2 — Courbe désactivations AIS */}
      <div className="bg-white rounded-[14px] border border-[#e5ebf2] shadow-card p-5">
        <h2 className="text-[18px] font-bold text-[#1e3a5f] mb-1">
          Heures de désactivation AIS
        </h2>
        <p className="text-[#64748b] text-xs mb-4">Zone bleue = heures nocturnes (20h–6h)</p>
        <Plot
          data={lineTrace}
          layout={{
            shapes:    nightShapes,
            paper_bgcolor: '#fff',
            plot_bgcolor:  '#f6f8fb',
            font:      { color: '#0b1220', size: 11, family: 'Manrope' },
            xaxis:     { title: 'Heure UTC', gridcolor: '#eef2f7', tickfont: { color: '#64748b', size: 11 } },
            yaxis:     { title: 'Navires AIS désactivé', gridcolor: '#eef2f7', tickfont: { color: '#64748b', size: 11 } },
            margin:    { t: 10, r: 10, b: 50, l: 50 },
            height:    300,
            showlegend: false,
          }}
          config={CONF}
          style={{ width: '100%' }}
        />
      </div>

      {/* Tableau récapitulatif */}
      <div className="bg-white rounded-[14px] border border-[#e5ebf2] shadow-card p-5">
        <h2 className="text-[18px] font-bold text-[#1e3a5f] mb-4">Tableau récapitulatif par heure</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-[#64748b] text-xs uppercase tracking-wide">
                <th className="px-4 py-2 text-left">Heure UTC</th>
                <th className="px-4 py-2 text-right">Navires</th>
                <th className="px-4 py-2 text-right">AIS désactivés</th>
                <th className="px-4 py-2 text-right">% désactivation</th>
                <th className="px-4 py-2 text-right">Navires suspects</th>
              </tr>
            </thead>
            <tbody>
              {tableStats.map(({ h, total, aisOff, pct, suspects }) => {
                const isNight  = NIGHT_HOURS.has(h)
                const isPeak   = h === peakHour
                return (
                  <tr
                    key={h}
                    className={`border-t border-slate-100 ${isPeak ? 'bg-orange-50 font-semibold' : isNight ? 'bg-slate-50' : ''}`}
                  >
                    <td className="px-4 py-2 text-[#0f172a]">
                      {String(h).padStart(2, '0')}h00
                      {isNight && <span className="ml-2 text-[#64748b] text-xs">🌙</span>}
                      {isPeak  && <span className="ml-2 text-[#f97316] text-xs font-bold">▲ pic</span>}
                    </td>
                    <td className="px-4 py-2 text-right text-[#0f172a]">{total}</td>
                    <td className="px-4 py-2 text-right text-[#f97316] font-medium">{aisOff}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        parseFloat(pct) >= 50 ? 'bg-red-100 text-red-700' :
                        parseFloat(pct) >= 20 ? 'bg-orange-100 text-orange-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>{pct}%</span>
                    </td>
                    <td className="px-4 py-2 text-right text-[#dc2626] font-medium">{suspects}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
