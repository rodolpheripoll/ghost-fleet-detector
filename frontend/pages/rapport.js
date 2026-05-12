import { useEffect, useState, useContext } from 'react'
import { supabase, ModeContext } from '../lib/supabase'
import { useAisStream } from '../lib/useAisStream'

function RiskBadge({ value }) {
  const v = value ?? 'Normal'
  const cls =
    v === 'Ghost Fleet' ? 'bg-[#ede9fe] text-[#7c3aed]' :
    v === 'Critical'    ? 'bg-[#fee2e2] text-[#dc2626]' :
    v === 'Suspect'     ? 'bg-[#fef3c7] text-[#d97706]' :
                          'bg-[#dcfce7] text-[#16a34a]'
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{v}</span>
}

function StatCard({ label, value, sub, color = '#0ea5e9' }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm" style={{ borderLeft: `4px solid ${color}` }}>
      <p className="text-[#64748b] text-xs uppercase tracking-wide mb-1">{label}</p>
      <p className="text-3xl font-bold" style={{ color }}>{value ?? '—'}</p>
      {sub && <p className="text-[#64748b] text-xs mt-1">{sub}</p>}
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
    <main className="max-w-7xl mx-auto px-4 py-8 text-[#64748b] animate-pulse">
      {mode === 'live' ? 'Connexion à aisstream.io...' : 'Chargement du rapport...'}
    </main>
  )

  return (
    <main className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-[#0f172a]">Rapport — Flotte Fantôme</h1>
          <p className="text-[#64748b] text-sm mt-1">
            {mode === 'live' ? `Données temps réel aisstream.io — ${ships.length} navires` : 'Synthèse de la détection CSV pipeline'}
          </p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => downloadCSV(suspicious)}
            className="bg-[#0ea5e9] hover:bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm">
            Télécharger CSV
          </button>
          {mode === 'demo' && (
            <button onClick={handleDownloadPDF} disabled={pdfLoading}
              className="bg-white border border-slate-300 hover:bg-slate-50 text-[#0f172a] px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50">
              {pdfLoading ? 'Génération...' : 'Télécharger PDF'}
            </button>
          )}
        </div>
      </div>

      {err && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-6 text-sm">
          {err}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <StatCard label="Navires"     value={ships.length}      color="#0ea5e9" />
        <StatCard label="Suspects"    value={suspicious.length} color="#d97706" sub="score > 0.3" />
        <StatCard label="Critiques"   value={critical.length}   color="#dc2626" sub="score > 0.6" />
        <StatCard label="Ghost Fleet" value={ghostFleet.length} color="#7c3aed" sub="score ≥ 0.8" />
        <StatCard label="Règles"      value={ruleAnom.length}   color="#0ea5e9" />
        <StatCard label="ML"          value={mlAnom.length}     color="#8b5cf6" />
      </div>

      {Object.keys(typeCounts).length > 0 && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 mb-8 shadow-sm">
          <h2 className="text-base font-semibold text-[#0f172a] mb-4">Répartition par type d&apos;anomalie</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(typeCounts).map(([type, cnt]) => (
              <div key={type} className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                <p className="text-[#64748b] text-xs mb-1">{type}</p>
                <p className="text-[#0f172a] font-bold text-xl">{cnt}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bg-white border border-slate-200 rounded-xl p-5 mb-8 shadow-sm">
        <h2 className="text-base font-semibold text-[#0f172a] mb-3">Qualité des données</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="text-[#64748b] text-xs mb-1">Positions AIS en base</p>
            <p className="text-[#0f172a] font-bold">{ships.length}</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="text-[#64748b] text-xs mb-1">AIS désactivé</p>
            <p className="text-[#0f172a] font-bold">{ships.filter(s => !s.ais_active).length}</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <p className="text-[#64748b] text-xs mb-1">MMSI FAKE-</p>
            <p className="text-[#0f172a] font-bold">{ships.filter(s => String(s.mmsi).startsWith('FAKE-')).length}</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-[#0f172a] mb-4">
          Navires avec score &gt; 0.3 ({suspicious.length})
        </h2>
        {suspicious.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-[#64748b]">
            Aucun navire suspect. {mode === 'demo' ? 'Lancez le pipeline Python pour alimenter la base.' : 'Les navires live ont tous un score normal (pas de scoring ML en temps réel).'}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
            <table className="w-full text-sm text-[#0f172a]">
              <thead className="bg-slate-50 text-[#64748b] uppercase text-xs border-b border-slate-200">
                <tr>
                  {['#','MMSI','Score','Risque','Lat','Lon','Vitesse','AIS actif','Timestamp'].map(h => (
                    <th key={h} className="px-4 py-3 text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white">
                {suspicious.map((ship, i) => (
                  <tr key={ship.mmsi} className="border-t border-slate-100 hover:bg-[#f0f9ff] transition-colors">
                    <td className="px-4 py-2.5 text-[#64748b]">{i+1}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{ship.mmsi}</td>
                    <td className="px-4 py-2.5 font-semibold">{(parseFloat(ship.score) || 0).toFixed(2)}</td>
                    <td className="px-4 py-2.5"><RiskBadge value={ship.risk_level} /></td>
                    <td className="px-4 py-2.5">{ship.latitude?.toFixed(4) ?? 'N/A'}</td>
                    <td className="px-4 py-2.5">{ship.longitude?.toFixed(4) ?? 'N/A'}</td>
                    <td className="px-4 py-2.5">{ship.speed != null ? `${ship.speed} kn` : 'N/A'}</td>
                    <td className="px-4 py-2.5">
                      <span className={ship.ais_active ? 'text-[#16a34a] font-medium' : 'text-[#dc2626] font-medium'}>
                        {ship.ais_active ? 'Oui' : 'Non'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[#64748b] whitespace-nowrap">
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
