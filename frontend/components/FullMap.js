import { useEffect } from 'react'
import { MapContainer, TileLayer, CircleMarker, Marker, Popup, Tooltip, Rectangle, useMap } from 'react-leaflet'
import L from 'leaflet'

const RISK_COLOR = {
  'Ghost Fleet': '#7f1d1d',
  'Critical':    '#dc2626',
  'Suspect':     '#d97706',
  'High':        '#f97316',
  'Normal':      '#6b7280',
}

const ZONE_COLOR  = { Critical: '#ef4444', High: '#f97316', Medium: '#eab308', Low: '#22c55e' }
const ZONE_OPAC   = { Critical: 0.22, High: 0.16, Medium: 0.10, Low: 0.10 }

const GROUP_PALETTE = [
  '#60a5fa','#34d399','#f472b6','#fbbf24','#a78bfa',
  '#fb923c','#38bdf8','#4ade80','#f87171','#e879f9',
  '#67e8f9','#86efac','#fda4af','#d9f99d','#c4b5fd',
  '#fdba74','#7dd3fc','#6ee7b7','#f9a8d4','#fde68a',
]

function shipColor(ship, colorByGroup, mode) {
  if (colorByGroup && mode === 'graph') {
    const cid = ship.convoy_id ?? 0
    return cid === 0 ? '#7f1d1d' : GROUP_PALETTE[(cid - 1) % GROUP_PALETTE.length]
  }
  if (ship.ais_active === false) return '#fb923c'
  return RISK_COLOR[ship.risk_level] ?? '#6b7280'
}

function shipRadius(ship) {
  const score = parseFloat(ship.score ?? 0)
  const rl    = ship.risk_level ?? ''
  if (rl === 'Ghost Fleet' || rl === 'Critical') return 9
  if (rl === 'Suspect' || rl === 'High')         return 7
  if (score >= 0.3)                              return 6
  return 5
}

function FitBounds({ ships }) {
  const map = useMap()
  useEffect(() => {
    if (!ships.length) return
    const lats = ships.map(s => s.latitude)
    const lons = ships.map(s => s.longitude)
    map.fitBounds(
      [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]],
      { padding: [40, 40], maxZoom: 6 }
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

function ShipPopup({ ship }) {
  const ts = ship.timestamp ? new Date(ship.timestamp).toLocaleString('fr-FR') : 'N/A'
  return (
    <div style={{ fontSize: 12, lineHeight: 1.7, minWidth: 180 }}>
      <b>MMSI :</b> {ship.mmsi}<br />
      <b>Score :</b> {parseFloat(ship.score ?? 0).toFixed(2)}<br />
      <b>Risque :</b> {ship.risk_level ?? 'N/A'}<br />
      <b>Vitesse :</b> {ship.speed ?? 'N/A'} kn<br />
      <b>AIS actif :</b> {String(ship.ais_active)}<br />
      <b>Timestamp :</b> {ts}
    </div>
  )
}

export default function FullMap({ ships = [], zones = [], mode = 'demo', colorByGroup = false }) {
  const valid = ships.filter(s =>
    s.latitude  != null && s.longitude != null &&
    isFinite(s.latitude)  && isFinite(s.longitude) &&
    s.latitude  >= -90  && s.latitude  <= 90 &&
    s.longitude >= -180 && s.longitude <= 180
  )

  const fakeIcon = L.divIcon({
    html: `<div style="background:#dc2626;color:#fff;border-radius:50%;
                       width:18px;height:18px;display:flex;align-items:center;
                       justify-content:center;font-weight:bold;font-size:12px;
                       border:2px solid #fca5a5;line-height:18px;text-align:center">!</div>`,
    className:  '',
    iconSize:   [18, 18],
    iconAnchor: [9, 9],
  })

  return (
    <MapContainer
      center={[20, 20]}
      zoom={3}
      style={{ height: '100%', width: '100%' }}
      preferCanvas
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution="© CARTO"
        maxZoom={19}
      />

      {valid.length > 0 && <FitBounds ships={valid} />}

      {/* Zones de risque */}
      {zones.map((z, i) => {
        const { lat_min, lat_max, lon_min, lon_max, risk_level, name, description } = z
        if (lat_min == null || lon_min == null) return null
        const c = ZONE_COLOR[risk_level] ?? '#94a3b8'
        return (
          <Rectangle
            key={i}
            bounds={[[lat_min, lon_min], [lat_max, lon_max]]}
            pathOptions={{ color: c, weight: 2, fillColor: c, fillOpacity: ZONE_OPAC[risk_level] ?? 0.1 }}
          >
            <Popup>{name} — {risk_level}<br />{description}</Popup>
          </Rectangle>
        )
      })}

      {/* Navires */}
      {valid.map(ship => {
        const mmsi  = String(ship.mmsi)
        const pos   = [ship.latitude, ship.longitude]
        const color = shipColor(ship, colorByGroup, mode)
        const r     = shipRadius(ship)

        if (mmsi.startsWith('FAKE-')) {
          return (
            <Marker key={mmsi} position={pos} icon={fakeIcon}>
              <Popup><b>SPOOFING</b><br /><ShipPopup ship={ship} /></Popup>
              <Tooltip>FAKE — {mmsi}</Tooltip>
            </Marker>
          )
        }

        return (
          <CircleMarker
            key={mmsi}
            center={pos}
            radius={r}
            pathOptions={{ color, fillColor: color, fillOpacity: 0.85, weight: 1 }}
          >
            <Popup><ShipPopup ship={ship} /></Popup>
            <Tooltip>{mmsi} — {ship.risk_level ?? 'Normal'}</Tooltip>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
