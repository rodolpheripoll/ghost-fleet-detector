import { useState, useEffect } from 'react'
import '../styles/globals.css'
import 'leaflet/dist/leaflet.css'
import Navbar from '../components/Navbar'
import { ModeContext } from '../lib/supabase'

function ModeBanner({ mode }) {
  if (mode === 'graph') {
    return (
      <div className="bg-[#f5f3ff] border-b border-purple-200 px-4 py-1.5 text-center text-[11px] text-[#7c3aed] font-bold uppercase tracking-wider">
        MODE GRAPH THEORY — Scoring par isolation dans le graphe de proximité (20 nm)
      </div>
    )
  }
  return (
    <div className="bg-[#fffbeb] border-b border-amber-200 px-4 py-1.5 text-center text-[11px] text-amber-700 font-bold uppercase tracking-wider">
      MODE DÉMONSTRATION — Règles métier + Isolation Forest
    </div>
  )
}

export default function App({ Component, pageProps }) {
  const [mode, setMode] = useState('demo')

  useEffect(() => {
    const saved = localStorage.getItem('ghostfleet_mode')
    if (saved === 'graph' || saved === 'demo') setMode(saved)
  }, [])

  const handleSetMode = (newMode) => {
    setMode(newMode)
    localStorage.setItem('ghostfleet_mode', newMode)
  }

  return (
    <ModeContext.Provider value={{ mode, setMode: handleSetMode }}>
      <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--ink)' }}>
        <Navbar />
        <ModeBanner mode={mode} />
        <Component {...pageProps} />
      </div>
    </ModeContext.Provider>
  )
}
