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

  // In LIVE mode: show overlay only while first connecting (not on reconnects)
  const showOverlay = mode === 'live'
    ? (liveStatus === 'idle' || liveStatus === 'connecting') && liveShips.length === 0
    : demoLoading

  const filteredShips = search.trim()
    ? ships.filter(s => String(s.mmsi).toLowerCase().includes(search.toLowerCase()))
    : ships

  return (
    <div className="flex flex-col h-[calc(100vh-80px)]">
      {/* Toolbar */}
      <div className="bg-[#0f172a] border-b border-slate-700 px-4 py-2 flex items-center gap-4 flex-shrink-0">
        <input
          type="text"
          placeholder="Filtrer par MMSI..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-slate-800 border border-slate-600 text-slate-200 rounded px-3 py-1.5
                     text-sm w-64 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <span className="text-slate-400 text-xs">
          {filteredShips.length} navire{filteredShips.length !== 1 ? 's' : ''} affiché{filteredShips.length !== 1 ? 's' : ''}
        </span>

        {mode === 'live' && (
          <span className={`text-xs px-2 py-1 rounded-full border ${
            liveStatus === 'live'         ? 'text-emerald-400 border-emerald-800 bg-emerald-900/30' :
            liveStatus === 'reconnecting' ? 'text-amber-400 border-amber-800 bg-amber-900/30' :
            liveStatus === 'error'        ? 'text-red-400 border-red-800 bg-red-900/30' :
                                            'text-amber-400 border-amber-800 bg-amber-900/30'
          }`}>
            {liveStatus === 'live'         ? `LIVE — ${ships.length} navires` :
             liveStatus === 'reconnecting' ? 'Reconnexion...' :
             liveStatus === 'error'        ? 'Erreur connexion' : 'Connexion...'}
          </span>
        )}

        {error && <span className="text-red-400 text-xs">Erreur : {error}</span>}
      </div>

      {/* Map — always mounted so Leaflet is never destroyed on reconnect */}
      <div className="flex-1 relative">
        <FullMap ships={filteredShips} zones={zones} />

        {/* Loading overlay — shown on top, does not unmount the map */}
        {showOverlay && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0f172a] z-[999]">
            <span className="text-slate-400 animate-pulse">
              {mode === 'live' ? 'Connexion a aisstream.io...' : 'Chargement de la carte...'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
