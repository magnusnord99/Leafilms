'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Client-side Supabase client for use in Client Components
 * This properly handles cookies for SSR compatibility
 * Singleton instance to avoid creating multiple clients
 * 
 * Uses lazy initialization to prevent build-time errors when env vars are not available
 */
let supabaseClient: SupabaseClient | undefined

function getClient(): SupabaseClient {
  // Only initialize in browser environment
  // During build/SSR, this will return undefined and components should handle it
  if (typeof window === 'undefined') {
    // Return a dummy client that won't be used during build
    // This prevents build errors but won't work at runtime
    const dummyUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
    const dummyKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'
    return createBrowserClient(dummyUrl, dummyKey)
  }

  if (supabaseClient) {
    return supabaseClient
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set')
  }

  supabaseClient = createBrowserClient(supabaseUrl, supabaseAnonKey)
  return supabaseClient
}

// Export singleton instance directly
// During build, this will create a dummy client that won't be used
export const supabase = getClient()

// Also export function for backwards compatibility if needed
export function createClient() {
  return getClient()
}

