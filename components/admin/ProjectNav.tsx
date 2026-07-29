'use client'

import Link from 'next/link'

export type ProjectNavTab = 'oversikt' | 'pitch' | 'email' | 'quote' | 'contract'

export type ProjectNavProps = {
  projectId: string
  projectTitle: string
  customerName?: string | null
  activeTab: ProjectNavTab
}

const TABS: { id: ProjectNavTab; label: string; href: (id: string) => string }[] = [
  { id: 'oversikt',  label: 'Oversikt',  href: (id) => `/admin/projects/${id}` },
  { id: 'pitch',     label: 'Pitch',     href: (id) => `/admin/projects/${id}/edit` },
  { id: 'email',     label: 'E-post',    href: (id) => `/admin/projects/${id}/email` },
  { id: 'quote',     label: 'Tilbud',    href: (id) => `/admin/projects/${id}/quote` },
  { id: 'contract',  label: 'Kontrakt',  href: (id) => `/admin/projects/${id}/contract` },
]

export function ProjectNav({ projectId, projectTitle, customerName, activeTab }: ProjectNavProps) {
  return (
    <div
      style={{
        borderBottom: '1px solid #2A261F',
        paddingBottom: 0,
        marginBottom: 24,
      }}
    >
      {/* Toprad: tilbake-lenke + kontekst-tittel */}
      <div
        className="px-4 md:px-8"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          paddingTop: 16,
          paddingBottom: 12,
        }}
      >
        <Link href="/admin/pitches" style={{ textDecoration: 'none', flexShrink: 0 }}>
          <span
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.6rem',
              letterSpacing: '0.12em',
              color: '#62594E',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              cursor: 'pointer',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLSpanElement).style.color = '#E8E1D5' }}
            onMouseLeave={e => { (e.currentTarget as HTMLSpanElement).style.color = '#62594E' }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 2L4 6l3.5 4" />
            </svg>
            Pitcher
          </span>
        </Link>

        {/* Kundenavn · Prosjekttittel — trunkeres i stedet for å presse siden bredere på mobil */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden' }}>
          {customerName && (
            <>
              <span
                style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.6rem',
                  letterSpacing: '0.06em',
                  color: '#62594E',
                  flexShrink: 0,
                }}
                className="hidden sm:inline"
              >
                {customerName}
              </span>
              <span style={{ color: '#38332A', fontSize: '0.55rem', flexShrink: 0 }} className="hidden sm:inline">·</span>
            </>
          )}
          <span
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.6rem',
              letterSpacing: '0.06em',
              color: '#E8E1D5',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {projectTitle}
          </span>
        </div>
      </div>

      {/* Tabrad — scroller horisontalt på mobil i stedet for å overflowe siden */}
      <div
        className="px-4 md:px-8"
        style={{
          display: 'flex',
          gap: 0,
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <Link key={tab.id} href={tab.href(projectId)} style={{ textDecoration: 'none' }}>
              <span
                style={{
                  display: 'block',
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.6rem',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: isActive ? '#C49434' : '#62594E',
                  borderBottom: `2px solid ${isActive ? '#C49434' : 'transparent'}`,
                  padding: '10px 16px',
                  marginBottom: -1,
                  cursor: 'pointer',
                  fontWeight: isActive ? 500 : 400,
                  transition: 'color 0.15s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => {
                  if (!isActive) (e.currentTarget as HTMLSpanElement).style.color = '#E8E1D5'
                }}
                onMouseLeave={e => {
                  if (!isActive) (e.currentTarget as HTMLSpanElement).style.color = '#62594E'
                }}
              >
                {tab.label}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
