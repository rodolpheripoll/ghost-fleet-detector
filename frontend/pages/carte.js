import { useEffect, useState, useContext, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { supabase, ModeContext } from '../lib/supabase'

const FullMap = dynamic(() => import('../components/FullMap'), { ssr: false })

const LIVE_REFRESH_INTERVAL = 30000  // 30 seconds

export default function CartePage() {
  const { mode }  = useContext(ModeContext)
  const [ships,   setShips]   = useState([])
  const [zones,   setZones]   = useState([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState('')
  const [error,   setError]   = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [secondsAgo,  setSecondsAgo]  = useState(0)

  async function fetchFromSupabase() {
    const [{ data: s, error: se }, { data: z, error: ze }] = await Promise.all([
      supabase.from('ships').select('*'),
      supabase.from('risk_zones').select('*'),
    ])
    if (se) throw se
    if (ze) throw ze
    setShips(s ?? [])
    setZones(z ?? [])
  }

  async function fetchLiveData() {
    const res = await fetch('/api/live-ships')
    if (!res.ok) throw new Error(await res.text())
    const data = await res.json()
    setShips(data)
    setLastUpdated(new Date())
  }

  const refresh = useCallback(() => {
    setError(null)
    const fn = mode === 'demo' ? fetchFromSupabase : fetchLiveData
    fn().catch(e => setError(e.message)).finally(() => setLoading(false))
  }, [mode])

  // Initial load + mode change
  useEffect(() => {
    setLoading(true)
    setLastUpdated(null)
    refresh()
  }, [mode])

  // Auto-refresh every 30s in LIVE mode
  useEffect(() => {
    if (mode !== 'live') return
    const interval = setInterval(refresh, LIVE_REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [mode, refresh])

  // "Last updated X seconds ago" counter
  useEffect(() => {
    if (!lastUpdated) return
    const tick = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(tick)
  }, [lastUpdated])

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
          <>
            <button
              onClick={refresh}
              className="bg-emerald-800 hover:bg-emerald-700 text-emerald-300 text-xs px-3 py-1.5
                         rounded transition-colors"
            >
              Actualiser
            </button>
            {lastUpdated && (
              <span className="text-emerald-500 text-xs">
                Mis a jour il y a {secondsAgo}s — actualisation auto dans {Math.max(0, 30 - secondsAgo)}s
              </span>
            )}
          </>
        )}

        {error && <span className="text-red-400 text-xs">Erreur : {error}</span>}
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            {mode === 'live' ? 'Connexion a aisstream.io...' : 'Chargement de la carte...'}
          </div>
        ) : (
          <FullMap ships={filteredShips} zones={zones} />
        )}
      </div>
    </div>
  )
}
