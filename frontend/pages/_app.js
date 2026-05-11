import { useState, useEffect } from 'react'
import '../styles/globals.css'
import Navbar from '../components/Navbar'
import { ModeContext } from '../lib/supabase'

function ModeBanner({ mode }) {
  if (mode === 'live') {
    return (
      <div className="bg-emerald-900 border-b border-emerald-700 px-4 py-1.5 text-center text-xs text-emerald-300 font-medium">
        LIVE — Donnees temps reel aisstream.io
      </div>
    )
  }
  return (
    <div className="bg-amber-900 border-b border-amber-700 px-4 py-1.5 text-center text-xs text-amber-300 font-medium">
      MODE DEMONSTRATION — Donnees issues des CSV fournis
    </div>
  )
}

export default function App({ Component, pageProps }) {
  const [mode, setMode]   = useState('demo')
  const [toast, setToast] = useState(null)

  // Persist mode in localStorage
  useEffect(() => {
    const saved = localStorage.getItem('ghostfleet_mode')
    if (saved === 'live' || saved === 'demo') setMode(saved)
  }, [])

  const handleSetMode = (newMode) => {
    setMode(newMode)
    localStorage.setItem('ghostfleet_mode', newMode)
    const msg = newMode === 'live'
      ? 'Mode LIVE active — aisstream.io'
      : 'Mode DEMO active'
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  return (
    <ModeContext.Provider value={{ mode, setMode: handleSetMode }}>
      <div className="min-h-screen bg-[#0f172a] text-slate-100">
        <Navbar />
        <ModeBanner mode={mode} />
        <Component {...pageProps} />

        {/* Toast notification */}
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 bg-slate-800 border border-slate-600
                          text-slate-100 text-sm px-4 py-3 rounded-lg shadow-xl
                          animate-pulse">
            {toast}
          </div>
        )}
      </div>
    </ModeContext.Provider>
  )
}
