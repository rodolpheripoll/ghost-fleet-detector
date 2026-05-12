import { useState, useMemo, useEffect } from 'react'
import DeckGL from '@deck.gl/react'
import { ScatterplotLayer, LineLayer } from '@deck.gl/layers'
import Map from 'react-map-gl/maplibre'

const CARTO_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'
const INITIAL_VIEW = { longitude: 20, latitude: 20, zoom: 2.5, pitch: 0, bearing: 0 }

const GROUP_COLORS = [
  [96,165,250],[52,211,153],[244,114,182],[251,191,36],[167,139,250],
  [251,146,60],[56,189,248],[74,222,128],[248,113,113],[232,121,249],
  [103,232,249],[134,239,172],[253,164,175],[217,249,157],[196,181,253],
  [253,186,116],[125,211,252],[110,231,183],[249,168,212],[253,230,138],
]
const ISOLATED_COLOR = [127, 29, 29]

function convoyColor(id) {
  if (!id || id === 0) return ISOLATED_COLOR
  return GROUP_COLORS[(id - 1) % GROUP_COLORS.length]
}

export default function GroupMap({
  ships = [],
  edges = [],
  selectedConvoyId = null,
  externalViewState = null,
  onViewStateChange,
  onShipClick,
}) {
  const [viewState, setViewState]   = useState(INITIAL_VIEW)
  const [tooltip,   setTooltip]     = useState(null)
  const [showEdges, setShowEdges]   = useState(true)

  // Sync external view state (e.g. when user clicks a group card)
  useEffect(() => {
    if (externalViewState) setViewState(externalViewState)
  }, [externalViewState])

  // Build mmsi → ship lookup
  const shipMap = useMemo(() => {
    const m = {}
    ships.forEach(s => { m[String(s.mmsi)] = s })
    return m
  }, [ships])

  // Enrich edges with positions and convoy_id
  const enrichedEdges = useMemo(() => {
    return edges.map(e => {
      const sA = shipMap[String(e.source)]
      const sB = shipMap[String(e.target)]
      if (!sA || !sB) return null
      return {
        ...e,
        sourcePosition: [sA.longitude, sA.latitude],
        targetPosition: [sB.longitude, sB.latitude],
        convoy_id: sA.convoy_id ?? 0,
        mmsi_a: sA.mmsi,
        mmsi_b: sB.mmsi,
      }
    }).filter(Boolean)
  }, [edges, shipMap])

  // Visible ships (filtered by selection)
  const visibleShips = useMemo(() => {
    const valid = ships.filter(s => s.latitude != null && s.longitude != null)
    if (selectedConvoyId === null) return valid
    return valid.filter(s => (s.convoy_id ?? 0) === selectedConvoyId)
  }, [ships, selectedConvoyId])

  // Visible edges
  const visibleEdges = useMemo(() => {
    if (selectedConvoyId === null) return enrichedEdges
    return enrichedEdges.filter(e => e.convoy_id === selectedConvoyId)
  }, [enrichedEdges, selectedConvoyId])

  const layers = [
    new LineLayer({
      id: 'edges',
      data: visibleEdges,
      getSourcePosition: d => d.sourcePosition,
      getTargetPosition: d => d.targetPosition,
      getColor: d => {
        const base = convoyColor(d.convoy_id)
        return [...base, 90]
      },
      getWidth: 1.5,
      widthMinPixels: 1,
      visible: showEdges,
      pickable: true,
      onHover: ({ object, x, y }) => {
        if (object) setTooltip({ type: 'edge', object, x, y })
        else if (tooltip?.type === 'edge') setTooltip(null)
      },
    }),
    new ScatterplotLayer({
      id: 'ships',
      data: visibleShips,
      getPosition: d => [d.longitude, d.latitude],
      getFillColor: d => {
        const base = convoyColor(d.convoy_id ?? 0)
        const isSelected = selectedConvoyId !== null && (d.convoy_id ?? 0) === selectedConvoyId
        return [...base, isSelected ? 255 : 200]
      },
      getRadius: d => {
        const score = parseFloat(d.score ?? 0)
        return 30000 + score * 60000
      },
      radiusMinPixels: 4,
      radiusMaxPixels: 16,
      pickable: true,
      onHover: ({ object, x, y }) => {
        if (object) setTooltip({ type: 'ship', object, x, y })
        else if (tooltip?.type === 'ship') setTooltip(null)
      },
      onClick: ({ object }) => {
        if (object && onShipClick) onShipClick(object)
      },
    }),
  ]

  const handleViewStateChange = ({ viewState: vs }) => {
    setViewState(vs)
    if (onViewStateChange) onViewStateChange(vs)
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <DeckGL
        viewState={viewState}
        onViewStateChange={handleViewStateChange}
        controller
        layers={layers}
        style={{ width: '100%', height: '100%' }}
        getCursor={() => 'default'}
      >
        <Map mapStyle={CARTO_STYLE} />
      </DeckGL>

      {/* Edge toggle */}
      <div className="absolute top-3 right-3 bg-white/95 border border-slate-200 rounded-lg px-3 py-2 shadow text-xs z-10">
        <label className="flex items-center gap-2 cursor-pointer text-[#0f172a]">
          <input
            type="checkbox"
            checked={showEdges}
            onChange={e => setShowEdges(e.target.checked)}
            className="accent-purple-600"
          />
          Afficher les arêtes du graphe (dist. &lt; 20 nm)
        </label>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white/95 border border-slate-200 rounded-xl p-3 shadow text-xs z-10 max-w-[220px]">
        <p className="font-bold text-[#0f172a] mb-1.5">Graphe de proximité</p>
        <div className="space-y-1 text-[#475569]">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: 'rgb(96,165,250)' }} />
            <span>Nœud = 1 navire</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-0.5 flex-shrink-0 bg-blue-300" />
            <span>Arête = dist. &lt; 20 nm</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: 'rgb(127,29,29)' }} />
            <span>Rouge = navire isolé</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] leading-tight">🎨</span>
            <span>Couleur = groupe</span>
          </div>
        </div>
        <p className="text-[10px] text-[#94a3b8] mt-1.5 border-t border-slate-100 pt-1">Source : IMO COLREGS Règle 5</p>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          style={{ left: tooltip.x + 14, top: tooltip.y - 10 }}
          className="absolute z-20 bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2
                     text-xs text-[#0f172a] pointer-events-none min-w-[160px]"
        >
          {tooltip.type === 'ship' ? (
            <>
              <p className="font-bold mb-1">{tooltip.object.mmsi}</p>
              <p><span className="text-[#64748b]">Groupe : </span>{(tooltip.object.convoy_id ?? 0) === 0 ? 'Isolé' : `#${tooltip.object.convoy_id}`}</p>
              <p><span className="text-[#64748b]">Score : </span>{parseFloat(tooltip.object.score ?? 0).toFixed(3)}</p>
              <p><span className="text-[#64748b]">Risque : </span>{tooltip.object.risk_level ?? 'N/A'}</p>
              <p><span className="text-[#64748b]">Voisins : </span>{tooltip.object.convoy_size ?? 1} navires</p>
            </>
          ) : (
            <>
              <p className="font-bold mb-1">Arête de proximité</p>
              <p><span className="text-[#64748b]">MMSI A : </span>{tooltip.object.mmsi_a}</p>
              <p><span className="text-[#64748b]">MMSI B : </span>{tooltip.object.mmsi_b}</p>
              <p><span className="text-[#64748b]">Distance : </span>{tooltip.object.distance_nm?.toFixed(1)} nm</p>
              <p><span className="text-[#64748b]">Groupe : </span>{(tooltip.object.convoy_id ?? 0) === 0 ? 'Isolé' : `#${tooltip.object.convoy_id}`}</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
