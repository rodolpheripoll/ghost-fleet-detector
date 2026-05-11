/**
 * GET /api/live-ships
 * Connects to aisstream.io WebSocket, collects 200 PositionReport messages,
 * and returns them as a JSON array with the same structure as the Supabase ships table.
 *
 * Requires AISSTREAM_API_KEY environment variable (server-side only, not prefixed NEXT_PUBLIC_).
 * Source: https://aisstream.io — free worldwide real-time AIS WebSocket stream.
 */
import WebSocket from 'ws'

const LIMIT   = 200
const TIMEOUT = 25000   // 25 s max collection window

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.AISSTREAM_API_KEY || ''
  if (!apiKey) {
    return res.status(503).json({
      error: 'AISSTREAM_API_KEY not configured on the server.',
      hint:  'Add AISSTREAM_API_KEY to your .env or Vercel environment variables.',
    })
  }

  const records = []

  try {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket('wss://stream.aisstream.io/v0/stream')

      const timer = setTimeout(() => {
        ws.terminate()
        resolve()
      }, TIMEOUT)

      ws.on('open', () => {
        ws.send(JSON.stringify({
          APIKey:             apiKey,
          BoundingBoxes:      [[[-90, -180], [90, 180]]],
          FilterMessageTypes: ['PositionReport'],
        }))
      })

      ws.on('message', (raw) => {
        try {
          const data = JSON.parse(raw.toString())
          if (data?.Message?.PositionReport) {
            const report = data.Message.PositionReport
            records.push({
              mmsi:                String(data.MetaData.MMSI),
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
            })
            if (records.length >= LIMIT) {
              clearTimeout(timer)
              ws.terminate()
              resolve()
            }
          }
        } catch (_) {}
      })

      ws.on('error', (err) => { clearTimeout(timer); reject(err) })
      ws.on('close', () => { clearTimeout(timer); resolve() })
    })
  } catch (err) {
    return res.status(500).json({ error: `WebSocket error: ${err.message}` })
  }

  res.status(200).json(records)
}
