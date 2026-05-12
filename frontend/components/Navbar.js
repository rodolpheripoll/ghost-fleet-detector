import Link from 'next/link'
import { useRouter } from 'next/router'
import { useContext } from 'react'
import { ModeContext } from '../lib/supabase'

const LINKS = [
  { href: '/',        label: 'Dashboard',  graphOnly: false },
  { href: '/carte',   label: 'Carte 2D',   graphOnly: false },
  { href: '/analyse', label: 'Analyse ML', graphOnly: false },
  { href: '/graphe',  label: 'Graphe',     graphOnly: false },
  { href: '/convois', label: 'Convois',    graphOnly: true  },
  { href: '/rapport', label: 'Rapport',    graphOnly: false },
]

export default function Navbar() {
  const router            = useRouter()
  const { mode, setMode } = useContext(ModeContext)

  return (
    <header className="bg-[#0b1530] text-white sticky top-0 z-50">
      <div className="px-8 h-16 flex items-center gap-10">

        {/* Brand */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-lg">🚢</div>
          <div className="leading-tight">
            <div className="font-extrabold tracking-tight text-[15.5px]">GHOST FLEET DETECTOR</div>
            <div className="mono text-[10.5px] text-[#9fb0c8] tracking-[.14em]">MINISTÈRE DES ARMÉES · DRM</div>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          {LINKS.filter(l => !l.graphOnly || mode === 'graph').map(({ href, label }) => (
            <Link key={href} href={href} className={`nav-link${router.pathname === href ? ' active' : ''}`}>
              {label}
            </Link>
          ))}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-4">
          {/* Search */}
          <div className="hidden lg:flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 w-72">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="2" className="shrink-0">
              <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
            </svg>
            <input className="bg-transparent outline-none w-full text-[13px] text-white placeholder-white/40" placeholder="Rechercher MMSI, navire, opérateur…" />
            <span className="mono text-[10px] text-white/40 border border-white/15 rounded px-1.5 py-0.5">⌘ K</span>
          </div>

          {/* DEMO / GRAPH */}
          <div className="pill-toggle">
            <button className={mode === 'demo'  ? 'active' : ''} onClick={() => setMode('demo')}>DEMO</button>
            <button className={mode === 'graph' ? 'active' : ''} onClick={() => setMode('graph')}>GRAPH</button>
          </div>

          {/* Alerts */}
          <button className="relative w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center" aria-label="Alertes">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9Z"/>
              <path d="M10 21a2 2 0 0 0 4 0"/>
            </svg>
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#ef4444] text-[10px] flex items-center justify-center font-bold">7</span>
          </button>

          {/* User */}
          <div className="flex items-center gap-2.5 pl-3 border-l border-white/10">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3a6aa8] to-[#1e3a5f] flex items-center justify-center text-[12px] font-bold">CV</div>
            <div className="leading-tight">
              <div className="text-[12.5px] font-semibold">C. Vasseur</div>
              <div className="text-[10.5px] text-[#9fb0c8]">Analyste senior</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
