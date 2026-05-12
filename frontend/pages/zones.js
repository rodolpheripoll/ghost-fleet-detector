import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '../lib/supabase'

// Recharts — client-side only
const BarChart       = dynamic(() => import('recharts').then(m => m.BarChart),       { ssr: false })
const Bar            = dynamic(() => import('recharts').then(m => m.Bar),            { ssr: false })
const XAxis          = dynamic(() => import('recharts').then(m => m.XAxis),          { ssr: false })
const YAxis          = dynamic(() => import('recharts').then(m => m.YAxis),          { ssr: false })
const CartesianGrid  = dynamic(() => import('recharts').then(m => m.CartesianGrid),  { ssr: false })
const Tooltip        = dynamic(() => import('recharts').then(m => m.Tooltip),        { ssr: false })
const Legend         = dynamic(() => import('recharts').then(m => m.Legend),         { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })
const Cell           = dynamic(() => import('recharts').then(m => m.Cell),           { ssr: false })
const ZonesMap       = dynamic(() => import('../components/ZonesMap'),                { ssr: false })

const RISK_COLOR = {
  Critical:    '#dc2626',
  High:        '#f97316',
  Medium:      '#eab308',
  Low:         '#22c55e',
}

const RISK_BADGE = {
  Critical: 'bg-red-100 text-red-700',
  High:     'bg-orange-100 text-orange-700',
  Medium:   'bg-yellow-100 text-yellow-700',
  Low:      'bg-green-100 text-green-700',
}

function KpiCard({ label, value, sub, color = '#0ea5e9' }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm" style={{ borderLeft: `4px solid ${color}` }}>
      <p className="text-[#64748b] text-xs uppercase tracking-wide mb-1">{label}</p>
      <p className="text-3xl font-bold" style={{ color }}>{value ?? '—'}</p>
      {sub && <p className="text-[#64748b] text-xs mt-1 truncate">{sub}</p>}
    </div>
  )
}

