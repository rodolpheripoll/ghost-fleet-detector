import Link from 'next/link'
import { useRouter } from 'next/router'

const NAV_LINKS = [
  { href: '/',        label: 'Dashboard'   },
  { href: '/carte',   label: 'Carte'       },
  { href: '/analyse', label: 'Analyse ML'  },
  { href: '/graphe',  label: 'Graphe'      },
  { href: '/rapport', label: 'Rapport'     },
]

export default function Navbar() {
  const { pathname } = useRouter()

  return (
    <nav className="bg-[#0f172a] border-b border-slate-700 px-6 py-3 flex items-center gap-8 sticky top-0 z-50">
      <span className="text-white font-bold text-lg tracking-tight whitespace-nowrap">
        Ghost Fleet Detector
      </span>

      <div className="flex items-center gap-1 flex-wrap">
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
    </nav>
  )
}
