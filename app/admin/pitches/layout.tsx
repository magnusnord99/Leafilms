'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { C } from '@/lib/admin-theme'

const tabs = [
  { label: 'Pitcher',     href: '/admin/pitches',            exact: true },
  { label: 'Cases',       href: '/admin/pitches/cases' },
  { label: 'Bilder',      href: '/admin/pitches/images' },
  { label: 'Film',        href: '/admin/pitches/videos' },
  { label: 'AI-tekster',  href: '/admin/pitches/ai-examples' },
]

export default function PitchesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div>
      {/* Sticky sub-nav — sits below the 48px admin header */}
      <div style={{
        position: 'sticky',
        top: 48,
        zIndex: 30,
        background: C.sidebar,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div className="pitches-subnav" style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}>
          {tabs.map(tab => {
            const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href)
            return (
              <Link key={tab.href} href={tab.href} style={{ textDecoration: 'none', flexShrink: 0 }}>
                <div
                  style={{
                    padding: '11px 14px',
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: '0.72rem',
                    fontWeight: active ? 500 : 400,
                    color: active ? C.text : C.text3,
                    borderBottom: `2px solid ${active ? C.accent : 'transparent'}`,
                    cursor: 'pointer',
                    transition: 'color 0.12s',
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => {
                    if (!active) (e.currentTarget as HTMLDivElement).style.color = C.text2
                  }}
                  onMouseLeave={e => {
                    if (!active) (e.currentTarget as HTMLDivElement).style.color = C.text3
                  }}
                >
                  {tab.label}
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {children}
      <style>{`.pitches-subnav::-webkit-scrollbar { display: none }`}</style>
    </div>
  )
}
