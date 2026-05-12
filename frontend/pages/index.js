import { useEffect, useState, useContext } from 'react'
import dynamic from 'next/dynamic'
import { supabase, ModeContext } from '../lib/supabase'
import KPICard from '../components/KPICard'
import ShipTable from '../components/ShipTable'

const MapPreview = dynamic(() => import('../components/MapPreview'), { ssr: false })

function RiskBadge({ value }) {
  const v = value ?? 'Normal'
  const cls =
    v === 'Ghost Fleet' ? 'bg-[#ede9fe] text-[#7c3aed]' :
    v === 'Critical'    ? 'bg-[#fee2e2] text-[#dc2626]' :
    v === 'Suspect'     ? 'bg-[#fef3c7] text-[#d97706]' :
                          'bg-[#dcfce7] text-[#16a34a]'
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{v}</span>
}

export default function Dashboard() {
  const { mode }      = useContext(ModeContext)
  const [ships,       setShips]     = useState([])
  const [anomalies,   setAnomalies] = useState([])
  const [loading,     setLoading]   = useState(true)
  const [error,       setError]     = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    const table = mode === 'graph' ? 'ships_graph' : 'ships'
    Promise.all([
      supabase.from(table).select('*').order('score', { ascending: false }),
      mode === 'demo'
        ? supabase.from('anomalies').select('*')
        : Promise.resolve({ data: [], error: null }),
    ]).then(([{ data: s, error: se }, { data: a, error: ae }]) => {
      if (se) throw se
      if (ae) throw ae
      setShips(s ?? [])
      setAnomalies(a ?? [])
    }).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [mode])

  const suspicious = ships.filter(s => (s.score ?? 0) > 0.3).length
  const critical   = ships.filter(s => (s.score ?? 0) > 0.6).length
  const ghostFleet = ships.filter(s => (s.score ?? 0) >= 0.8).length
  const top10      = [...ships].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 10)

  const tableColumns = mode === 'graph'
    ? [
        { key: 'mmsi',            label: 'MMSI' },
        { key: 'risk_level',      label: 'Risque',      render: v => <RiskBadge value={v} /> },
        { key: 'score',           label: 'Score',       render: v => (parseFloat(v) || 0).toFixed(2) },
        { key: 'isolation_score', label: 'Isolation',   render: v => (parseFloat(v) || 0).toFixed(2) },
        { key: 'behavior_score',  label: 'Comportement',render: v => (parseFloat(v) || 0).toFixed(2) },
        { key: 'graph_degree',    label: 'Voisins',     render: v => v ?? 0 },
        { key: 'latitude',        label: 'Lat',         render: v => v?.toFixed(4) ?? 'N/A' },
        { key: 'longitude',       label: 'Lon',         render: v => v?.toFixed(4) ?? 'N/A' },
      ]
    : [
        { key: 'mmsi',       label: 'MMSI' },
        { key: 'risk_level', label: 'Risque',    render: v => <RiskBadge value={v} /> },
        { key: 'score',      label: 'Score',     render: v => (parseFloat(v) || 0).toFixed(2) },
        { key: 'latitude',   label: 'Lat',       render: v => v?.toFixed(4) ?? 'N/A' },
        { key: 'longitude',  label: 'Lon',       render: v => v?.toFixed(4) ?? 'N/A' },
        { key: 'speed',      label: 'Vitesse',   render: v => v != null ? `${v} kn` : 'N/A' },
        { key: 'timestamp',  label: 'Timestamp', render: v => v ? new Date(v).toLocaleString('fr-FR') : 'N/A' },
      ]

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#0f172a]">
          Ghost Fleet Detection — AIS Maritime Intelligence
        </h1>
        <p className="text-[#64748b] mt-1 text-sm">
          {mode === 'graph'
            ? 'Mode Graph Theory actif — scoring basé sur l\'isolation dans le graphe de proximité'
            : 'Données statiques — pipeline CSV Généralisation (règles + Isolation Forest)'}
        </p>
      </div>

      {mode === 'graph' && (
        <div className="bg-[#f5f3ff] border border-purple-200 rounded-xl px-5 py-3 mb-6 text-sm text-[#7c3aed]">
          🔮 <b>Mode Graph Theory actif</b> — scoring basé sur l&apos;isolation dans le graphe de proximité (seuil 20 nm)
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-6 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-[#64748b] animate-pulse">Chargement des données...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <KPICard title="Navires totaux"  value={ships.length}     color="#0ea5e9" subtitle="positions uniques MMSI" />
            <KPICard title="Suspects"        value={suspicious}       color="#d97706" subtitle="score > 0.3" />
            <KPICard title="Critiques"       value={critical}         color="#dc2626" subtitle="score > 0.6" />
            {mode === 'graph'
              ? <KPICard title="Ghost Fleet" value={ghostFleet}       color="#7c3aed" subtitle="score ≥ 0.8" />
              : <KPICard title="Anomalies"   value={anomalies.length} color="#7c3aed" subtitle="règles + Isolation Forest" />
            }
          </div>

          {ghostFleet > 0 && (
            <div className="bg-[#fee2e2] border border-red-300 rounded-xl px-5 py-4 mb-8 flex items-center gap-3">
              <span className="text-2xl">🚨</span>
              <div>
                <p className="text-[#dc2626] font-bold">
                  {ghostFleet} navire{ghostFleet > 1 ? 's' : ''} identifié{ghostFleet > 1 ? 's' : ''} comme flotte fantôme (score ≥ 0.8)
                </p>
                <p className="text-red-500 text-sm">Action immédiate requise</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
            <div>
              <h2 className="text-lg font-semibold text-[#0f172a] mb-3">Top 10 Navires les Plus Suspects</h2>
              <ShipTable ships={top10} columns={tableColumns} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#0f172a] mb-3">Aperçu Cartographique</h2>
              <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm" style={{ height: 380 }}>
                {ships.length > 0
                  ? <MapPreview ships={ships} />
                  : <div className="flex items-center justify-center h-full text-[#64748b] bg-slate-50">Aucune position disponible</div>
                }
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  )
}
