import { createClient } from '@supabase/supabase-js'

// Fallback placeholders allow the build to succeed even without env vars set.
// Replace with real values in Vercel dashboard (Settings → Environment Variables).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export const supabase = createClient(supabaseUrl, supabaseKey)
