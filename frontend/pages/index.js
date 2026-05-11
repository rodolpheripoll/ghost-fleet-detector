import { useEffect, useState, useContext } from 'react'
import dynamic from 'next/dynamic'
import { supabase, ModeContext } from '../lib/supabase'
import { useAisStream } from '../lib/useAisStream'
import KPICard from '../components/KPICard'
import ShipTable from '../components/ShipTable'

const MapPreview = dynamic(() => import('../components/MapPreview'), { ssr: false })

function ScoreBadge({ score }) {
  const s = parseFloat(score) || 0
  let cls = 'bg-emerald-900 text-emerald-300'
  if (s >= 0.8) cls = 'bg-red-950 text-red-300'
  else if (s >= 0.6) cls = 'bg-red-900 text-red-300'
  else if (s >= 0.3) cls = 'bg-amber-900 text-amber-300'
  return <span className={`px-2 py-0.5 rounded text-xs font-bold ${cls}`}>{s.toFixed(2)}</span>
}

export default function Dashboard() {
  const { mode }       = useContext(ModeContext)
  const [demoShips,    setDemoShips]    = useState([])
  const [anomalies,    setAnomalies]    = useState([])
  const [demoLoading,  setDemoLoading]  = useState(true)
  const [error,        setError]        = useState(null)

  const { ships: liveShips, status: liveStatus, error: liveError } = useAisStream(mode === 'live')

  useEffect(() => {
    if (mode !== 'demo') return
    setDemoLoading(true)
    setError(null)
    Promise.all([
      supabase.from('ships').select('*').order('score', { ascending: false }),
      supabase.from('anomalies').select('*'),
    ]).then(([{ data: s, error: se }, { data: a, error: ae }]) => {
      if (se) throw se
      if (ae) throw ae
      setDemoShips(s ?? [])
      setAnomalies(a ?? [])
    }).catch(e => setError(e.message)).finally(() => setDemoLoading(false))
  }, [mode])

  const ships   = mode === 'live' ? liveShips : demoShips
  const loading = mode === 'live' ? liveStatus === 'connecting' : demoLoading
  const err     = mode === 'live' ? liveError : error

  const suspicious = ships.filter(s => s.score > 0.3).length
  const critical   = ships.filter(s => s.score > 0.6).length
  const ghostFleet = ships.filter(s => s.score >= 0.8).length
  const top10      = ships.slice(0, 10)

  const tableColumns = [
    { key: 'mmsi',       label: 'MMSI' },
    { key: 'score',      label: 'Score',     render: v => <ScoreBadge score={v} /> },
    { key: 'risk_level', label: 'Risque' },
    { key: 'latitude',   label: 'Lat',       render: v => v?.toFixed(4) ?? 'N/A' },
    { key: 'longitude',  label: 'Lon',       render: v => v?.toFixed(4) ?? 'N/A' },
    { key: 'speed',      label: 'Vitesse',   render: v => v != null ? `${v} kn` : 'N/A' },
    { key: 'timestamp',  label: 'Timestamp', render: v => v ? new Date(v).toLocaleString('fr-FR') : 'N/A' },
  ]

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">
          Ghost Fleet Detection — AIS Maritime Intelligence
        </h1>
        <p className="text-slate-400 mt-1 text-sm">
          {mode === 'live'
            ? `Donnees temps reel — aisstream.io (${liveStatus === 'live' ? ships.length + ' navires' : liveStatus})`
            : 'Donnees statiques — pipeline CSV'}
        </p>
      </div>

      {err && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 mb-6 text-sm">
          {err}
        </div>
      )}

      {loading ? (
        <div className="text-slate-400 animate-pulse">
          {mode === 'live' ? 'Connexion a aisstream.io...' : 'Chargement des donnees...'}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <KPICard title="Navires totaux"  value={ships.length}     icon="🚢" color="text-blue-400"   subtitle="positions uniques MMSI" />
            <KPICard title="Suspects"        value={suspicious}       icon="⚠️" color="text-amber-400"  subtitle="score > 0.3" />
            <KPICard title="Critiques"       value={critical}         icon="🔴" color="text-red-400"    subtitle="score > 0.6" />
            <KPICard title="Anomalies"       value={anomalies.length} icon="🔍" color="text-purple-400" subtitle="regles + Isolation Forest" />
          </div>

          {ghostFleet > 0 && (
            <div className="bg-red-950 border border-red-700 rounded-xl px-5 py-4 mb-8 flex items-center gap-3">
              <span className="text-2xl">🚨</span>
              <div>
                <p className="text-red-300 font-bold">
                  {ghostFleet} navire{ghostFleet > 1 ? 's' : ''} identifie{ghostFleet > 1 ? 's' : ''} comme flotte fantome (score ≥ 0.8)
                </p>
                <p className="text-red-400 text-sm">Action immediate requise</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
            <div>
              <h2 className="text-lg font-semibold text-white mb-3">Top 10 Navires les Plus Suspects</h2>
              <ShipTable ships={top10} columns={tableColumns} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white mb-3">Apercu Cartographique</h2>
              <div className="rounded-xl overflow-hidden border border-slate-700" style={{ height: 380 }}>
                {ships.length > 0
                  ? <MapPreview ships={ships} />
                  : <div className="flex items-center justify-center h-full text-slate-500 bg-slate-800">Aucune position disponible</div>
                }
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  )
}
