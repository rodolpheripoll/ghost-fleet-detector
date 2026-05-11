import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '../lib/supabase'

// Leaflet must be client-side only
const FullMap = dynamic(() => import('../components/FullMap'), { ssr: false })

export default function CartePage() {
  const [ships,   setShips]   = useState([])
  const [zones,   setZones]   = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [error,   setError]   = useState(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const [{ data: s, error: se }, { data: z, error: ze }] = await Promise.all([
          supabase.from('ships').select('*'),
          supabase.from('risk_zones').select('*'),
        ])
        if (se) throw se
        if (ze) throw ze
        setShips(s ?? [])
        setZones(z ?? [])
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const filteredShips = search.trim()
    ? ships.filter(s => String(s.mmsi).toLowerCase().includes(search.toLowerCase()))
    : ships

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      {/* Toolbar */}
      <div className="bg-[#0f172a] border-b border-slate-700 px-4 py-2 flex items-center gap-4 flex-shrink-0">
        <input
          type="text"
          placeholder="Filtrer par MMSI..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-slate-800 border border-slate-600 text-slate-200 rounded px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <span className="text-slate-400 text-xs">
          {filteredShips.length} navire{filteredShips.length !== 1 ? 's' : ''} affiche{filteredShips.length !== 1 ? 's' : ''}
        </span>
        {error && (
          <span className="text-red-400 text-xs">Erreur : {error}</span>
        )}
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            Chargement de la carte...
          </div>
        ) : (
          <FullMap ships={filteredShips} zones={zones} />
        )}
      </div>
    </div>
  )
}
