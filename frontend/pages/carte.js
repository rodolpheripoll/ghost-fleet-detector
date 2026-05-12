import { useEffect, useState, useContext } from 'react'
import dynamic from 'next/dynamic'
import { supabase, ModeContext } from '../lib/supabase'
import { useAisStream } from '../lib/useAisStream'

const FullMap = dynamic(() => import('../components/FullMap'), { ssr: false })

export default function CartePage() {
  const { mode }      = useContext(ModeContext)
  const [demoShips,   setDemoShips]  = useState([])
  const [zones,       setZones]      = useState([])
  const [demoLoading, setDemoLoading] = useState(true)
  const [search,      setSearch]     = useState('')
  const [demoError,   setDemoError]  = useState(null)

  const { ships: liveShips, status: liveStatus, error: liveError } = useAisStream(mode === 'live')

  useEffect(() => {
    if (mode !== 'demo') return
    setDemoLoading(true)
    setDemoError(null)
    Promise.all([
      supabase.from('ships').select('*'),
      supabase.from('risk_zones').select('*'),
    ]).then(([{ data: s, error: se }, { data: z, error: ze }]) => {
      if (se) throw se
      if (ze) throw ze
      setDemoShips(s ?? [])
      setZones(z ?? [])
    }).catch(e => setDemoError(e.message)).finally(() => setDemoLoading(false))
  }, [mode])

  const ships = mode === 'live' ? liveShips : demoShips
  const error = mode === 'live' ? liveError  : demoError

  const showOverlay = mode === 'live'
    ? (liveStatus === 'idle' || liveStatus === 'connecting') && liveShips.length === 0
    : demoLoading

  const filteredShips = search.trim()
    ? ships.filter(s => String(s.mmsi).toLowerCase().includes(search.toLowerCase()))
    : ships

  return (
    <div className="flex flex-col h-[calc(100vh-80px)]">
      {/* Toolbar */}
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

        {mode === 'live' && (
          <span className={`text-xs px-2 py-1 rounded-full border ${
            liveStatus === 'live'         ? 'text-green-700 border-green-300 bg-green-50' :
            liveStatus === 'reconnecting' ? 'text-amber-700 border-amber-300 bg-amber-50' :
            liveStatus === 'error'        ? 'text-red-700 border-red-300 bg-red-50' :
                                            'text-amber-700 border-amber-300 bg-amber-50'
          }`}>
            {liveStatus === 'live'         ? `LIVE — ${ships.length} navires` :
             liveStatus === 'reconnecting' ? 'Reconnexion...' :
             liveStatus === 'error'        ? 'Erreur connexion' : 'Connexion...'}
          </span>
        )}

        {error && <span className="text-red-600 text-xs">Erreur : {error}</span>}
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <FullMap ships={filteredShips} zones={zones} />

        {showOverlay && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-[999]">
            <span className="text-[#64748b] animate-pulse">
              {mode === 'live' ? 'Connexion à aisstream.io...' : 'Chargement de la carte...'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
