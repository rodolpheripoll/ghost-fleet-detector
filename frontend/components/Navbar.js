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
                    ? 'bg-emerald-900 border-emerald-600 text-emerald-300 hover:bg-emerald-800'
                    : 'bg-amber-900 border-amber-600 text-amber-300 hover:bg-amber-800'
                  }`}
    >
      {/* Pulsing dot */}
      <span className="relative flex h-2 w-2">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75
                          ${isLive ? 'bg-emerald-400' : 'bg-amber-400'}`} />
        <span className={`relative inline-flex rounded-full h-2 w-2
                          ${isLive ? 'bg-emerald-400' : 'bg-amber-400'}`} />
      </span>
      {isLive ? 'LIVE — aisstream.io' : 'DEMO — Donnees CSV'}
    </button>
  )
}

export default function Navbar() {
  const { pathname } = useRouter()

  return (
    <nav className="bg-[#0f172a] border-b border-slate-700 px-6 py-3
                    flex items-center gap-6 sticky top-0 z-50">
      <span className="text-white font-bold text-lg tracking-tight whitespace-nowrap">
        Ghost Fleet Detector
      </span>

      <div className="flex items-center gap-1 flex-wrap flex-1">
        {NAV_LINKS.map(({ href, label }) => {
          const isActive = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700'
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
