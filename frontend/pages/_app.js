import { useState, useEffect } from 'react'
import '../styles/globals.css'
import Navbar from '../components/Navbar'
import { ModeContext } from '../lib/supabase'

function ModeBanner({ mode, shipCount, liveStatus }) {
  if (mode === 'live') {
    return (
      <div className="bg-[#f0fdf4] border-b border-green-200 px-4 py-1.5 text-center text-xs text-green-700 font-medium">
        🟢 MODE LIVE — aisstream.io
        {liveStatus === 'live' && shipCount > 0 ? ` — ${shipCount} navires reçus` : ''}
      </div>
    )
  }
  return (
    <div className="bg-[#fffbeb] border-b border-amber-200 px-4 py-1.5 text-center text-xs text-amber-700 font-medium">
      ⚠️ MODE DÉMONSTRATION — Données Généralisation Hackathon
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
      ? 'Mode LIVE activé — aisstream.io'
      : 'Mode DEMO activé'
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  return (
    <ModeContext.Provider value={{ mode, setMode: handleSetMode }}>
      <div className="min-h-screen bg-[#f8fafc] text-[#0f172a]">
        <Navbar />
        <ModeBanner mode={mode} />
        <Component {...pageProps} />

        {/* Toast notification */}
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
