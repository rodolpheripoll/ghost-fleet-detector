/**
 * FullMap — full-screen interactive Leaflet map.
 * Must be imported with dynamic({ ssr: false }).
 *
 * Map initialisation runs once. Ship markers and zone overlays
 * are managed in separate effects that re-run when props change,
 * so live WebSocket data (LIVE mode) is correctly reflected.
 */
import { useEffect, useRef } from 'react'
import L from 'leaflet'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const ZONE_COLORS = {
  Critical: '#ef4444',
  High:     '#f97316',
  Medium:   '#eab308',
  Low:      '#22c55e',
}

const TRAJ_PALETTE = [
  '#60a5fa','#34d399','#f472b6','#fbbf24','#a78bfa',
  '#fb923c','#38bdf8','#4ade80','#f87171','#e879f9',
]

function popupHtml(ship) {
  return `
    <div style="font-size:12px;line-height:1.6">
      <b>MMSI :</b> ${ship.mmsi}<br/>
      <b>Score :</b> ${parseFloat(ship.score ?? 0).toFixed(2)}<br/>
      <b>Risque :</b> ${ship.risk_level ?? 'N/A'}<br/>
      <b>Vitesse :</b> ${ship.speed ?? 'N/A'} kn<br/>
      <b>Cap :</b> ${ship.course ?? 'N/A'}°<br/>
      <b>Statut :</b> ${ship.status ?? 'N/A'}<br/>
      <b>AIS actif :</b> ${ship.ais_active}<br/>
      <b>Timestamp :</b> ${ship.timestamp ? new Date(ship.timestamp).toLocaleString('fr-FR') : 'N/A'}
    </div>
  `
}