export default function ZonesPage() {
  const [stats,     setStats]     = useState([])
  const [riskZones, setRiskZones] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  useEffect(() => {
    Promise.all([
      supabase.from('zone_stats').select('*').order('suspicious_behavior_count', { ascending: false }),
      supabase.from('risk_zones').select('*'),
    ]).then(([{ data: s, error: se }, { data: z, error: ze }]) => {
      if (se) throw se
      if (ze) throw ze
      setStats(s ?? [])
      setRiskZones(z ?? [])
    }).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [])

  const totalZones    = stats.length
  const totalBehavior = stats.reduce((s, z) => s + (z.suspicious_behavior_count ?? 0), 0)
  const topZone       = stats[0] ?? null

  // Chart 1: horizontal bar — suspicious_behavior_count per zone (top 20)
  const chart1Data = stats.slice(0, 20).map(z => ({
    name:     z.name.length > 28 ? z.name.slice(0, 26) + '…' : z.name,
    fullName: z.name,
    value:    z.suspicious_behavior_count ?? 0,
    rl:       z.risk_level ?? 'Low',
  }))

  // Chart 2: grouped bar — ship_count vs suspicious_behavior_count (top 15)
  const chart2Data = stats.slice(0, 15).map(z => ({
    name:      z.name.length > 22 ? z.name.slice(0, 20) + '…' : z.name,
    Navires:   z.ship_count ?? 0,
    Comport:   z.suspicious_behavior_count ?? 0,
  }))

  if (loading) return (
    <main className="max-w-7xl mx-auto px-4 py-8 text-[#64748b] animate-pulse">
      Chargement des zones…
    </main>
  )

  return (
    <main className="max-w-7xl mx-auto px-8 py-8">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-[26px] font-bold text-[#1e3a5f]">Analyse des Zones à Risque</h1>
        <p className="text-[#64748b] text-sm mt-1">
          Statistiques par zone géographique : navires détectés, comportements suspects, navires critiques
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-6 text-sm">
          {error}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <KpiCard
          label="Zones surveillées"
          value={totalZones}
          color="#0ea5e9"
        />
        <KpiCard
          label="Zone la plus active"
          value={topZone?.suspicious_behavior_count ?? 0}
          sub={topZone?.name ?? '—'}
          color="#dc2626"
        />
        <KpiCard
          label="Total comportements suspects"
          value={totalBehavior}
          sub="toutes zones confondues"
          color="#d97706"
        />
      </div>

      {/* Chart 1 — Horizontal bar: suspicious_behavior_count */}
      <section className="bg-white border border-[#e5ebf2] rounded-[14px] p-5 mb-6 shadow-card">
        <h2 className="text-[18px] font-bold text-[#1e3a5f] mb-4">
          Comportements suspects par zone <span className="text-[#64748b] font-normal text-sm">(top 20)</span>
        </h2>
        {stats.length === 0 ? (
          <p className="text-[#64748b] text-sm">Aucune donnée. Lancez le pipeline Python.</p>
        ) : (
          <div style={{ width: '100%', height: Math.max(320, chart1Data.length * 36) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chart1Data}
                layout="vertical"
                margin={{ top: 0, right: 30, left: 180, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'Manrope' }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'Manrope' }}
                  width={175}
                />
                <Tooltip
                  formatter={(v, _, props) => [v, `Comportements — ${props.payload.fullName}`]}
                  contentStyle={{ background: '#fff', border: '1px solid #e5ebf2', borderRadius: 10, fontSize: 12 }}
                />
                <Bar dataKey="value" name="Comportements suspects" radius={[0, 4, 4, 0]}>
                  {chart1Data.map((entry, i) => (
                    <Cell key={i} fill={RISK_COLOR[entry.rl] ?? '#94a3b8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-4 justify-center">
          {Object.entries(RISK_COLOR).map(([rl, color]) => (
            <span key={rl} className="flex items-center gap-1.5 text-xs text-[#64748b]">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: color }} />
              {rl}
            </span>
          ))}
        </div>
      </section>

      {/* Chart 2 — Grouped bar: ships vs behaviors */}
      <section className="bg-white border border-[#e5ebf2] rounded-[14px] p-5 mb-6 shadow-card">
        <h2 className="text-[18px] font-bold text-[#1e3a5f] mb-4">
          Navires détectés vs Comportements suspects par zone <span className="text-[#64748b] font-normal text-sm">(top 15)</span>
        </h2>
        {stats.length === 0 ? (
          <p className="text-[#64748b] text-sm">Aucune donnée.</p>
        ) : (
          <div style={{ width: '100%', height: 360 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart2Data} margin={{ top: 5, right: 20, left: 10, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: '#64748b', fontFamily: 'Manrope' }}
                  angle={-40}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tick={{ fontSize: 11, fill: '#64748b', fontFamily: 'Manrope' }} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e5ebf2', borderRadius: 10, fontSize: 12 }} />
                <Legend verticalAlign="top" />
                <Bar dataKey="Navires"  name="Navires détectés"      fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Comport" name="Comportements suspects" fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Table */}
      <section className="bg-white border border-[#e5ebf2] rounded-[14px] shadow-card mb-8">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-[18px] font-bold text-[#1e3a5f]">
            Détail par zone ({stats.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-[#0f172a]">
            <thead className="bg-slate-50 text-[#64748b] uppercase text-xs border-b border-slate-200">
              <tr>
                {['Zone', 'Niveau de risque', 'Navires détectés', 'Comportements suspects', 'Critiques'].map(h => (
                  <th key={h} className="px-4 py-3 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {stats.map((z, i) => {
                const isTop = i === 0
                return (
                  <tr
                    key={z.zone_id}
                    className={`transition-colors ${isTop ? 'bg-red-50 font-semibold' : 'hover:bg-slate-50'}`}
                  >
                    <td className="px-4 py-2.5">
                      {isTop && <span className="mr-1">🏆</span>}
                      {z.name}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${RISK_BADGE[z.risk_level] ?? 'bg-slate-100 text-slate-600'}`}>
                        {z.risk_level ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">{z.ship_count ?? 0}</td>
                    <td className="px-4 py-2.5">{z.suspicious_behavior_count ?? 0}</td>
                    <td className="px-4 py-2.5">{z.critical_ship_count ?? 0}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Conclusion */}
      {topZone && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-6 py-5 text-center">
          <p className="text-red-800 font-semibold text-base">
            🏆 Zone la plus dangereuse : <span className="font-bold">{topZone.name}</span>
            {' '}avec <span className="font-bold">{topZone.suspicious_behavior_count}</span> comportements suspects détectés
          </p>
          <p className="text-red-600 text-sm mt-1">
            {topZone.ship_count} navires présents · {topZone.critical_ship_count} critiques · Niveau : {topZone.risk_level}
          </p>
        </div>
      )}

      {/* Carte des zones */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 mt-6">
        <h2 className="text-lg font-semibold text-[#0f172a] mb-1">
          Carte des zones à risque
        </h2>
        <p className="text-sm text-[#64748b] mb-4">
          Cliquez sur une zone pour voir ses statistiques détaillées.
        </p>
        <div className="flex flex-wrap gap-4 mb-3">
          {[['Critical','#ef4444'],['High','#f97316'],['Medium','#eab308'],['Low','#22c55e']].map(([rl, c]) => (
            <span key={rl} className="flex items-center gap-1.5 text-xs text-[#64748b]">
              <span className="inline-block w-3 h-3 rounded-sm opacity-80" style={{ background: c }} />
              {rl}
            </span>
          ))}
        </div>
        <div style={{ height: '480px' }}>
          <ZonesMap zones={riskZones} zoneStats={stats} />
        </div>
      </div>

    </main>
  )
}
