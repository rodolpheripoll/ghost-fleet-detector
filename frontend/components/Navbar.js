import Link from 'next/link'
import { useRouter } from 'next/router'
import { useContext } from 'react'
import { ModeContext } from '../lib/supabase'

const NAV_LINKS = [
  { href: '/',        label: 'Dashboard'  },
  { href: '/carte',   label: 'Carte'      },
  { href: '/analyse', label: 'Analyse ML' },
  { href: '/graphe',  label: 'Graphe'     },
  { href: '/rapport', label: 'Rapport'    },
]

function ModeToggle() {
  const { mode, setMode } = useContext(ModeContext)
  const isLive = mode === 'live'

  return (
    <button
      onClick={() => setMode(isLive ? 'demo' : 'live')}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold
                  border transition-all duration-300 select-none
                  ${isLive
                    ? 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
                    : 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
                  }`}
    >
      <span className="relative flex h-2 w-2">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75
                          ${isLive ? 'bg-green-500' : 'bg-amber-500'}`} />
        <span className={`relative inline-flex rounded-full h-2 w-2
                          ${isLive ? 'bg-green-500' : 'bg-amber-500'}`} />
      </span>
      {isLive ? 'LIVE — aisstream.io' : 'DEMO — Données CSV'}
    </button>
  )
}

export default function Navbar() {
  const { pathname } = useRouter()

  return (
    <nav className="bg-white border-b border-[#e2e8f0] px-6 py-3
                    flex items-center gap-6 sticky top-0 z-50 shadow-sm">
      <span className="text-[#0f172a] font-bold text-lg tracking-tight whitespace-nowrap">
        🚢 Ghost Fleet Detector
      </span>

      <div className="flex items-center gap-1 flex-wrap flex-1">
        {NAV_LINKS.map(({ href, label }) => {
          const isActive = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[#f0f9ff] text-[#0ea5e9] font-semibold'
                  : 'text-[#64748b] hover:text-[#0f172a] hover:bg-slate-100'
              }`}
            >
              {label}
            </Link>
          )
        })}
      </div>

      <ModeToggle />
    </nav>
  )
}
