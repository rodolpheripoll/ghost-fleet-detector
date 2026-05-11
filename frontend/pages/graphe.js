import { useEffect, useRef, useState, useContext } from 'react'
import { supabase, ModeContext } from '../lib/supabase'
import { useAisStream } from '../lib/useAisStream'

const NODE_COLORS = {
  ship:     (score) => score >= 0.6 ? '#dc2626' : score >= 0.3 ? '#d97706' : '#6b7280',
  zone:     () => '#3b82f6',
  behavior: () => '#8b5cf6',
}

const EDGE_COLORS = {
  traversed:    '#3b82f6',
  exhibited:    '#ef4444',
  'co-located': '#6b7280',
}

export default function GraphePage() {
  const { mode }   = useContext(ModeContext)
  const canvasRef  = useRef(null)
  const [demoNodes,   setDemoNodes]   = useState([])
  const [demoEdges,   setDemoEdges]   = useState([])
  const [demoLoading, setDemoLoading] = useState(true)
  const [demoError,   setDemoError]   = useState(null)
  const [selected, setSelected] = useState(null)

  const { ships: liveShips, status: liveStatus, error: liveError } = useAisStream(mode === 'live')

  useEffect(() => {
    if (mode !== 'demo') return
    setDemoLoading(true)
    setDemoError(null)
    Promise.all([
      supabase.from('graph_nodes').select('*'),
      supabase.from('graph_edges').select('*'),
    ]).then(([{ data: n, error: ne }, { data: e, error: ee }]) => {
      if (ne) throw ne
      if (ee) throw ee
      setDemoNodes(n ?? [])
      setDemoEdges(e ?? [])
    }).catch(e => setDemoError(e.message)).finally(() => setDemoLoading(false))
  }, [mode])

  // In live mode build synthetic nodes from WebSocket ships
  const liveNodes = liveShips.map(s => ({
    id:         s.mmsi,
    type:       'ship',
    label:      s.mmsi,
    score:      s.score ?? 0,
    risk_level: s.risk_level ?? 'Normal',
    centrality: 0,
  }))

  const nodes   = mode === 'live' ? liveNodes : demoNodes
  const edges   = mode === 'live' ? []         : demoEdges
  const loading = mode === 'live' ? liveStatus === 'connecting' : demoLoading
  const error   = mode === 'live' ? liveError  : demoError

  useEffect(() => {
    if (!nodes.length || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    const W      = canvas.offsetWidth
    const H      = canvas.offsetHeight
    canvas.width  = W
    canvas.height = H

    const positions = {}
    const maxCentrality = Math.max(...nodes.map(n => n.centrality ?? 0), 0.001)

    nodes.forEach((node, i) => {
      const angle  = (2 * Math.PI * i) / nodes.length
      const radius = Math.min(W, H) * 0.35
      positions[node.id] = {
        x:  W / 2 + radius * Math.cos(angle),
        y:  H / 2 + radius * Math.sin(angle),
        vx: 0, vy: 0,
        r:  6 + (node.centrality ?? 0) / maxCentrality * 14,
        color: NODE_COLORS[node.type]?.(node.score) ?? '#6b7280',
        ...node,
      }
    })

    for (let iter = 0; iter < 120; iter++) {
      const cooling = 1 - iter / 120
      const ids = Object.keys(positions)
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = positions[ids[i]], b = positions[ids[j]]
          const dx = b.x - a.x, dy = b.y - a.y
          const d  = Math.max(Math.sqrt(dx*dx + dy*dy), 1)
          const f  = 5000 / (d * d)
          a.vx -= (dx/d)*f; a.vy -= (dy/d)*f
          b.vx += (dx/d)*f; b.vy += (dy/d)*f
        }
      }
      edges.forEach(edge => {
        const a = positions[edge.source], b = positions[edge.target]
        if (!a || !b) return
        const dx = b.x-a.x, dy = b.y-a.y, d = Math.max(Math.sqrt(dx*dx+dy*dy),1)
        const f = (d-80)/80
        a.vx += (dx/d)*f*0.5; a.vy += (dy/d)*f*0.5
        b.vx -= (dx/d)*f*0.5; b.vy -= (dy/d)*f*0.5
      })
      Object.values(positions).forEach(n => {
        n.x = Math.max(n.r, Math.min(W-n.r, n.x + n.vx*cooling))
        n.y = Math.max(n.r, Math.min(H-n.r, n.y + n.vy*cooling))
        n.vx *= 0.85; n.vy *= 0.85
      })
    }

    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#1e293b'
    ctx.fillRect(0, 0, W, H)

    edges.forEach(edge => {
      const a = positions[edge.source], b = positions[edge.target]
      if (!a || !b) return
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y)
      ctx.strokeStyle = EDGE_COLORS[edge.label] ?? '#334155'
      ctx.lineWidth = 1; ctx.globalAlpha = 0.5; ctx.stroke(); ctx.globalAlpha = 1
    })

    Object.values(positions).forEach(node => {
      ctx.beginPath(); ctx.arc(node.x, node.y, node.r, 0, Math.PI*2)
      ctx.fillStyle = node.color; ctx.fill()
      ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.5; ctx.stroke()
      ctx.fillStyle = '#e2e8f0'; ctx.font = `${Math.max(8, node.r*0.9)}px sans-serif`
      ctx.textAlign = 'center'
      ctx.fillText(String(node.label).slice(0,12), node.x, node.y + node.r + 10)
    })

    const handleClick = (e) => {
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      let hit = null
      Object.values(positions).forEach(node => {
        const dx = mx-node.x, dy = my-node.y
        if (Math.sqrt(dx*dx+dy*dy) <= node.r) hit = node
      })
      setSelected(hit)
    }
    canvas.addEventListener('click', handleClick)
    return () => canvas.removeEventListener('click', handleClick)
  }, [nodes, edges])

  return (
    <div className="flex h-[calc(100vh-80px)]">
      <div className="flex-1 relative">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            {mode === 'live' ? 'Connexion a aisstream.io...' : 'Chargement du graphe...'}
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-red-400">Erreur : {error}</div>
        ) : nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500">
            Aucun noeud. Lancez le pipeline Python d&apos;abord.
          </div>
        ) : (
          <canvas ref={canvasRef} className="w-full h-full cursor-pointer" style={{ background: '#1e293b' }} />
        )}

        {!loading && nodes.length > 0 && (
          <div className="absolute bottom-4 left-4 bg-slate-900/90 border border-slate-700 rounded-lg p-3 text-xs text-slate-300">
            <p className="font-bold text-white mb-1">Noeuds</p>
            <p><span style={{ color: '#dc2626' }}>●</span> Critique</p>
            <p><span style={{ color: '#d97706' }}>●</span> Suspect</p>
            <p><span style={{ color: '#6b7280' }}>●</span> Normal</p>
            <p><span style={{ color: '#3b82f6' }}>●</span> Zone</p>
            <p><span style={{ color: '#8b5cf6' }}>●</span> Comportement</p>
          </div>
        )}
      </div>

      <div className="w-72 bg-slate-900 border-l border-slate-700 p-4 overflow-y-auto flex-shrink-0">
        <h2 className="text-sm font-bold text-white mb-4 uppercase tracking-wide">
          {selected ? 'Details du noeud' : 'Cliquez sur un noeud'}
        </h2>
        {selected ? (
          <div className="space-y-2 text-sm text-slate-300">
            <div className="bg-slate-800 rounded-lg p-3 space-y-1.5">
              <p><span className="text-slate-500">ID :</span> <span className="font-mono text-xs">{selected.id}</span></p>
              <p><span className="text-slate-500">Type :</span> {selected.type}</p>
              <p><span className="text-slate-500">Score :</span> <span className={selected.score >= 0.6 ? 'text-red-400 font-bold' : selected.score >= 0.3 ? 'text-amber-400 font-bold' : 'text-emerald-400'}>{parseFloat(selected.score).toFixed(3)}</span></p>
              <p><span className="text-slate-500">Risque :</span> {selected.risk_level}</p>
              <p><span className="text-slate-500">Centralite :</span> {parseFloat(selected.centrality ?? 0).toFixed(4)}</p>
            </div>
            <div>
              <p className="text-slate-500 text-xs font-medium uppercase mt-3 mb-2">Relations</p>
              {edges.filter(e => e.source === selected.id || e.target === selected.id).slice(0,15).map((e, i) => (
                <div key={i} className="text-xs bg-slate-800 rounded px-2 py-1 mb-1 flex items-center gap-1">
                  <span className="font-mono">{e.source === selected.id ? e.target : e.source}</span>
                  <span className="ml-auto px-1.5 py-0.5 rounded text-[10px]"
                    style={{ background: (EDGE_COLORS[e.label]||'#6b7280')+'33', color: EDGE_COLORS[e.label]||'#6b7280' }}>
                    {e.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-slate-500 text-sm">
            <p>Selectionnez un noeud pour voir ses details.</p>
            <p className="mt-4 text-xs"><b className="text-slate-400">{nodes.length}</b> noeuds · <b className="text-slate-400">{edges.length}</b> aretes</p>
            {mode === 'live' && <p className="mt-2 text-xs text-emerald-500">Mode LIVE — navires temps reel</p>}
          </div>
        )}
      </div>
    </div>
  )
}
