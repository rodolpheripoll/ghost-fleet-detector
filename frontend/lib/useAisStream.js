import { useEffect, useRef, useState } from 'react'

/**
 * React hook — connects to aisstream.io directly from the browser.
 * Returns { ships, status, error } where status is 'connecting'|'live'|'closed'|'error'.
 *
 * We connect client-side to avoid Vercel serverless function timeouts and
 * server IP blocks that aisstream.io may apply to datacenter requests.
 */
export function useAisStream(enabled) {
  const [ships,  setShips]  = useState([])
  const [status, setStatus] = useState('idle')
  const [error,  setError]  = useState(null)
  const wsRef = useRef(null)
  const mapRef = useRef({})   // mmsi → ship object, deduplicated

  useEffect(() => {
    if (!enabled) {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
      return
    }

    const apiKey = process.env.NEXT_PUBLIC_AISSTREAM_API_KEY || ''
    if (!apiKey) {
      setError('NEXT_PUBLIC_AISSTREAM_API_KEY not configured')
      setStatus('error')
      return
    }

    setStatus('connecting')
    setError(null)
    mapRef.current = {}

    const ws = new WebSocket('wss://stream.aisstream.io/v0/stream')
    wsRef.current = ws

    ws.onopen = () => {
      ws.send(JSON.stringify({
        APIKey:             apiKey,
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
      setError('Connexion aisstream.io echouee')
      setStatus('error')
    }

    ws.onclose = () => {
      setStatus('closed')
    }

    return () => {
      ws.close()
      wsRef.current = null
    }
  }, [enabled])

  return { ships, status, error }
}
