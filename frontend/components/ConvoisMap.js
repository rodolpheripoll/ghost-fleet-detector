import { useEffect, useRef } from 'react'
import L from 'leaflet'

const RISK_COLORS = {
  'Ghost Fleet': '#7f1d1d',
  'Critical':    '#ef4444',
  'Suspect':     '#f97316',
  'Normal':      '#22c55e',
}

export default function ConvoisMap({ convoys, selectedId, onSelect }) {
  const mapRef      = useRef(null)
  const instanceRef = useRef(null)
  const layerRef    = useRef(null)

  useEffect(() => {
    if (instanceRef.current) return
    const map = L.map(mapRef.current, { center: [20, 20], zoom: 3 })
    instanceRef.current = map

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; CARTO &copy; OSM',
      maxZoom: 19,
    }).addTo(map)

    layerRef.current = L.layerGroup().addTo(map)

    const legend = L.control({ position: 'bottomleft' })
    legend.onAdd = () => {
      const div = L.DomUtil.create('div')
      div.style.cssText = 'background:rgba(255,255,255,.96);padding:10px 14px;border-radius:8px;border:1px solid #e2e8f0;font-size:12px;line-height:1.8;'
      div.innerHTML = `
        <b style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#64748b">Légende — Convois</b><br/>
        <span style="color:#7f1d1d">&#9679;</span> Ghost Fleet<br/>
        <span style="color:#ef4444">&#9679;</span> Critical<br/>
        <span style="color:#f97316">&#9679;</span> Suspect<br/>
        <span style="color:#22c55e">&#9679;</span> Normal<br/>
        <hr style="border-color:#e2e8f0;margin:4px 0"/>
        <span style="color:#f59e0b">&#9644;</span> Arc de connexité`
      return div
    }
    legend.addTo(map)

    return () => {
      map.remove()
      instanceRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!layerRef.current || !convoys.length) return
    layerRef.current.clearLayers()

    const validConvoys = convoys.filter(c => c.centroid_lat != null && c.centroid_lon != null)

    // Draw arcs between neighboring convoys of the same risk level
    for (let i = 0; i < Math.min(validConvoys.length, 20); i++) {
      for (let j = i + 1; j < Math.min(validConvoys.length, 20); j++) {
        const a = validConvoys[i]
        const b = validConvoys[j]
        if (a.risk_level !== b.risk_level) continue
        const dist = Math.hypot(a.centroid_lat - b.centroid_lat, a.centroid_lon - b.centroid_lon)
        if (dist > 15) continue
        L.polyline(
          [[a.centroid_lat, a.centroid_lon], [b.centroid_lat, b.centroid_lon]],
          { color: '#f59e0b', weight: 1.5, opacity: 0.5, dashArray: '4 4' }
        ).addTo(layerRef.current)
      }
    }

    // Draw convoy markers
    validConvoys.forEach(convoy => {
      const color  = RISK_COLORS[convoy.risk_level] || '#94a3b8'
      const radius = Math.max(8, Math.min(28, (convoy.size ?? 1) * 4))
      const isSelected = convoy.convoy_id === selectedId

      L.circleMarker([convoy.centroid_lat, convoy.centroid_lon], {
        radius,
        color: isSelected ? '#1e3a5f' : color,
        weight: isSelected ? 3 : 1.5,
        fillColor: color,
        fillOpacity: isSelected ? 0.9 : 0.7,
      })
        .bindPopup(`
          <div style="font-size:12px;line-height:1.7;min-width:180px">
            <b style="font-size:13px">${convoy.convoy_id}</b><br/>
            <b>Niveau :</b> <span style="color:${color}">${convoy.risk_level ?? 'N/A'}</span><br/>
            <b>Navires :</b> ${convoy.size ?? 1}<br/>
            <b>Score moyen :</b> ${(convoy.avg_score ?? 0).toFixed(3)}<br/>
            <b>Position :</b> ${convoy.centroid_lat?.toFixed(2)}°N · ${convoy.centroid_lon?.toFixed(2)}°E
          </div>
        `)
        .on('click', () => onSelect?.(convoy.convoy_id))
        .addTo(layerRef.current)
    })

    // Fit bounds
    if (validConvoys.length > 0 && instanceRef.current) {
      const lats = validConvoys.map(c => c.centroid_lat)
      const lons = validConvoys.map(c => c.centroid_lon)
      instanceRef.current.fitBounds(
        [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]],
        { padding: [40, 40], maxZoom: 6 }
      )
    }
  }, [convoys, selectedId])

  return <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
}
