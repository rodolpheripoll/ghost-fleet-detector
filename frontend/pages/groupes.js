import { useEffect, useState, useContext, useRef } from 'react'
import dynamic from 'next/dynamic'
import { supabase, ModeContext } from '../lib/supabase'

const GroupMap = dynamic(() => import('../components/GroupMap'), { ssr: false })

const GROUP_COLORS = [
  [96,165,250],[52,211,153],[244,114,182],[251,191,36],[167,139,250],
  [251,146,60],[56,189,248],[74,222,128],[248,113,113],[232,121,249],
  [103,232,249],[134,239,172],[253,164,175],[217,249,157],[196,181,253],
  [253,186,116],[125,211,252],[110,231,183],[249,168,212],[253,230,138],
]
const ISOLATED_COLOR = [127, 29, 29]

function convoyColor(id) {
  if (!id || id === 0) return ISOLATED_COLOR
  return GROUP_COLORS[(id - 1) % GROUP_COLORS.length]
}
function rgbStr(arr) { return `rgb(${arr[0]},${arr[1]},${arr[2]})` }

function RiskBadge({ value }) {
  const cls =
    value === 'High'   ? 'bg-red-100 text-red-700' :
    value === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                         'bg-green-100 text-green-700'
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>{value ?? 'Low'}</span>
}

