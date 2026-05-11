import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const NODE_COLORS = {
  ship:     (score) => {
    if (score >= 0.6) return '#dc2626'
    if (score >= 0.3) return '#d97706'
    return '#6b7280'
  },
  zone:     () => '#3b82f6',
  behavior: () => '#8b5cf6',
}

const EDGE_COLORS = {
  traversed:  '#3b82f6',
  exhibited:  '#ef4444',
  'co-located': '#6b7280',
}

export default function GraphePage() {
  const canvasRef    = useRef(null)
  const [nodes,      setNodes]      = useState([])
  const [edges,      setEdges]      = useState([])
  const [selected,   setSelected]   = useState(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const [{ data: n, error: ne }, { data: e, error: ee }] = await Promise.all([
          supabase.from('graph_nodes').select('*'),
          supabase.from('graph_edges').select('*'),
        ])
        if (ne) throw ne
        if (ee) throw ee
        setNodes(n ?? [])
        setEdges(e ?? [])
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  // Simple canvas-based force graph (no SSR issues, no external graph library needed beyond data)
  useEffect(() => {
    if (!nodes.length || !canvasRef.current) return

    const canvas  = canvasRef.current
    const ctx     = canvas.getContext('2d')
    const W       = canvas.offsetWidth
    const H       = canvas.offsetHeight
    canvas.width  = W
    canvas.height = H

    // Place nodes with random initial positions
    const nodeMap = {}
    const positions = {}
    const maxCentrality = Math.max(...nodes.map(n => n.centrality ?? 0), 0.001)

    nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / nodes.length
      const radius = Math.min(W, H) * 0.35
      positions[node.id] = {
        x:    W / 2 + radius * Math.cos(angle),
        y:    H / 2 + radius * Math.sin(angle),
        vx:   0,
        vy:   0,
        r:    6 + (node.centrality ?? 0) / maxCentrality * 14,
        color: NODE_COLORS[node.type]?.(node.score) ?? '#6b7280',
        ...node,
      }
      nodeMap[node.id] = positions[node.id]
    })

    // Simple force-directed layout: repulsion + edge attraction
    const ITERATIONS = 120
    const K          = 80   // spring constant
    const REPULSION  = 5000

    for (let iter = 0; iter < ITERATIONS; iter++) {
      const cooling = 1 - iter / ITERATIONS

      // Repulsion between all node pairs
      const ids = Object.keys(positions)
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a  = positions[ids[i]]
          const b  = positions[ids[j]]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const d  = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
          const f  = REPULSION / (d * d)
          a.vx -= (dx / d) * f
          a.vy -= (dy / d) * f
          b.vx += (dx / d) * f
          b.vy += (dy / d) * f
        }
      }

      // Attraction along edges
      edges.forEach(edge => {
        const a = positions[edge.source]
        const b = positions[edge.target]
        if (!a || !b) return
        const dx = b.x - a.x
        const dy = b.y - a.y
        const d  = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
        const f  = (d - K) / K
        a.vx += (dx / d) * f * 0.5
        a.vy += (dy / d) * f * 0.5
        b.vx -= (dx / d) * f * 0.5
        b.vy -= (dy / d) * f * 0.5
      })

      // Apply velocities with cooling
      Object.values(positions).forEach(n => {
        n.x = Math.max(n.r, Math.min(W - n.r, n.x + n.vx * cooling))
        n.y = Math.max(n.r, Math.min(H - n.r, n.y + n.vy * cooling))
        n.vx *= 0.85
        n.vy *= 0.85
      })
    }

    // Draw
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#1e293b'
    ctx.fillRect(0, 0, W, H)

    // Draw edges
    edges.forEach(edge => {
      const a = positions[edge.source]
      const b = positions[edge.target]
      if (!a || !b) return
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.strokeStyle = EDGE_COLORS[edge.label] ?? '#334155'
      ctx.lineWidth   = 1
      ctx.globalAlpha = 0.5
      ctx.stroke()
      ctx.globalAlpha = 1
    })

    // Draw nodes
    Object.values(positions).forEach(node => {
      ctx.beginPath()
      ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2)
      ctx.fillStyle   = node.color
      ctx.fill()
      ctx.strokeStyle = '#0f172a'
      ctx.lineWidth   = 1.5
      ctx.stroke()

      // Label
      ctx.fillStyle  = '#e2e8f0'
      ctx.font       = `${Math.max(8, node.r * 0.9)}px sans-serif`
      ctx.textAlign  = 'center'
      ctx.fillText(String(node.label).slice(0, 12), node.x, node.y + node.r + 10)
    })

    // Click handler to select node
    const handleClick = (e) => {
      const rect = canvas.getBoundingClientRect()
      const mx   = e.clientX - rect.left
      const my   = e.clientY - rect.top
      let hit = null
      Object.values(positions).forEach(node => {
        const dx = mx - node.x
        const dy = my - node.y
        if (Math.sqrt(dx * dx + dy * dy) <= node.r) hit = node
      })
      setSelected(hit)
    }

    canvas.addEventListener('click', handleClick)
    return () => canvas.removeEventListener('click', handleClick)
  }, [nodes, edges])

  return (
    <div className="flex h-[calc(100vh-56px)]">
      {/* Graph canvas */}
      <div className="flex-1 relative">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            Chargement du graphe...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-red-400">
            Erreur : {error}
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-500">
            Aucun noeud disponible. Lancez le pipeline Python d&apos;abord.
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="w-full h-full cursor-pointer"
            style={{ background: '#1e293b' }}
          />
        )}

        {/* Legend */}
        {!loading && nodes.length > 0 && (
          <div className="absolute bottom-4 left-4 bg-slate-900/90 border border-slate-700 rounded-lg p-3 text-xs text-slate-300">
            <p className="font-bold text-white mb-2">Noeuds</p>
            <p><span style={{ color: '#dc2626' }}>●</span> Navire critique (score ≥ 0.6)</p>
            <p><span style={{ color: '#d97706' }}>●</span> Navire suspect (score 0.3–0.6)</p>
            <p><span style={{ color: '#6b7280' }}>●</span> Navire normal</p>
            <p><span style={{ color: '#3b82f6' }}>●</span> Zone a risque</p>
            <p><span style={{ color: '#8b5cf6' }}>●</span> Comportement</p>
            <p className="font-bold text-white mt-2 mb-1">Aretes</p>
            <p><span style={{ color: '#3b82f6' }}>—</span> traversed</p>
            <p><span style={{ color: '#ef4444' }}>—</span> exhibited</p>
            <p><span style={{ color: '#6b7280' }}>—</span> co-located</p>
          </div>
        )}
      </div>

      {/* Side panel */}
      <div className="w-72 bg-slate-900 border-l border-slate-700 p-4 overflow-y-auto flex-shrink-0">
        <h2 className="text-sm font-bold text-white mb-4 uppercase tracking-wide">
          {selected ? 'Details du noeud' : 'Cliquez sur un noeud'}
        </h2>

        {selected ? (
          <div className="space-y-2 text-sm text-slate-300">
            <div className="bg-slate-800 rounded-lg p-3 space-y-1.5">
              <p><span className="text-slate-500">ID :</span> <span className="font-mono text-xs">{selected.id}</span></p>
              <p><span className="text-slate-500">Type :</span> {selected.type}</p>
              <p><span className="text-slate-500">Label :</span> {selected.label}</p>
              {selected.score != null && (
                <p>
                  <span className="text-slate-500">Score :</span>{' '}
                  <span className={
                    selected.score >= 0.6 ? 'text-red-400 font-bold' :
                    selected.score >= 0.3 ? 'text-amber-400 font-bold' :
                    'text-emerald-400'
                  }>
                    {parseFloat(selected.score).toFixed(3)}
                  </span>
                </p>
              )}
              {selected.risk_level && (
                <p><span className="text-slate-500">Risque :</span> {selected.risk_level}</p>
              )}
              {selected.centrality != null && (
                <p><span className="text-slate-500">Centralite :</span> {parseFloat(selected.centrality).toFixed(4)}</p>
              )}
            </div>

            {/* Edges of selected node */}
            <div>
              <p className="text-slate-500 text-xs font-medium uppercase mt-3 mb-2">Relations</p>
              {edges
                .filter(e => e.source === selected.id || e.target === selected.id)
                .slice(0, 15)
                .map((e, i) => (
                  <div key={i} className="text-xs bg-slate-800 rounded px-2 py-1 mb-1 flex items-center gap-1">
                    <span className="font-mono">{e.source === selected.id ? e.target : e.source}</span>
                    <span
                      className="ml-auto px-1.5 py-0.5 rounded text-[10px]"
                      style={{ background: EDGE_COLORS[e.label] + '33', color: EDGE_COLORS[e.label] }}
                    >
                      {e.label}
                    </span>
                  </div>
                ))
              }
            </div>
          </div>
        ) : (
          <div className="text-slate-500 text-sm">
            <p>Selectionnez un noeud pour voir ses details et ses connexions.</p>
            <p className="mt-4 text-xs">
              <b className="text-slate-400">{nodes.length}</b> noeuds ·{' '}
              <b className="text-slate-400">{edges.length}</b> aretes
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
