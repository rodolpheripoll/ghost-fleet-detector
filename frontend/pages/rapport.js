import { useEffect, useState, useContext } from 'react'
import { supabase, ModeContext } from '../lib/supabase'
import { useAisStream } from '../lib/useAisStream'

function ScoreBadge({ score }) {
  const s = parseFloat(score) || 0
  let cls = 'bg-emerald-900 text-emerald-300'
  if (s >= 0.8) cls = 'bg-red-950 text-red-300'
  else if (s >= 0.6) cls = 'bg-red-900 text-red-300'
  else if (s >= 0.3) cls = 'bg-amber-900 text-amber-300'
  return <span className={`px-2 py-0.5 rounded text-xs font-bold ${cls}`}>{s.toFixed(2)}</span>
}

function StatCard({ label, value, sub, color = 'text-white' }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
      <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value ?? '—'}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  )
}

function downloadCSV(ships) {
  const cols = ['mmsi','score','risk_level','latitude','longitude','speed','course','status','ais_active','timestamp']
  const header = cols.join(',')
  const rows   = ships.map(s => cols.map(c => {
    const v = s[c]
    if (v == null) return ''
    if (typeof v === 'string' && v.includes(',')) return `"${v}"`
    return v
  }).join(','))
  const csv  = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = 'rapport_flotte_fantome.csv'; a.click()
  URL.revokeObjectURL(url)
}

export default function RapportPage() {
  const { mode }   = useContext(ModeContext)
  const [demoShips,    setDemoShips]    = useState([])
  const [anomalies,    setAnomalies]    = useState([])
  const [demoLoading,  setDemoLoading]  = useState(true)
  const [pdfLoading,   setPdfLoading]   = useState(false)
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

  const suspicious = ships.filter(s => s.score > 0.3)
  const critical   = ships.filter(s => s.score > 0.6)
  const ghostFleet = ships.filter(s => s.score >= 0.8)
  const ruleAnom   = anomalies.filter(a => a.detected_by === 'rule' || a.detected_by === 'both')
  const mlAnom     = anomalies.filter(a => a.detected_by === 'isolation_forest' || a.detected_by === 'both')

  const typeCounts = {}
  anomalies.forEach(a => { typeCounts[a.type] = (typeCounts[a.type] ?? 0) + 1 })

  const handleDownloadPDF = async () => {
    setPdfLoading(true)
    try {
      const res = await fetch('/api/download-report')
      if (!res.ok) throw new Error(await res.text())
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = 'rapport_flotte_fantome.pdf'; a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(`Erreur PDF : ${err.message}`)
    } finally {
      setPdfLoading(false)
    }
  }

  if (loading) return (
    <main className="max-w-7xl mx-auto px-4 py-8 text-slate-400 animate-pulse">
      {mode === 'live' ? 'Connexion a aisstream.io...' : 'Chargement du rapport...'}
    </main>
  )

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Rapport — Flotte Fantome</h1>
          <p className="text-slate-400 text-sm mt-1">
            {mode === 'live' ? `Donnees temps reel aisstream.io — ${ships.length} navires` : 'Synthese de la detection CSV pipeline'}
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => downloadCSV(suspicious)}
            className="bg-blue-700 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            Telecharger CSV
          </button>
          {mode === 'demo' && (
            <button onClick={handleDownloadPDF} disabled={pdfLoading}
              className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              {pdfLoading ? 'Generation...' : 'Telecharger PDF'}
            </button>
          )}
        </div>
      </div>

      {err && (
        <div className="bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-4 py-3 mb-6 text-sm">
          {err}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <StatCard label="Navires"      value={ships.length}      color="text-blue-400" />
        <StatCard label="Suspects"     value={suspicious.length} color="text-amber-400" sub="score > 0.3" />
        <StatCard label="Critiques"    value={critical.length}   color="text-red-400"   sub="score > 0.6" />
        <StatCard label="Ghost Fleet"  value={ghostFleet.length} color="text-red-300"   sub="score ≥ 0.8" />
        <StatCard label="Regles"       value={ruleAnom.length}   color="text-purple-400" />
        <StatCard label="ML"           value={mlAnom.length}     color="text-indigo-400" />
      </div>

      {Object.keys(typeCounts).length > 0 && (
        <section className="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-8">
          <h2 className="text-base font-semibold text-white mb-4">Repartition par type d&apos;anomalie</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(typeCounts).map(([type, cnt]) => (
              <div key={type} className="bg-slate-900 rounded-lg px-4 py-3">
                <p className="text-slate-400 text-xs mb-1">{type}</p>
                <p className="text-white font-bold text-xl">{cnt}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bg-slate-800 border border-slate-700 rounded-xl p-5 mb-8">
        <h2 className="text-base font-semibold text-white mb-3">Qualite des donnees</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="bg-slate-900 rounded-lg p-3">
            <p className="text-slate-500 text-xs mb-1">Positions AIS en base</p>
            <p className="text-white font-bold">{ships.length}</p>
          </div>
          <div className="bg-slate-900 rounded-lg p-3">
            <p className="text-slate-500 text-xs mb-1">AIS desactive</p>
            <p className="text-white font-bold">{ships.filter(s => !s.ais_active).length}</p>
          </div>
          <div className="bg-slate-900 rounded-lg p-3">
            <p className="text-slate-500 text-xs mb-1">MMSI FAKE-</p>
            <p className="text-white font-bold">{ships.filter(s => String(s.mmsi).startsWith('FAKE-')).length}</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-white mb-4">
          Navires avec score &gt; 0.3 ({suspicious.length})
        </h2>
        {suspicious.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center text-slate-400">
            Aucun navire suspect. {mode === 'demo' ? 'Lancez le pipeline Python pour alimenter la base.' : 'Les navires live ont tous un score normal (pas de scoring ML en temps reel).'}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-700">
            <table className="w-full text-sm text-slate-300">
              <thead className="bg-slate-900 text-slate-400 uppercase text-xs">
                <tr>
                  {['#','MMSI','Score','Risque','Lat','Lon','Vitesse','AIS actif','Timestamp'].map(h => (
                    <th key={h} className="px-4 py-3 text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {suspicious.map((ship, i) => (
                  <tr key={ship.mmsi} className="border-t border-slate-700 hover:bg-slate-700 transition-colors">
                    <td className="px-4 py-2.5 text-slate-500">{i+1}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{ship.mmsi}</td>
                    <td className="px-4 py-2.5"><ScoreBadge score={ship.score} /></td>
                    <td className="px-4 py-2.5">
                      <span className={ship.risk_level === 'Ghost Fleet' ? 'text-red-300' : ship.risk_level === 'Critical' ? 'text-red-400' : ship.risk_level === 'Suspect' ? 'text-amber-400' : 'text-emerald-400'}>
                        {ship.risk_level}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">{ship.latitude?.toFixed(4) ?? 'N/A'}</td>
                    <td className="px-4 py-2.5">{ship.longitude?.toFixed(4) ?? 'N/A'}</td>
                    <td className="px-4 py-2.5">{ship.speed != null ? `${ship.speed} kn` : 'N/A'}</td>
                    <td className="px-4 py-2.5"><span className={ship.ais_active ? 'text-emerald-400' : 'text-red-400'}>{ship.ais_active ? 'Oui' : 'Non'}</span></td>
                    <td className="px-4 py-2.5 text-xs text-slate-400 whitespace-nowrap">
                      {ship.timestamp ? new Date(ship.timestamp).toLocaleString('fr-FR') : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
