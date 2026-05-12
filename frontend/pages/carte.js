import { useEffect, useState, useContext } from 'react'
import dynamic from 'next/dynamic'
import { supabase, ModeContext } from '../lib/supabase'

const FullMap = dynamic(() => import('../components/FullMap'), { ssr: false })

export default function CartePage() {
  const { mode }    = useContext(ModeContext)
  const [ships,     setShips]   = useState([])
  const [zones,     setZones]   = useState([])
  const [loading,   setLoading] = useState(true)
  const [search,    setSearch]  = useState('')
  const [error,     setError]   = useState(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    const table = mode === 'graph' ? 'ships_graph' : 'ships'
    Promise.all([
      supabase.from(table).select('*'),
      supabase.from('risk_zones').select('*'),
    ]).then(([{ data: s, error: se }, { data: z, error: ze }]) => {
      if (se) throw se
      if (ze) throw ze
      setShips(s ?? [])
      setZones(z ?? [])
    }).catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [mode])

  const filteredShips = search.trim()
    ? ships.filter(s => String(s.mmsi).toLowerCase().includes(search.toLowerCase()))
    : ships

  return (
    <div className="flex flex-col h-[calc(100vh-80px)]">
      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-4 flex-shrink-0">
        <input
          type="text"
          placeholder="Rechercher par MMSI..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-white border border-slate-300 text-[#0f172a] rounded px-3 py-1.5
                     text-sm w-64 focus:outline-none focus:ring-2 focus:ring-[#0ea5e9]"
        />
        <span className="text-[#64748b] text-xs">
          {filteredShips.length} navire{filteredShips.length !== 1 ? 's' : ''} affiché{filteredShips.length !== 1 ? 's' : ''}
        </span>
        {mode === 'graph' && (
          <span className="text-xs px-2 py-1 rounded-full bg-[#f5f3ff] border border-purple-200 text-[#7c3aed] font-medium">
            🔮 GRAPH — ships_graph
          </span>
        )}
        {error && <span className="text-red-600 text-xs">Erreur : {error}</span>}
      </div>

      <div className="flex-1 relative">
        <FullMap ships={filteredShips} zones={zones} mode={mode} />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-[999]">
            <span className="text-[#64748b] animate-pulse">Chargement de la carte...</span>
          </div>
        )}
      </div>
    </div>
  )
}
