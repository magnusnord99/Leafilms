/**
 * Legacy Supabase client export
 * Re-exports the singleton instance from supabase-client.ts for backwards compatibility
 * 
 * This ensures all client-side components use the same singleton instance,
 * preventing "Multiple GoTrueClient instances" warnings.
 * 
 * For server-side API routes that need authentication, use:
 * import { createClient } from '@/lib/supabase-server'
 */

// Re-export singleton instance for client-side use
// This ensures we only have one Supabase client instance across the entire app
export { supabase } from './supabase-client'

