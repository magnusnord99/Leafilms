'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import type { User } from '@supabase/supabase-js'

interface Profile {
  id: string
  email: string
  role: 'admin' | 'customer'
  name: string | null
  customer_id: string | null
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    let mounted = true
    let profileFetched = false

    // Listen for auth changes first (this is more reliable)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return

      setUser(session?.user ?? null)
      
      // Only fetch profile on INITIAL_SESSION event
      // INITIAL_SESSION means Supabase has finished initializing and session is ready
      if (event === 'INITIAL_SESSION' && session?.user) {
        profileFetched = true
        await fetchProfile(session.user.id)
      } else if (!session) {
        setProfile(null)
        setLoading(false)
      }
    })

    // Get initial session (but don't wait too long if onAuthStateChange already handled it)
    const timeoutId = setTimeout(() => {
      if (mounted && !profileFetched) {
        supabase.auth.getSession()
          .then(({ data: { session }, error }) => {
            if (!mounted || profileFetched) return
            
            if (error) {
              setLoading(false)
              return
            }

            setUser(session?.user ?? null)
            if (session?.user) {
              profileFetched = true
              fetchProfile(session.user.id)
            } else {
              setLoading(false)
            }
          })
          .catch(() => {
            if (mounted && !profileFetched) {
              setLoading(false)
            }
          })
      }
    }, 100) // Short delay to let onAuthStateChange fire first

    return () => {
      mounted = false
      clearTimeout(timeoutId)
      subscription.unsubscribe()
    }
  }, [])

  async function fetchProfile(userId: string) {
    try {
      // Add timeout to prevent hanging
      const profilePromise = supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Profile fetch timeout')), 3000)
      )

      const { data, error } = await Promise.race([
        profilePromise,
        timeoutPromise
      ]) as { data: any, error: any }

      if (error) {
        throw error
      }

      setProfile(data as Profile)
    } catch (error: any) {
      // Only log errors in development
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching profile:', error)
      }
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const isAdmin = profile?.role === 'admin'

  return {
    user,
    profile,
    loading,
    isAdmin,
    logout,
  }
}

