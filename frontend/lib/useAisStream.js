import { useEffect, useRef, useState } from 'react'

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

  const wsRef     = useRef(null)
  const mapRef    = useRef({})
  const retryRef  = useRef(null)
  const activeRef = useRef(false)

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

      console.log('[AisStream] API Key:', AISSTREAM_KEY ? AISSTREAM_KEY.substring(0, 10) + '...' : 'MISSING')
      console.log('[AisStream] Attempting WebSocket connection...')

      setStatus(prev => prev === 'live' ? 'reconnecting' : 'connecting')
      setError(null)

      const ws = new WebSocket('wss://stream.aisstream.io/v0/stream')
      wsRef.current = ws

      ws.onopen = () => {
        console.log('[AisStream] WebSocket OPENED successfully')
        if (!activeRef.current) { ws.close(); return }
        const msg = {
          APIKey:             AISSTREAM_KEY,
          BoundingBoxes:      [[[-90, -180], [90, 180]]],
          FilterMessageTypes: ['PositionReport'],
        }
        ws.send(JSON.stringify(msg))
        console.log('[AisStream] Subscription sent:', JSON.stringify(msg).substring(0, 100))
        setStatus('live')
      }

      ws.onmessage = async (event) => {
        // aisstream.io sends binary frames in browsers — convert Blob to text first
        const text = typeof event.data === 'string' ? event.data : await event.data.text()
        console.log('[AisStream] Message received:', text.substring(0, 200))
        try {
          const data = JSON.parse(text)
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

      ws.onerror = (error) => {
        console.error('[AisStream] WebSocket ERROR:', error)
        console.error('[AisStream] Error type:', error.type)
        setError('Erreur de connexion aisstream.io')
      }

      ws.onclose = (event) => {
        console.warn('[AisStream] WebSocket CLOSED')
        console.warn('[AisStream] Close code:', event.code)
        console.warn('[AisStream] Close reason:', event.reason)
        console.warn('[AisStream] Was clean:', event.wasClean)
        wsRef.current = null
        if (!activeRef.current) return
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
