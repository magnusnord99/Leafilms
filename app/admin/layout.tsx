'use client'

import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'

const navItems = [
  { href: '/admin', label: 'Dashboard', exact: true },
  { href: '/admin/projects', label: 'Prosjekter' },
  { href: '/admin/customers', label: 'Kunder' },
  { href: '/admin/cases', label: 'Cases' },
  { href: '/admin/team', label: 'Team' },
  { href: '/admin/prices', label: 'Priskatalog' },
  { href: '/admin/images', label: 'Bilder' },
  { href: '/admin/videos', label: 'Videoer' },
  { href: '/admin/ai-examples', label: 'AI Eksempler' },
  { href: '/admin/users', label: 'Brukere' },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, isAdmin, logout } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) {
      router.push('/login')
    }
  }, [loading, user, isAdmin, router])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0C0B09' }}>
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

  const isActive = (item: { href: string; exact?: boolean }) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href)

  const renderNav = (isCollapsed: boolean) => (
    <nav className="flex-1 py-2 overflow-y-auto">
      {navItems.map((item) => {
        const active = isActive(item)
        return (
          <Link key={item.href} href={item.href}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 16px',
                background: active ? 'rgba(196,148,52,0.08)' : 'transparent',
                borderLeft: `2px solid ${active ? '#C49434' : 'transparent'}`,
                color: active ? '#C49434' : '#62594E',
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.65rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                fontWeight: active ? 500 : 400,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {isCollapsed ? item.label.substring(0, 2).toUpperCase() : item.label}
            </div>
          </Link>
        )
      })}
    </nav>
  )

  return (
    <div className="min-h-screen" style={{ background: '#0C0B09', color: '#E8E1D5' }}>
      {/* Sticky top header */}
      <header
        className="sticky top-0 z-50 h-14 flex items-center justify-between px-4 sm:px-6"
        style={{ background: 'rgba(12,11,9,0.98)', borderBottom: '1px solid #2A261F' }}
      >
        <div className="flex items-center gap-3">
          {/* Mobile hamburger */}
          <button
            className="md:hidden flex items-center justify-center"
            onClick={() => setMobileOpen(o => !o)}
            style={{ color: '#62594E', padding: 4, lineHeight: 0 }}
            aria-label="Meny"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" d="M2 4.5h14M2 9h14M2 13.5h14" />
            </svg>
          </button>

          {/* Mobile logo */}
          <div className="flex md:hidden items-center gap-2">
            <div style={{ width: 16, height: 1, background: '#C49434' }} />
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
        </div>

        <div className="flex items-center gap-4">
          {profile && (
            <span className="hidden sm:block" style={{
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
      </header>

      <div className="flex" style={{ minHeight: 'calc(100vh - 56px)' }}>
        {/* Desktop sidebar — fixed */}
        <aside
          className="hidden md:flex flex-col fixed top-14 left-0 bottom-0 z-40 overflow-hidden"
          style={{
            width: collapsed ? 56 : 208,
            background: '#0E0D0B',
            borderRight: '1px solid #2A261F',
            transition: 'width 0.2s ease',
          }}
        >
          {/* Sidebar header with logo + collapse toggle */}
          <div
            className="flex items-center flex-shrink-0"
            style={{
              height: 48,
              padding: '0 12px',
              borderBottom: '1px solid #2A261F',
              justifyContent: collapsed ? 'center' : 'space-between',
            }}
          >
            {!collapsed && (
              <div className="flex items-center gap-2">
                <div style={{ width: 16, height: 1, background: '#C49434' }} />
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
            )}
            <button
              onClick={() => setCollapsed(c => !c)}
              style={{ color: '#62594E', lineHeight: 0, padding: 4 }}
              aria-label={collapsed ? 'Utvid meny' : 'Kollaps meny'}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                {collapsed
                  ? <path strokeLinecap="round" d="M2 3h10M2 7h10M2 11h10" />
                  : <path strokeLinecap="round" d="M10 3L6 7l4 4" />
                }
              </svg>
            </button>
          </div>
          {renderNav(collapsed)}
        </aside>

        {/* Mobile sidebar overlay */}
        {mobileOpen && (
          <>
            <div
              className="fixed inset-0 z-40 md:hidden"
              style={{ background: 'rgba(0,0,0,0.55)' }}
              onClick={() => setMobileOpen(false)}
            />
            <aside
              className="fixed top-14 left-0 bottom-0 z-50 flex flex-col md:hidden"
              style={{ width: 208, background: '#0E0D0B', borderRight: '1px solid #2A261F' }}
            >
              <div
                className="flex items-center gap-2 flex-shrink-0"
                style={{ height: 48, padding: '0 16px', borderBottom: '1px solid #2A261F' }}
              >
                <div style={{ width: 16, height: 1, background: '#C49434' }} />
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
              {renderNav(false)}
            </aside>
          </>
        )}

        {/* Main content */}
        <main
          className={`flex-1 min-w-0 ${collapsed ? 'md:ml-14' : 'md:ml-52'}`}
          style={{ transition: 'margin-left 0.2s ease' }}
        >
          {children}
        </main>
      </div>
    </div>
  )
}
