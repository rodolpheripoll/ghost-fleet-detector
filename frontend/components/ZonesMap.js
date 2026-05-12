import { useEffect, useRef } from 'react'
import L from 'leaflet'

const ZONE_COLOR = {
  Critical: '#ef4444',
  High:     '#f97316',
  Medium:   '#eab308',
  Low:      '#22c55e',
}

export default function ZonesMap({ zones = [], zoneStats = [] }) {
  const containerRef = useRef(null)
  const mapRef       = useRef(null)

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return

    const map = L.map(containerRef.current, { center: [20, 20], zoom: 2 })
    mapRef.current = map

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© CARTO',
      maxZoom: 19,
    }).addTo(map)

    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(containerRef.current)
    setTimeout(() => map.invalidateSize(), 100)

    zones.forEach(zone => {
      const { lat_min, lat_max, lon_min, lon_max, risk_level, name, zone_id } = zone
      if (lat_min == null || lon_min == null) return

      const s     = zoneStats.find(z => z.zone_id === zone_id) ?? {}
      const color = ZONE_COLOR[risk_level] ?? '#94a3b8'

      L.rectangle([[lat_min, lon_min], [lat_max, lon_max]], {
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.25,
      })
        .bindPopup(`
          <div style="font-size:12px;line-height:1.8;min-width:160px">
            <b>${name}</b><br/>
            <span style="color:${color}">●</span> Risque : <b>${risk_level}</b><br/>
            🚢 Navires détectés : <b>${s.ship_count ?? 0}</b><br/>
            🚨 Comportements suspects : <b>${s.suspicious_behavior_count ?? 0}</b><br/>
            🔴 Navires critiques : <b>${s.critical_ship_count ?? 0}</b>
          </div>
        `)
        .bindTooltip(`${name} — ${risk_level}`)
        .addTo(map)
    })

    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, zoneStats])

  return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
}
