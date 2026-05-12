import Link from 'next/link'
import { useRouter } from 'next/router'
import { useContext } from 'react'
import { ModeContext } from '../lib/supabase'

const NAV_LINKS = [
  { href: '/',        label: 'Dashboard'  },
  { href: '/carte',   label: 'Carte'      },
  { href: '/analyse', label: 'Analyse'    },
  { href: '/graphe',  label: 'Graphe'     },
  { href: '/rapport', label: 'Rapport'    },
]

function ModeToggle() {
  const { mode, setMode } = useContext(ModeContext)
  const isGraph = mode === 'graph'

  return (
    <div className="flex items-center gap-1 bg-slate-100 rounded-full p-1">
      <button
        onClick={() => setMode('demo')}
        className={`px-3 py-1 rounded-full text-xs font-bold transition-all duration-200 ${
          !isGraph
            ? 'bg-[#0ea5e9] text-white shadow-sm'
            : 'text-[#64748b] hover:text-[#0f172a]'
        }`}
      >
        DEMO — Règles + IA
      </button>
      <button
        onClick={() => setMode('graph')}
        className={`px-3 py-1 rounded-full text-xs font-bold transition-all duration-200 ${
          isGraph
            ? 'bg-[#7c3aed] text-white shadow-sm'
            : 'text-[#64748b] hover:text-[#0f172a]'
        }`}
      >
        GRAPH — Théorie des graphes
      </button>
    </div>
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
