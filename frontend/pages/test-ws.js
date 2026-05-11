import { useState } from 'react'

export default function TestWS() {
  const [logs,   setLogs]   = useState([])
  const [status, setStatus] = useState('idle')

  const addLog = (msg) => {
    const ts = new Date().toISOString().substring(11, 23)
    setLogs(prev => [...prev, `${ts} — ${msg}`])
  }

  const testConnection = () => {
    setLogs([])
    setStatus('connecting')

    const key = process.env.NEXT_PUBLIC_AISSTREAM_API_KEY || '169d5e6303ef39ddf5fe87798f6e95a939f3e863'
    addLog(`API Key: ${key ? key.substring(0, 10) + '...' : 'MISSING'}`)
    addLog('Opening WebSocket to wss://stream.aisstream.io/v0/stream ...')

    const ws = new WebSocket('wss://stream.aisstream.io/v0/stream')

    ws.onopen = () => {
      setStatus('connected')
      addLog('✅ WebSocket OPENED')
      const msg = {
        APIKey:             key,
        BoundingBoxes:      [[[-90, -180], [90, 180]]],
        FilterMessageTypes: ['PositionReport'],
      }
      ws.send(JSON.stringify(msg))
      addLog('📤 Subscription sent: ' + JSON.stringify(msg).substring(0, 80))
    }

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data?.Message?.PositionReport) {
          const r    = data.Message.PositionReport
          const mmsi = data.MetaData?.MMSI
          addLog(`🚢 Ship: MMSI=${mmsi} lat=${r.Latitude?.toFixed(4)} lon=${r.Longitude?.toFixed(4)} sog=${r.Sog}`)
          setStatus('receiving')
        } else {
          addLog(`📩 Other message: ${e.data.substring(0, 120)}`)
        }
      } catch (err) {
        addLog(`⚠️ Parse error: ${err.message} — raw: ${e.data.substring(0, 80)}`)
      }
    }

    ws.onerror = (e) => {
      setStatus('error')
      addLog(`❌ ERROR: type=${e.type}`)
    }

    ws.onclose = (e) => {
      setStatus('closed')
      addLog(`🔴 CLOSED — code: ${e.code} | reason: "${e.reason}" | wasClean: ${e.wasClean}`)
    }

    // Auto-close after 15s
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        addLog('⏱ 15s timeout — closing')
        ws.close()
      }
    }, 15000)
  }

  const statusColor = {
    idle:       '#64748b',
    connecting: '#f59e0b',
    connected:  '#10b981',
    receiving:  '#10b981',
    error:      '#ef4444',
    closed:     '#ef4444',
  }[status] || '#64748b'

  return (
    <div style={{ padding: 24, background: '#0f172a', minHeight: '100vh', color: 'white', fontFamily: 'monospace' }}>
      <h1 style={{ marginBottom: 8, fontSize: 20 }}>AisStream WebSocket Test</h1>
      <p style={{ marginBottom: 16, color: '#94a3b8' }}>
        Tests the direct browser → aisstream.io WebSocket connection
      </p>

      <div style={{ marginBottom: 16 }}>
        <span>Status: </span>
        <strong style={{ color: statusColor }}>{status}</strong>
      </div>

      <button
        onClick={testConnection}
        style={{
          padding: '10px 24px', marginBottom: 20, cursor: 'pointer',
          background: '#1d4ed8', color: 'white', border: 'none',
          borderRadius: 8, fontSize: 14, fontFamily: 'monospace',
        }}
      >
        ▶ Test Connection
      </button>

      <div style={{
        background: '#1e293b', padding: 16, borderRadius: 8,
        maxHeight: 520, overflowY: 'auto', border: '1px solid #334155',
      }}>
        {logs.length === 0
          ? <p style={{ color: '#475569' }}>Click "Test Connection" to start...</p>
          : logs.map((log, i) => (
            <div key={i} style={{ marginBottom: 5, fontSize: 13, lineHeight: 1.5 }}>{log}</div>
          ))
        }
      </div>

      <p style={{ marginTop: 16, color: '#475569', fontSize: 12 }}>
        Expected: ✅ OPENED → 📤 Subscription → 🚢 Ships arriving
      </p>
    </div>
  )
}