export default function FullMap({ ships = [], zones = [] }) {
  const mapRef        = useRef(null)   // DOM node
  const instanceRef   = useRef(null)   // Leaflet map instance
  const lgNormalRef   = useRef(null)
  const lgDisabledRef = useRef(null)
  const lgFakeRef     = useRef(null)
  const lgSuspRef     = useRef(null)
  const lgZonesRef    = useRef(null)
  const lgTrajRef     = useRef(null)
  const fittedRef     = useRef(false)  // only auto-fit bounds once

  // ── Effect 1: initialise the map exactly once ────────────────────────────
  useEffect(() => {
    if (instanceRef.current) return

    const map = L.map(mapRef.current, { center: [20, 20], zoom: 3 })
    instanceRef.current = map

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      { attribution: '&copy; CARTO', maxZoom: 19 }
    ).addTo(map)

    lgNormalRef.current   = L.layerGroup().addTo(map)
    lgDisabledRef.current = L.layerGroup().addTo(map)
    lgFakeRef.current     = L.layerGroup().addTo(map)
    lgSuspRef.current     = L.layerGroup().addTo(map)
    lgZonesRef.current    = L.layerGroup().addTo(map)
    lgTrajRef.current     = L.layerGroup().addTo(map)

    L.control.layers(null, {
      'Positions normales':    lgNormalRef.current,
      'AIS desactive':         lgDisabledRef.current,
      'MMSI FAKE (spoofing)':  lgFakeRef.current,
      'Navires suspects':      lgSuspRef.current,
      'Zones a risque':        lgZonesRef.current,
      'Trajectoires':          lgTrajRef.current,
    }, { collapsed: false }).addTo(map)

    const legend = L.control({ position: 'bottomleft' })
    legend.onAdd = () => {
      const div = L.DomUtil.create('div')
      div.innerHTML = `
        <div style="background:rgba(15,23,42,0.92);color:#e2e8f0;padding:10px 14px;
                    border-radius:8px;border:1px solid #334155;font-size:12px;line-height:1.8">
          <b>Legende</b><br/>
          <span style="color:#6b7280">&#9679;</span> Position normale<br/>
          <span style="color:#f97316">&#9679;</span> AIS desactive<br/>
          <span style="color:#dc2626">!</span> MMSI FAKE (spoofing)<br/>
          <span style="color:#991b1b">&#9679;</span> Navire suspect<br/>
          <hr style="border-color:#334155;margin:4px 0"/>
          <span style="color:#ef4444">&#9644;</span> Zone Critique<br/>
          <span style="color:#f97316">&#9644;</span> Zone Haute<br/>
          <span style="color:#eab308">&#9644;</span> Zone Moyenne<br/>
          <span style="color:#22c55e">&#9644;</span> Zone Faible
        </div>`
      return div
    }
    legend.addTo(map)

    return () => {
      map.remove()
      instanceRef.current   = null
      lgNormalRef.current   = null
      lgDisabledRef.current = null
      lgFakeRef.current     = null
      lgSuspRef.current     = null
      lgZonesRef.current    = null
      lgTrajRef.current     = null
      fittedRef.current     = false
    }
  }, [])

  // ── Effect 2: update zone overlays when zones prop changes ───────────────
  useEffect(() => {
    if (!lgZonesRef.current) return
    lgZonesRef.current.clearLayers()
    zones.forEach(zone => {
      const { lat_min, lat_max, lon_min, lon_max, risk_level, name, description } = zone
      if (lat_min == null) return
      const color = ZONE_COLORS[risk_level] ?? '#94a3b8'
      L.rectangle([[lat_min, lon_min], [lat_max, lon_max]], {
        color, weight: 2, fillColor: color, fillOpacity: 0.15,
      })
        .bindPopup(`<b>${name}</b><br/><b>Risque:</b> ${risk_level}<br/>${description ?? ''}`)
        .bindTooltip(`${name} (${risk_level})`)
        .addTo(lgZonesRef.current)
    })
  }, [zones])

  // ── Effect 3: update ship markers when ships prop changes ─────────────────
  useEffect(() => {
    if (!lgNormalRef.current) return

    // Clear all ship layers
    lgNormalRef.current.clearLayers()
    lgDisabledRef.current.clearLayers()
    lgFakeRef.current.clearLayers()
    lgSuspRef.current.clearLayers()
    lgTrajRef.current.clearLayers()

    const validShips = ships.filter(s => s.latitude != null && s.longitude != null)
    if (!validShips.length) return

    // Group positions by MMSI for trajectory polylines
    const byMmsi    = {}
    const trajColors = {}
    let   colorIdx   = 0

    validShips.forEach(ship => {
      const m = String(ship.mmsi)
      if (!byMmsi[m]) byMmsi[m] = []
      byMmsi[m].push([ship.latitude, ship.longitude])
    })

    Object.entries(byMmsi).forEach(([mmsi, coords]) => {
      if (coords.length < 2) return
      if (!trajColors[mmsi]) {
        trajColors[mmsi] = TRAJ_PALETTE[colorIdx % TRAJ_PALETTE.length]
        colorIdx++
      }
      L.polyline(coords, { color: trajColors[mmsi], weight: 1.5, opacity: 0.6 })
        .addTo(lgTrajRef.current)
    })

    validShips.forEach(ship => {
      const mmsi  = String(ship.mmsi)
      const score = parseFloat(ship.score ?? 0)
      const popup = popupHtml(ship)

      if (mmsi.startsWith('FAKE-')) {
        const icon = L.divIcon({
          html: `<div style="background:#dc2626;color:white;border-radius:50%;width:20px;height:20px;
                       display:flex;align-items:center;justify-content:center;font-size:12px;
                       border:2px solid #fca5a5">!</div>`,
          className: '', iconSize: [20, 20], iconAnchor: [10, 10],
        })
        L.marker([ship.latitude, ship.longitude], { icon })
          .bindPopup(`<b>ALERTE SPOOFING</b><br/>${popup}`)
          .bindTooltip(`FAKE MMSI: ${mmsi}`)
          .addTo(lgFakeRef.current)

      } else if (!ship.ais_active) {
        L.circleMarker([ship.latitude, ship.longitude], {
          radius: 7, color: '#f97316', fillColor: '#f97316', fillOpacity: 0.85, weight: 1,
        })
          .bindPopup(`<b>AIS DESACTIVE</b><br/>${popup}`)
          .bindTooltip(`AIS OFF: ${mmsi}`)
          .addTo(lgDisabledRef.current)

      } else if (score >= 0.3) {
        const radius = 5 + score * 8
        L.circleMarker([ship.latitude, ship.longitude], {
          radius, color: '#991b1b', fillColor: '#991b1b', fillOpacity: 0.85, weight: 1,
        })
          .bindPopup(`<b>NAVIRE SUSPECT</b><br/>${popup}`)
          .bindTooltip(`Suspect: ${mmsi} (${score.toFixed(2)})`)
          .addTo(lgSuspRef.current)

      } else {
        L.circleMarker([ship.latitude, ship.longitude], {
          radius: 5, color: '#6b7280', fillColor: '#6b7280', fillOpacity: 0.5, weight: 1,
        })
          .bindPopup(popup)
          .bindTooltip(mmsi)
          .addTo(lgNormalRef.current)
      }
    })

    // Auto-fit bounds only on first batch of ships (avoid jarring re-fits in LIVE mode)
    if (!fittedRef.current && instanceRef.current) {
      const lats = validShips.map(s => s.latitude)
      const lons = validShips.map(s => s.longitude)
      instanceRef.current.fitBounds([
        [Math.min(...lats), Math.min(...lons)],
        [Math.max(...lats), Math.max(...lons)],
      ], { padding: [30, 30] })
      fittedRef.current = true
    }
  }, [ships])

  return <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
}
