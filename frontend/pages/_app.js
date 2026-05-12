import { useState, useEffect } from 'react'
import '../styles/globals.css'
import Navbar from '../components/Navbar'
import { ModeContext } from '../lib/supabase'

function ModeBanner({ mode }) {
  if (mode === 'graph') {
    return (
      <div className="bg-[#f5f3ff] border-b border-purple-200 px-4 py-1.5 text-center text-xs text-[#7c3aed] font-medium">
        🔮 MODE GRAPH THEORY — Scoring par isolation dans le graphe de proximité (20 nm)
      </div>
    )
  }
  return (
    <div className="bg-[#fffbeb] border-b border-amber-200 px-4 py-1.5 text-center text-xs text-amber-700 font-medium">
      ⚠️ MODE DÉMONSTRATION — Règles métier + Isolation Forest
    </div>
  )
}

export default function App({ Component, pageProps }) {
  const [mode, setMode]   = useState('demo')
  const [toast, setToast] = useState(null)

  useEffect(() => {
    const saved = localStorage.getItem('ghostfleet_mode')
    if (saved === 'graph' || saved === 'demo') setMode(saved)
  }, [])

  const handleSetMode = (newMode) => {
    setMode(newMode)
    localStorage.setItem('ghostfleet_mode', newMode)
    const msg = newMode === 'graph'
      ? 'Mode Graph Theory activé'
      : 'Mode Demo activé'
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  return (
    <ModeContext.Provider value={{ mode, setMode: handleSetMode }}>
      <div className="min-h-screen bg-[#f8fafc] text-[#0f172a]">
        <Navbar />
        <ModeBanner mode={mode} />
        <Component {...pageProps} />

        {toast && (
          <div className="fixed bottom-6 right-6 z-50 bg-white border border-slate-200
                          text-slate-700 text-sm px-4 py-3 rounded-lg shadow-xl">
            {toast}
          </div>
        )}
      </div>
    </ModeContext.Provider>
  )
}
