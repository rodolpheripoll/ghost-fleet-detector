import { createClient } from '@supabase/supabase-js'
import { createContext } from 'react'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export const supabase = createClient(supabaseUrl, supabaseKey)

/**
 * ModeContext
 * mode = "demo"  → rules + Isolation Forest scoring → reads from table 'ships'
 * mode = "graph" → graph theory scoring             → reads from table 'ships_graph'
 */
export const ModeContext = createContext({ mode: 'demo', setMode: () => {} })
