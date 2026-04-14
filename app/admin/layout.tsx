'use client'

import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, profile, loading, isAdmin, logout } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push('/login')
    }
  }, [loading, user, isAdmin, router])

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: '#0C0B09' }}
      >
        <div className="flex items-center gap-3">
          <div style={{ width: 1, height: 24, background: '#C49434', opacity: 0.5 }} />
          <p style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.6rem',
            letterSpacing: '0.16em',
            color: '#62594E',
            textTransform: 'uppercase',
          }}>
            Laster...
          </p>
        </div>
      </div>
    )
  }

  if (!user || !isAdmin) return null

  return (
    <div className="min-h-screen" style={{ background: '#0C0B09', color: '#E8E1D5' }}>
      {/* Header */}
      <header style={{ borderBottom: '1px solid #2A261F', background: 'rgba(12,11,9,0.98)' }}>
        <div className="max-w-7xl mx-auto px-6 sm:px-8">
          <div className="flex justify-between items-center h-14">
            <div className="flex items-center gap-4">
              {/* Logo mark */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 20, height: 1, background: '#C49434' }} />
                <span style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.6rem',
                  letterSpacing: '0.2em',
                  color: '#C49434',
                  textTransform: 'uppercase',
                  fontWeight: 500,
                }}>
                  Leafilms
                </span>
              </div>
              <span style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.6rem',
                letterSpacing: '0.12em',
                color: '#38332A',
                textTransform: 'uppercase',
              }}>
                Admin
              </span>
            </div>
            <div className="flex items-center gap-4">
              {profile && (
                <span style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.65rem',
                  color: '#62594E',
                  letterSpacing: '0.06em',
                }}>
                  {profile.name || profile.email}
                </span>
              )}
              <Button variant="ghost" size="sm" onClick={logout}>
                Logg ut
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main>{children}</main>
    </div>
  )
}