export default function GroupesPage() {
  const { mode } = useContext(ModeContext)
  const [convoys,         setConvoys]         = useState([])
  const [ships,           setShips]           = useState([])
  const [edges,           setEdges]           = useState([])
  const [loading,         setLoading]         = useState(true)
  const [error,           setError]           = useState(null)
  const [selectedConvoyId, setSelectedConvoyId] = useState(null)
  const [externalViewState, setExternalViewState] = useState(null)
  const [filter,          setFilter]          = useState('all')
  const [sortBy,          setSortBy]          = useState('size')

  const cardRefs     = useRef({})
  const listRef      = useRef(null)

  useEffect(() => {
    if (mode !== 'graph') return
    setLoading(true)
    setError(null)
    Promise.all([
      supabase.from('convoys').select('*'),
      supabase.from('ships_graph').select('mmsi,latitude,longitude,score,risk_level,convoy_id,convoy_size,convoy_risk'),
      supabase.from('convoy_edges').select('source,target,distance_nm'),
    ]).then(([{ data: c, error: ce }, { data: s, error: se }, { data: e, error: ee }]) => {
      if (ce) throw ce
      if (se) throw se
      if (ee) throw ee
      setConvoys(c ?? [])
      setShips(s ?? [])
      setEdges(e ?? [])
    }).catch(err => setError(err.message)).finally(() => setLoading(false))
  }, [mode])

  const RISK_ORDER = { High: 3, Medium: 2, Low: 1 }

  const displayedConvoys = convoys
    .filter(c => {
      if (filter === 'groups')   return c.size > 1
      if (filter === 'isolated') return c.size === 1
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'size')  return b.size - a.size
      if (sortBy === 'risk')  return (RISK_ORDER[b.convoy_risk] ?? 0) - (RISK_ORDER[a.convoy_risk] ?? 0)
      if (sortBy === 'score') return (b.avg_score ?? 0) - (a.avg_score ?? 0)
      return 0
    })

  const groupCount    = convoys.filter(c => c.size > 1).length
  const isolatedCount = convoys.filter(c => c.size === 1).length
  const highRiskCount = convoys.filter(c => c.convoy_risk === 'High').length
  const ghostCount    = convoys.filter(c => c.contains_ghost_fleet).length

  const handleGroupClick = (convoy) => {
    const newId = selectedConvoyId === convoy.convoy_id ? null : convoy.convoy_id
    setSelectedConvoyId(newId)
    if (newId !== null && convoy.centroid_lat != null) {
      setExternalViewState({
        longitude: convoy.centroid_lon,
        latitude:  convoy.centroid_lat,
        zoom:      convoy.size > 3 ? 5 : 7,
        pitch:     0,
        bearing:   0,
        transitionDuration: 800,
      })
    }
  }

  const handleReset = () => {
    setSelectedConvoyId(null)
    setExternalViewState(null)
  }

  const handleShipClick = (ship) => {
    const cid = ship.convoy_id ?? 0
    setSelectedConvoyId(cid)
    // Scroll left panel to the group card
    const el = cardRefs.current[cid]
    if (el && listRef.current) {
      listRef.current.scrollTo({ top: el.offsetTop - 8, behavior: 'smooth' })
    }
  }

  if (mode !== 'graph') {
    return (
      <main className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-[#64748b] text-sm">
          La page Groupes est disponible uniquement en mode <strong>GRAPH</strong>.
        </p>
      </main>
    )
  }

  return (
    <div className="flex h-[calc(100vh-60px)]">
      {/* ── Left panel ── */}
      <div className="w-[360px] flex-shrink-0 flex flex-col bg-white border-r border-slate-200 overflow-hidden">

        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 bg-[#f5f3ff]">
          <h1 className="text-base font-bold text-[#7c3aed]">Groupes détectés</h1>
          <p className="text-xs text-[#64748b] mt-0.5">Clustering par proximité — seuil 20 nm</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 px-3 py-3 border-b border-slate-200">
          <div className="bg-purple-50 rounded-lg p-2 text-center">
            <p className="text-xl font-bold text-[#7c3aed]">{groupCount}</p>
            <p className="text-xs text-[#64748b]">Groupes</p>
          </div>
          <div className="bg-slate-50 rounded-lg p-2 text-center">
            <p className="text-xl font-bold text-[#0f172a]">{isolatedCount}</p>
            <p className="text-xs text-[#64748b]">Isolés</p>
          </div>
          <div className="bg-red-50 rounded-lg p-2 text-center">
            <p className="text-xl font-bold text-red-600">{highRiskCount}</p>
            <p className="text-xs text-[#64748b]">Risque High</p>
          </div>
          <div className="bg-violet-50 rounded-lg p-2 text-center">
            <p className="text-xl font-bold text-[#7c3aed]">{ghostCount}</p>
            <p className="text-xs text-[#64748b]">Ghost Fleet</p>
          </div>
        </div>

        {/* Explanation */}
        <div className="mx-3 my-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
          <strong>Méthode :</strong> graphe de proximité NetworkX — deux navires sont dans le même groupe
          s&apos;ils se trouvent à moins de 20 nm. Les composantes connexes forment les groupes.
        </div>

        {/* Filters & sort */}
        <div className="px-3 pb-2 flex gap-2 flex-wrap border-b border-slate-200">
          <div className="flex gap-1">
            {[['all','Tous'],['groups','Groupes'],['isolated','Isolés']].map(([v,l]) => (
              <button key={v} onClick={() => setFilter(v)}
                className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                  filter === v ? 'bg-[#7c3aed] text-white border-[#7c3aed]' : 'border-slate-300 text-[#64748b] hover:bg-slate-50'
                }`}
              >{l}</button>
            ))}
          </div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            className="ml-auto text-xs border border-slate-300 rounded px-2 py-1 text-[#64748b] focus:outline-none">
            <option value="size">Taille</option>
            <option value="risk">Risque</option>
            <option value="score">Score</option>
          </select>
        </div>

        {/* Reset button */}
        {selectedConvoyId !== null && (
          <div className="px-3 pt-2">
            <button
              onClick={handleReset}
              className="w-full text-xs px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-50
                         text-[#0f172a] hover:bg-slate-100 transition-colors"
            >
              ← Voir tous les groupes
            </button>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto pt-1" ref={listRef}>
          {loading ? (
            <p className="text-center text-[#64748b] text-sm py-8 animate-pulse">Chargement...</p>
          ) : error ? (
            <p className="text-center text-red-600 text-sm py-8">{error}</p>
          ) : displayedConvoys.length === 0 ? (
            <p className="text-center text-[#64748b] text-sm py-8">Aucun groupe.</p>
          ) : displayedConvoys.map(c => {
            const color      = convoyColor(c.convoy_id)
            const isSelected = selectedConvoyId === c.convoy_id
            return (
              <div
                key={c.convoy_id}
                ref={el => { if (el) cardRefs.current[c.convoy_id] = el }}
                onClick={() => handleGroupClick(c)}
                className={`mx-2 mb-1.5 rounded-xl p-2.5 cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-[#eaf1fb] border-2 border-[#3a6aa8] shadow-sm'
                    : 'bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span style={{ background: rgbStr(color) }}
                    className="w-3 h-3 rounded-full flex-shrink-0" />
                  <span className="font-medium text-sm text-[#0f172a]">
                    {c.convoy_id === 0 ? 'Isolés' : `Groupe ${c.convoy_id}`}
                  </span>
                  <RiskBadge value={c.convoy_risk} />
                  {c.contains_ghost_fleet && (
                    <span className="text-xs text-[#7c3aed] font-bold ml-1">GF</span>
                  )}
                  <span className="ml-auto text-xs text-[#64748b] font-medium">{c.size} nv.</span>
                </div>
                <div className="flex gap-3 mt-1 text-xs text-[#64748b] pl-5">
                  <span>moy. {(c.avg_score ?? 0).toFixed(3)}</span>
                  {c.centroid_lat != null && (
                    <span>{c.centroid_lat.toFixed(1)}°, {c.centroid_lon.toFixed(1)}°</span>
                  )}
                </div>
                {isSelected && c.mmsi_list && (
                  <div className="mt-1.5 pl-5 text-xs text-[#64748b] font-mono break-all">
                    {(() => {
                      try {
                        const list = JSON.parse(c.mmsi_list)
                        return list.slice(0, 6).join(', ') + (list.length > 6 ? ` +${list.length - 6}` : '')
                      } catch { return c.mmsi_list }
                    })()}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Map ── */}
      <div className="flex-1 relative">
        <GroupMap
          ships={ships}
          edges={edges}
          selectedConvoyId={selectedConvoyId}
          externalViewState={externalViewState}
          onShipClick={handleShipClick}
        />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-[999]">
            <span className="text-[#64748b] animate-pulse">Chargement de la carte...</span>
          </div>
        )}
      </div>
    </div>
  )
}
