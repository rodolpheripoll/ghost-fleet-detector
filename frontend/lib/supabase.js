import { createClient } from '@supabase/supabase-js'
import { createContext } from 'react'

// Fallback placeholders allow the build to succeed even without env vars.
// Replace with real values in Vercel dashboard (Settings → Environment Variables).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * ModeContext
 * mode = "demo" → data comes from Supabase (pre-loaded by Python pipeline from CSV)
 * mode = "live" → data comes from aisstream.io real-time WebSocket via /api/live-ships
 *
 * The context value is { mode, setMode } so any component can read and update the mode.
 */
export const ModeContext = createContext({ mode: 'demo', setMode: () => {} })
