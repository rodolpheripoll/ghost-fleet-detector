import { useEffect, useRef, useState, useContext } from 'react'
import { supabase, ModeContext } from '../lib/supabase'
import RiskChip from '../components/RiskChip'

function getRiskColor(score) {
  if (score >= 0.8) return '#7f1d1d'
  if (score >= 0.6) return '#ef4444'
  if (score >= 0.3) return '#f97316'
  return '#22c55e'
}

function getRiskLevel(score) {
  if (score >= 0.8) return 'Ghost Fleet'
  if (score >= 0.6) return 'Critical'
  if (score >= 0.3) return 'Suspect'
  return 'Normal'
}

export default function Graphe() {
  const { mode }              = useContext(ModeContext)
  const [nodes,    setNodes]  = useState([])
  const [edges,    setEdges]  = useState([])
  const [selected, setSel]    = useState(null)
  const [loading,  setLoad]   = useState(true)
  const [layout,   setLayout] = useState('force')

  useEffect(() => {
    setLoad(true)
    Promise.all([
      supabase.from('graph_nodes').select('*').limit(200),
      supabase.from('graph_edges').select('*').limit(500),
    ]).then(([{ data: n }, { data: e }]) => {
      setNodes(n ?? [])
      setEdges(e ?? [])
    }).finally(() => setLoad(false))
  }, [])

  const ghostCount    = nodes.filter(n => (n.score ?? 0) >= 0.8).length
  const criticalCount = nodes.filter(n => (n.score ?? 0) >= 0.6 && (n.score ?? 0) < 0.8).length
  const suspectCount  = nodes.filter(n => (n.score ?? 0) >= 0.3 && (n.score ?? 0) < 0.6).length
  const normalCount   = nodes.filter(n => (n.score ?? 0) < 0.3).length

  const selNode = selected ? nodes.find(n => n.id === selected || n.mmsi === selected) : null
  const selEdges = selNode ? edges.filter(e => e.source === selNode.id || e.target === selNode.id) : []

  return (
    <main className="flex" style={{ height: 'calc(100vh - 64px)', minHeight: 900 }}>

      {/* GRAPH CANVAS */}
      <section className="flex-1 relative overflow-hidden"
        style={{ background: 'radial-gradient(ellipse at center, #0e1f36 0%, #06101f 70%, #030814 100%)' }}>

        {/* Background dots */}
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          <defs>
            <pattern id="graphBgd" width="80" height="80" patternUnits="userSpaceOnUse">
              <circle cx="2"  cy="20" r=".6" fill="#fff" opacity=".10"/>
              <circle cx="60" cy="50" r=".6" fill="#fff" opacity=".08"/>
            </pattern>
            <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor="#fff" stopOpacity=".25"/>
              <stop offset="100%" stopColor="#fff" stopOpacity="0"/>
            </radialGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#graphBgd)"/>
        </svg>

        {/* Page chip */}
        <div className="absolute top-5 left-5 flex items-center gap-2 z-10">
          <div className="bg-[#0b1530]/85 backdrop-blur border border-white/10 rounded-lg px-3 py-2 text-white">
            <div className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: '#9fb0c8' }}>Renseignement maritime</div>
            <div className="text-[14px] font-bold tracking-tight">Graphe de proximité — réseau de navires</div>
          </div>
          <div className="bg-[#0b1530]/85 backdrop-blur border border-white/10 rounded-lg px-3 py-2 text-white text-[12px] mono">
            {nodes.length} nœuds · {edges.length} arêtes · 7 clusters
          </div>
        </div>

        {/* Layout filters */}
        <div className="absolute top-5 right-5 flex items-center gap-2 z-10">
          <div className="bg-white rounded-lg shadow-lg border p-1 flex items-center gap-0.5" style={{ borderColor: 'var(--line)' }}>
            {['Force-directed', 'Clusters', 'Hiérarchique'].map(l => (
              <button key={l}
                className="text-[12px] font-semibold rounded-md px-3 py-1.5"
                style={{
                  background: layout === l ? 'var(--navy)' : 'transparent',
                  color: layout === l ? '#fff' : 'var(--muted)',
                }}
                onClick={() => setLayout(l)}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Graph SVG */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1080 880" preserveAspectRatio="xMidYMid meet">
          {/* Edges */}
          <g stroke="#3a6aa8" strokeOpacity=".35">
            <line x1="380" y1="320" x2="460" y2="280" strokeWidth="2.2" stroke="#7f1d1d" strokeOpacity=".55"/>
            <line x1="380" y1="320" x2="320" y2="240" strokeWidth="1.8" stroke="#7f1d1d" strokeOpacity=".5"/>
            <line x1="380" y1="320" x2="300" y2="380" strokeWidth="1.8" stroke="#ef4444" strokeOpacity=".55"/>
            <line x1="380" y1="320" x2="430" y2="400" strokeWidth="1.5"/>
            <line x1="460" y1="280" x2="540" y2="240" strokeWidth="1.5"/>
            <line x1="460" y1="280" x2="520" y2="340" strokeWidth="1.5"/>
            <line x1="320" y1="240" x2="260" y2="200" strokeWidth="1.2"/>
            <line x1="320" y1="240" x2="380" y2="180" strokeWidth="1.2"/>
            <line x1="300" y1="380" x2="240" y2="430" strokeWidth="1.2"/>
            <line x1="430" y1="400" x2="490" y2="460" strokeWidth="1.2"/>
            <line x1="780" y1="240" x2="860" y2="200" strokeWidth="2" stroke="#ef4444" strokeOpacity=".55"/>
            <line x1="780" y1="240" x2="720" y2="180" strokeWidth="1.6"/>
            <line x1="780" y1="240" x2="820" y2="320" strokeWidth="1.6"/>
            <line x1="780" y1="240" x2="700" y2="300" strokeWidth="1.4"/>
            <line x1="860" y1="200" x2="940" y2="160" strokeWidth="1.2"/>
            <line x1="820" y1="320" x2="900" y2="360" strokeWidth="1.2"/>
            <line x1="820" y1="320" x2="760" y2="400" strokeWidth="1.2"/>
            <line x1="540" y1="240" x2="720" y2="180" strokeWidth="1.2" strokeDasharray="4 4" strokeOpacity=".45"/>
            <line x1="520" y1="340" x2="700" y2="300" strokeWidth="1" strokeDasharray="4 4" strokeOpacity=".3"/>
            <line x1="620" y1="600" x2="700" y2="560" strokeWidth="1.6"/>
            <line x1="620" y1="600" x2="540" y2="640" strokeWidth="1.6"/>
            <line x1="620" y1="600" x2="580" y2="700" strokeWidth="1.4"/>
            <line x1="620" y1="600" x2="680" y2="680" strokeWidth="1.4"/>
            <line x1="700" y1="560" x2="780" y2="620" strokeWidth="1.2"/>
            <line x1="540" y1="640" x2="460" y2="680" strokeWidth="1.2"/>
            <line x1="200" y1="500" x2="160" y2="600" strokeWidth=".8" strokeOpacity=".25"/>
            <line x1="200" y1="500" x2="280" y2="580" strokeWidth=".8" strokeOpacity=".25"/>
            <line x1="930" y1="500" x2="980" y2="600" strokeWidth=".8" strokeOpacity=".25"/>
          </g>

          {/* Cluster halos */}
          <ellipse cx="380" cy="320" rx="180" ry="150" fill="#7f1d1d" fillOpacity=".06" stroke="#7f1d1d" strokeOpacity=".25" strokeDasharray="4 4"/>
          <ellipse cx="800" cy="260" rx="170" ry="130" fill="#ef4444" fillOpacity=".05" stroke="#ef4444" strokeOpacity=".22" strokeDasharray="4 4"/>
          <ellipse cx="620" cy="640" rx="200" ry="150" fill="#f97316" fillOpacity=".05" stroke="#f97316" strokeOpacity=".22" strokeDasharray="4 4"/>

          {/* Selected halo */}
          {selNode && (
            <>
              <circle cx="380" cy="320" r="34" fill="url(#nodeGlow)"/>
              <circle cx="380" cy="320" r="26" fill="none" stroke="#fff" strokeOpacity=".8" strokeWidth="2" strokeDasharray="3 3"/>
            </>
          )}

          {/* Nodes */}
          <g className="node-active">
            <circle cx="380" cy="320" r="16" fill="#7f1d1d" stroke="#fff" strokeWidth="3"
              onClick={() => setSel(nodes[0]?.id ?? '380-320')} style={{ cursor: 'pointer' }}/>
          </g>
          <text x="380" y="362" textAnchor="middle" fill="#fecaca" fontFamily="JetBrains Mono" fontSize="10" fontWeight="700">NORDIC STAR</text>

          <circle cx="460" cy="280" r="12" fill="#7f1d1d" stroke="#1a0a0a" strokeWidth="1.5"/>
          <circle cx="320" cy="240" r="11" fill="#7f1d1d" stroke="#1a0a0a" strokeWidth="1.5"/>
          <circle cx="820" cy="320" r="12" fill="#7f1d1d" stroke="#1a0a0a" strokeWidth="1.5"/>

          {[[300,380,9],[430,400,9],[540,240,9],[520,340,8],[780,240,10],[860,200,9],[720,180,9],[700,300,8],[620,600,10],[700,560,8]].map(([cx,cy,r],i) => (
            <circle key={i} cx={cx} cy={cy} r={r} fill="#ef4444"/>
          ))}

          {[[260,200],[380,180],[240,430],[490,460],[940,160],[900,360],[760,400],[540,640],[580,700],[680,680],[780,620],[460,680],[640,760]].map(([cx,cy],i) => (
            <circle key={i} cx={cx} cy={cy} r="7" fill="#f97316"/>
          ))}

          <g fill="#22c55e">
            {[[200,500],[160,600],[280,580],[240,700],[930,500],[980,600],[860,560],[940,720],[120,160],[80,240],[180,780],[380,780]].map(([cx,cy],i) => (
              <circle key={i} cx={cx} cy={cy} r="5"/>
            ))}
          </g>

          {/* Cluster labels */}
          <g fontFamily="Manrope" fontSize="11" fontWeight="700" opacity=".7">
            <text x="380" y="180" textAnchor="middle" fill="#fecaca">CLUSTER #1 · GHOST</text>
            <text x="800" y="140" textAnchor="middle" fill="#fecaca">CLUSTER #2 · CRITICAL</text>
            <text x="620" y="510" textAnchor="middle" fill="#fed7aa">CLUSTER #3 · SUSPECT</text>
          </g>
        </svg>

        {/* Bottom controls */}
        <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4 pointer-events-none z-10">
          <div className="bg-[#0b1530]/85 backdrop-blur border border-white/10 rounded-lg px-4 py-3 text-white pointer-events-auto">
            <div className="text-[10px] uppercase font-semibold tracking-wider mb-2" style={{ color: '#9fb0c8' }}>Légende — nœuds (taille = centralité)</div>
            <div className="flex items-center gap-5 text-[12px]">
              <span className="flex items-center gap-2"><span className="dot" style={{ background: '#7f1d1d', boxShadow: '0 0 6px #7f1d1d' }} />Ghost Fleet · {ghostCount}</span>
              <span className="flex items-center gap-2"><span className="dot" style={{ background: '#ef4444', boxShadow: '0 0 6px #ef4444' }} />Critical · {criticalCount}</span>
              <span className="flex items-center gap-2"><span className="dot" style={{ background: '#f97316', boxShadow: '0 0 6px #f97316' }} />Suspect · {suspectCount}</span>
              <span className="flex items-center gap-2"><span className="dot" style={{ background: '#22c55e' }} />Normal · {normalCount}</span>
            </div>
          </div>
          <div className="bg-[#0b1530]/85 backdrop-blur border border-white/10 rounded-lg px-4 py-3 text-white">
            <div className="text-[10px] uppercase font-semibold tracking-wider mb-1" style={{ color: '#9fb0c8' }}>Métriques de graphe</div>
            <div className="mono text-[12px]">Densité 0.013 · Diam 6 · Modularité 0.71</div>
          </div>
        </div>
      </section>

      {/* RIGHT PANEL */}
      <aside className="shrink-0 bg-white border-l overflow-y-auto" style={{ width: 420, borderColor: 'var(--line)' }}>
        {/* Header */}
        <div className="px-6 py-5 border-b flex items-start justify-between" style={{ borderColor: 'var(--line)' }}>
          <div>
            <div className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--muted)' }}>Nœud sélectionné</div>
            <h2 className="text-[18px] font-bold tracking-tight mt-0.5">NORDIC STAR</h2>
            <div className="mono text-[12px] mt-1" style={{ color: 'var(--muted)' }}>🇷🇺 RUS · Tanker · Crude · 248 m</div>
          </div>
          <button className="w-7 h-7 rounded-md flex items-center justify-center hover:bg-[var(--line-2)]" style={{ color: 'var(--muted)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 6 12 12M6 18 18 6"/></svg>
          </button>
        </div>

        {/* MMSI + score */}
        <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--line)' }}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10.5px] uppercase font-bold tracking-wide" style={{ color: 'var(--muted)' }}>MMSI</div>
              <div className="mono text-[16px] font-bold mt-0.5">273 456 789</div>
              <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--muted)' }}>IMO 9412857</div>
            </div>
            <div>
              <div className="text-[10.5px] uppercase font-bold tracking-wide" style={{ color: 'var(--muted)' }}>Score GRAPH</div>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="mono text-[22px] font-bold leading-none">0.97</div>
                <RiskChip level="Ghost Fleet" />
              </div>
            </div>
          </div>
          <div className="meter mt-3">
            <div style={{ width: '97%', background: 'linear-gradient(90deg,#f97316,#ef4444,#7f1d1d)' }} />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3 text-[11px]">
            {[['PageRank','0.084'],['Degré','14'],['Cluster','#1']].map(([label,value]) => (
              <div key={label} className="text-center rounded-md py-1.5" style={{ background: 'var(--line-2)' }}>
                <div style={{ color: 'var(--muted)' }}>{label}</div>
                <div className="mono font-bold">{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Anomalies */}
        <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--line)' }}>
          <div className="text-[11px] font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--ink-2)' }}>Anomalies détectées</div>
          <ul className="space-y-2.5">
            {[
              { icon: '!', bg: '#fef2f2', bdr: '#fecaca', clr: '#7f1d1d', title: 'AIS gap prolongé', sub: '18 h 32 min · 11–12 mai · golfe de Karkinit', delta: '+0.31', accent: '#ef4444' },
              { icon: '!', bg: '#fef2f2', bdr: '#fecaca', clr: '#7f1d1d', title: 'Spoofing de position', sub: 'Conflit AIS / satellite SAR — décalage 84 NM', delta: '+0.28', accent: '#ef4444' },
              { icon: '⚠', bg: '#fff7ed', bdr: '#fed7aa', clr: '#c2410c', title: 'Escale port sombre', sub: 'Kerch · 09 mai · sans déclaration', delta: '+0.22', accent: '#c2410c' },
              { icon: '⚠', bg: '#fff7ed', bdr: '#fed7aa', clr: '#c2410c', title: "Variation de tirant d'eau", sub: '9.8 → 14.2 m sans escale enregistrée', delta: '+0.16', accent: '#c2410c' },
            ].map(({ icon, bg, bdr, clr, title, sub, delta, accent }) => (
              <li key={title} className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-md flex items-center justify-center text-[12px] font-bold border shrink-0"
                  style={{ background: bg, borderColor: bdr, color: clr }}>{icon}</div>
                <div className="flex-1">
                  <div className="text-[13px] font-semibold">{title}</div>
                  <div className="text-[11.5px]" style={{ color: 'var(--muted)' }}>{sub}</div>
                </div>
                <span className="mono text-[11px] font-bold" style={{ color: accent }}>{delta}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Connections */}
        <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--line)' }}>
          <div className="flex items-center justify-between mb-3">
            <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--ink-2)' }}>Connexions du graphe</div>
            <div className="mono text-[11px]" style={{ color: 'var(--muted)' }}>14 voisins</div>
          </div>
          <div className="space-y-2">
            {[
              { color: '#7f1d1d', name: 'PERSIAN PEARL',  mmsi: '422098765', weight: '0.84', type: 'STS' },
              { color: '#7f1d1d', name: 'KAPITAN VOLKOV', mmsi: '244710001', weight: '0.71', type: 'Proximité' },
              { color: '#ef4444', name: 'BLUE HORIZON',   mmsi: '538009123', weight: '0.62', type: 'Route' },
              { color: '#ef4444', name: 'ATLAS PIONEER',  mmsi: '636019847', weight: '0.55', type: 'Owner' },
              { color: '#f97316', name: 'ORIENT BRIDGE',  mmsi: '477123456', weight: '0.41', type: 'Proximité' },
            ].map(({ color, name, mmsi, weight, type }) => (
              <div key={mmsi} className="flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-[var(--line-2)]">
                <span className="dot" style={{ background: color, width: 9, height: 9 }} />
                <div className="flex-1">
                  <div className="text-[13px] font-semibold">{name}</div>
                  <div className="mono text-[10.5px]" style={{ color: 'var(--muted)' }}>{mmsi} · poids {weight}</div>
                </div>
                <span className="text-[10.5px] font-semibold" style={{ color: 'var(--muted)' }}>{type}</span>
              </div>
            ))}
          </div>
          <button className="text-[12px] font-semibold mt-3 hover:underline" style={{ color: 'var(--navy)' }}>Voir les 9 autres →</button>
        </div>

        {/* Position */}
        <div className="px-6 py-5 border-b" style={{ borderColor: 'var(--line)' }}>
          <div className="text-[11px] font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--ink-2)' }}>Position courante</div>
          <div className="grid grid-cols-2 gap-3 text-[12.5px]">
            {[
              ['Latitude', '44.6182° N'], ['Longitude', '33.5341° E'],
              ['Cap', '082° · Est'],      ['Vitesse', '11.2 kn'],
              ['Dernière vu', 'il y a 2 h 14'], ['Zone', 'Mer Noire'],
            ].map(([label, value]) => (
              <div key={label}>
                <div style={{ color: 'var(--muted)' }}>{label}</div>
                <div className="mono font-semibold">{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-5 flex gap-2">
          <button className="flex-1 text-[13px] font-semibold border rounded-lg px-3 py-2.5 hover:bg-[var(--line-2)]"
            style={{ borderColor: 'var(--line)', background: 'var(--paper)' }}>
            Voir sur la carte
          </button>
          <button className="flex-1 text-[13px] font-semibold text-white rounded-lg px-3 py-2.5"
            style={{ background: 'var(--navy)' }}>
            Fiche complète
          </button>
        </div>
      </aside>
    </main>
  )
}
