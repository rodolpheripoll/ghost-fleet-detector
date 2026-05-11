/**
 * GET /api/live-ships
 * Connects to aisstream.io WebSocket, collects up to 100 PositionReport messages
 * within 8 seconds, and returns them as JSON (same shape as Supabase ships table).
 *
 * Uses the native WebSocket global available in Node 22+ (Vercel Node 24.x).
 * Requires AISSTREAM_API_KEY env var (server-side only).
 */

export const maxDuration = 10   // Vercel Hobby max is 10s

const LIMIT   = 100
const TIMEOUT = 8000   // 8 s — safely under Vercel 10 s limit

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
      // Use native WebSocket (Node 22+ / Vercel Node 24.x — no external package needed)
      const ws = new WebSocket('wss://stream.aisstream.io/v0/stream')

      const timer = setTimeout(() => {
        ws.close()
        resolve()
      }, TIMEOUT)

      ws.onopen = () => {
        ws.send(JSON.stringify({
          APIKey:             apiKey,
          BoundingBoxes:      [[[-90, -180], [90, 180]]],
          FilterMessageTypes: ['PositionReport'],
        }))
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
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
              ws.close()
              resolve()
            }
          }
        } catch (_) {}
      }

      ws.onerror = (event) => { clearTimeout(timer); reject(new Error(event.message || 'WebSocket error')) }
      ws.onclose = ()      => { clearTimeout(timer); resolve() }
    })
  } catch (err) {
    return res.status(500).json({ error: `WebSocket error: ${err.message}` })
  }

  res.status(200).json(records)
}
