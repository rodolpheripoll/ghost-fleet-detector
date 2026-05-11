/**
 * MapPreview — small Leaflet map for the dashboard.
 * Ships are colored by risk level.
 * Must be imported with dynamic({ ssr: false }).
 */
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet'

const RISK_COLORS = {
  'Ghost Fleet': '#7f1d1d',
  'Critical':    '#dc2626',
  'Suspect':     '#d97706',
  'Normal':      '#6b7280',
}

function getRiskColor(ship) {
  return RISK_COLORS[ship.risk_level] ?? '#6b7280'
}

export default function MapPreview({ ships = [] }) {
  // Compute center from average lat/lon
  const validShips = ships.filter(s => s.latitude != null && s.longitude != null)
  if (!validShips.length) return null

  const avgLat = validShips.reduce((s, v) => s + v.latitude, 0) / validShips.length
  const avgLon = validShips.reduce((s, v) => s + v.longitude, 0) / validShips.length

  return (
    <MapContainer
      center={[avgLat, avgLon]}
      zoom={4}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://carto.com">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      {validShips.map(ship => (
        <CircleMarker
          key={ship.mmsi}
          center={[ship.latitude, ship.longitude]}
          radius={ship.score >= 0.6 ? 7 : 5}
          pathOptions={{
            color:       getRiskColor(ship),
            fillColor:   getRiskColor(ship),
            fillOpacity: 0.85,
            weight:      1,
          }}
        >
          <Popup>
            <div className="text-xs">
              <b>MMSI:</b> {ship.mmsi}<br />
              <b>Score:</b> {parseFloat(ship.score).toFixed(2)}<br />
              <b>Risque:</b> {ship.risk_level}<br />
              <b>Vitesse:</b> {ship.speed} kn
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
