'use client'

import { useAuth } from '@/hooks/useAuth'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { NotificationBell } from '@/components/admin/NotificationBell'
import { MeldingerBadge } from '@/components/admin/MeldingerBadge'
import { FeedbackButton } from '@/components/admin/FeedbackButton'
import { AIChatButton } from '@/components/ai/AIChatButton'
import { C } from '@/lib/admin-theme'
import { getAvatarColor } from '@/lib/avatar-colors'
import { isPathAllowedForRole, isStaffRole } from '@/lib/permissions'

type NavItem = { href: string; label: string; exact?: boolean }
type NavGroup = { label: string | null; items: NavItem[] }

const navGroups: NavGroup[] = [
  {
    label: null,
    items: [
      { href: '/admin',         label: 'Dashboard', exact: true },
      { href: '/admin/projects', label: 'Prosjekter' },
      { href: '/admin/pipeline', label: 'Pipeline' },
      { href: '/admin/tasks',   label: 'Mine oppgaver' },
      { href: '/admin/internal', label: 'Interne oppgaver' },
      { href: '/admin/varsler', label: 'Varsler' },
      { href: '/admin/meldinger', label: 'Meldinger' },
    ],
  },
  {
    label: 'Salg & CRM',
    items: [
      { href: '/admin/leads',     label: 'Leads' },
      { href: '/admin/pitches',   label: 'Pitcher' },
      { href: '/admin/tapte',     label: 'Tapte prosjekter' },
      { href: '/admin/customers', label: 'Kunder' },
      { href: '/admin/email',     label: 'E-post' },
    ],
  },
  {
    label: 'Produksjon',
    items: [
      { href: '/admin/calendar', label: 'Kalender' },
      { href: '/admin/preprod',    label: 'Pre-prod' },
      { href: '/admin/utstyr',     label: 'Utstyr' },
      { href: '/admin/boards',     label: 'Boards' },
      { href: '/admin/postprod',   label: 'Post-prod' },
      { href: '/admin/selections',  label: 'Gallerier' },
      { href: '/admin/transfers',   label: 'Leveranser' },
    ],
  },
  {
    label: 'Finans',
    items: [
      { href: '/admin/prices',          label: 'Priskatalog' },
      { href: '/admin/okonomi',         label: 'Økonomi' },
      { href: '/admin/market-analysis', label: 'Markedsanalyse' },
    ],
  },
  {
    label: null,
    items: [
      { href: '/admin/team',       label: 'Team' },
      { href: '/admin/users',      label: 'Brukere' },
      { href: '/admin/feedback',   label: 'Tilbakemeldinger' },
    ],
  },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, isStaff, logout } = useAuth()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    // Hard redirect, samme begrunnelse som RBAC-guarden under — router.push() kan bli stille
    // droppet ved en fersk mount av layouten. middleware.ts fanger det vanlige tilfellet
    // (ikke innlogget) allerede server-side; dette er et sekundært sikkerhetsnett for når
    // profilen blir ugyldig mens man allerede er inne på en admin-side.
    if (!loading && (!user || !isStaff)) window.location.href = '/login'
  }, [loading, user, isStaff])

  // Sperre for direkte URL-navigasjon til sider rollen ikke skal ha tilgang til, forbi
  // menyfiltreringen — meny skjuler kun lenken, denne håndhever den faktisk.
  useEffect(() => {
    if (loading || !isStaffRole(profile?.role)) return
    // Hard redirect (ikke router.push) — dette kjører rett etter en fersk mount av layouten
    // (typisk direkte URL-navigasjon forbi menyen), der en client-side push kan bli stille
    // droppet mens routeren fortsatt er i ferd med å bli klar. window.location.href garanterer
    // at siden faktisk skifter, i tillegg til at det gir en ren re-hydrering uten at data fra
    // den utilgjengelige siden rekker å bli værende i klienttilstand.
    if (!isPathAllowedForRole(profile.role, pathname)) window.location.href = '/admin'
  }, [loading, profile, pathname])

  // Lukk mobilmenyen ved navigasjon (state-justering under render, jf. react.dev)
  const [prevPathname, setPrevPathname] = useState(pathname)
  if (prevPathname !== pathname) {
    setPrevPathname(pathname)
    setMobileOpen(false)
  }

  useEffect(() => {
    document.body.classList.add('admin-page')
    return () => { document.body.classList.remove('admin-page') }
  }, [])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, letterSpacing: '0.08em' }}>
          Laster...
        </p>
      </div>
    )
  }

  if (!user || !isStaff) return null

  const role = isStaffRole(profile?.role) ? profile.role : 'sales'
  // Filtreres på selve lenken (isPathAllowedForRole) — samme kilde som redirect-guarden under,
  // slik at meny og faktisk håndheving aldri kan divergere (item-nivå, ikke bare gruppe-nivå,
  // siden f.eks. "Brukere" er admin-only mens resten av samme (ugrupperte) seksjon ikke er det).
  const visibleNavGroups = navGroups
    .map(group => ({ ...group, items: group.items.filter(item => isPathAllowedForRole(role, item.href)) }))
    .filter(group => group.items.length > 0)

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href)

  const NavLink = ({ item, col }: { item: NavItem; col: boolean }) => {
    const active = isActive(item)
    return (
      <Link href={item.href} style={{ textDecoration: 'none' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: col ? '8px 0' : '8px 16px',
            justifyContent: col ? 'center' : 'flex-start',
            background: active ? C.accentBg : 'transparent',
            borderLeft: `2px solid ${active ? C.accent : 'transparent'}`,
            color: active ? C.text : C.text3,
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.8rem',
            fontWeight: active ? 500 : 400,
            letterSpacing: '0.01em',
            cursor: 'pointer',
            transition: 'color 0.12s, background 0.12s',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
          onMouseEnter={e => {
            if (!active) {
              (e.currentTarget as HTMLDivElement).style.color = C.text2
              ;(e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)'
            }
          }}
          onMouseLeave={e => {
            if (!active) {
              (e.currentTarget as HTMLDivElement).style.color = C.text3
              ;(e.currentTarget as HTMLDivElement).style.background = 'transparent'
            }
          }}
        >
          {col ? item.label.substring(0, 2) : item.label}
          {item.href === '/admin/meldinger' && <MeldingerBadge />}
        </div>
      </Link>
    )
  }

  const renderNav = (col: boolean) => (
    <nav style={{ flex: 1, paddingTop: 4, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {visibleNavGroups.map((group, gi) => (
        <div key={gi}>
          {/* Skillelinje mellom grupper (ikke første) */}
          {gi > 0 && (
            <div style={{ height: 1, background: C.border, margin: col ? '6px 8px' : '6px 16px' }} />
          )}
          {/* Seksjonstittel — bare i utvidet modus */}
          {!col && group.label && (
            <div style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.58rem',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: C.text3,
              padding: '8px 18px 4px',
              opacity: 0.7,
            }}>
              {group.label}
            </div>
          )}
          {group.items.map(item => <NavLink key={item.href} item={item} col={col} />)}
        </div>
      ))}
    </nav>
  )

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text }}>

      {/* Top header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          background: C.sidebar,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Mobile hamburger */}
          <button
            className="md:hidden"
            onClick={() => setMobileOpen(o => !o)}
            style={{ color: C.text3, padding: 4, lineHeight: 0, background: 'none', border: 'none', cursor: 'pointer' }}
            aria-label="Meny"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" d="M2 4.5h14M2 9h14M2 13.5h14" />
            </svg>
          </button>

          <div className="flex md:hidden items-center gap-2">
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600, color: C.text, letterSpacing: '0.02em' }}>
              Leafilms
            </span>
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>
              Admin
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <NotificationBell />
          {profile && (
            <Link
              href="/admin/profile"
              className="hidden sm:flex"
              style={{ alignItems: 'center', gap: 8, textDecoration: 'none' }}
            >
              <span style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                background: getAvatarColor(profile), color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700,
              }}>
                {(profile.name || profile.email)[0].toUpperCase()}
              </span>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
                {profile.name || profile.email}
              </span>
            </Link>
          )}
          <button
            onClick={logout}
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.72rem',
              color: C.text3,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            Logg ut
          </button>
        </div>
      </header>

      <div style={{ display: 'flex', minHeight: 'calc(100vh - 48px)' }}>

        {/* Desktop sidebar */}
        <aside
          className="hidden md:flex flex-col"
          style={{
            position: 'fixed',
            top: 48,
            left: 0,
            bottom: 0,
            zIndex: 40,
            width: collapsed ? 52 : 200,
            background: C.sidebar,
            borderRight: `1px solid ${C.border}`,
            transition: 'width 0.18s ease',
            overflow: 'hidden',
          }}
        >
          {/* Sidebar header */}
          <div
            style={{
              height: 44,
              display: 'flex',
              alignItems: 'center',
              padding: '0 12px',
              borderBottom: `1px solid ${C.border}`,
              justifyContent: collapsed ? 'center' : 'space-between',
              flexShrink: 0,
            }}
          >
            {!collapsed && (
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', fontWeight: 600, color: C.text, letterSpacing: '0.01em' }}>
                Leafilms
              </span>
            )}
            <button
              onClick={() => setCollapsed(c => !c)}
              style={{ color: C.text3, lineHeight: 0, padding: 4, background: 'none', border: 'none', cursor: 'pointer' }}
              aria-label={collapsed ? 'Utvid' : 'Kollaps'}
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

        {/* Mobile overlay */}
        {mobileOpen && (
          <>
            <div
              className="fixed inset-0 z-40 md:hidden"
              style={{ background: 'rgba(0,0,0,0.6)' }}
              onClick={() => setMobileOpen(false)}
            />
            <aside
              className="fixed top-12 left-0 bottom-0 z-50 flex flex-col md:hidden"
              style={{ width: 200, background: C.sidebar, borderRight: `1px solid ${C.border}` }}
            >
              <div style={{ height: 44, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', fontWeight: 600, color: C.text }}>
                  Leafilms
                </span>
              </div>
              {renderNav(false)}
            </aside>
          </>
        )}

        {/* Main content */}
        <main
          className={collapsed ? 'md:ml-[52px]' : 'md:ml-[200px]'}
          style={{ flex: 1, minWidth: 0, transition: 'margin-left 0.18s ease' }}
        >
          {children}
        </main>
      </div>

      <AIChatButton />
      <FeedbackButton />
    </div>
  )
}
