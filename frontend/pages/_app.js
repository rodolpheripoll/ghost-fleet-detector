import { useState, useEffect } from 'react'
import '../styles/globals.css'
import Navbar from '../components/Navbar'
import { ModeContext } from '../lib/supabase'

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
        <Component {...pageProps} />
      </div>
    </ModeContext.Provider>
  )
}
