import { useEffect, useRef, useState } from 'react'

// API key is a free public streaming key — acceptable to include client-side
const AISSTREAM_KEY = process.env.NEXT_PUBLIC_AISSTREAM_API_KEY || '169d5e6303ef39ddf5fe87798f6e95a939f3e863'

/**
 * React hook — connects to aisstream.io directly from the browser.
 * Auto-reconnects if the server closes the connection.
 * Returns { ships, status, error }
 * status: 'idle' | 'connecting' | 'live' | 'reconnecting' | 'error'
 */
export function useAisStream(enabled) {
  const [ships,  setShips]  = useState([])
  const [status, setStatus] = useState('idle')
  const [error,  setError]  = useState(null)

  const wsRef       = useRef(null)
  const mapRef      = useRef({})
  const retryRef    = useRef(null)
  const activeRef   = useRef(false)  // tracks whether we should stay connected

  useEffect(() => {
    if (!enabled) {
      activeRef.current = false
      clearTimeout(retryRef.current)
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
      setStatus('idle')
      return
    }

    activeRef.current = true
    mapRef.current = {}

    function connect() {
      if (!activeRef.current) return

      setStatus(prev => prev === 'live' ? 'reconnecting' : 'connecting')
      setError(null)

      const ws = new WebSocket('wss://stream.aisstream.io/v0/stream')
      wsRef.current = ws

      ws.onopen = () => {
        if (!activeRef.current) { ws.close(); return }
        ws.send(JSON.stringify({
          APIKey:             AISSTREAM_KEY,
          BoundingBoxes:      [[[-90, -180], [90, 180]]],
          FilterMessageTypes: ['PositionReport'],
        }))
        setStatus('live')
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data?.Message?.PositionReport) {
            const report = data.Message.PositionReport
            const mmsi   = String(data.MetaData.MMSI)
            mapRef.current[mmsi] = {
              mmsi,
              timestamp:           data.MetaData.time_utc,
              latitude:            report.Latitude,
              longitude:           report.Longitude,
              speed:               report.Sog   ?? 0,
              course:              report.Cog   ?? null,
              status:              String(report.NavigationalStatus ?? ''),
              ais_active:          true,
              navigational_status: report.NavigationalStatus ?? 0,
              score:               0,
              risk_level:          'Normal',
            }
            setShips(Object.values(mapRef.current))
          }
        } catch (_) {}
      }

      ws.onerror = () => {
        setError('Erreur de connexion aisstream.io')
      }

      ws.onclose = () => {
        wsRef.current = null
        if (!activeRef.current) return
        // Auto-reconnect after 2 seconds
        retryRef.current = setTimeout(connect, 2000)
      }
    }

    connect()

    return () => {
      activeRef.current = false
      clearTimeout(retryRef.current)
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
    }
  }, [enabled])

  return { ships, status, error }
}
