'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Project, Section } from '@/lib/types'
import { Button, Badge } from '@/components/ui'

const SEND_BTN: React.CSSProperties = {
  fontFamily: 'var(--font-dm-sans)',
  fontSize: '0.72rem',
  fontWeight: 600,
  letterSpacing: '0.04em',
  padding: '6px 14px',
  borderRadius: 6,
  border: 'none',
  cursor: 'pointer',
  background: '#4CAF7D',
  color: '#fff',
  transition: 'opacity 0.15s, transform 0.1s',
  flexShrink: 0,
}

interface EditProjectTopBarProps {
  project: Project
  sections: Section[]
  editMode: boolean
  saving: boolean
  publishing: boolean
  showMobilePreview: boolean
  shareLink: string | null
  translating?: boolean
  contractHiddenFromPitch?: boolean
  onEditModeToggle: () => void
  onMobilePreviewToggle: () => void
  onSave: () => void
  onPublish: () => void
  onAddQuoteSection: () => void
  onAddFullImageSection?: () => void
  onAddProductionScheduleSection?: () => void
  onDuplicateVersion?: () => void
  onTranslate?: () => void
  onToggleContractHidden?: () => void
  duplicating?: boolean
}

export function EditProjectTopBar({
  project,
  sections,
  editMode,
  saving,
  publishing,
  showMobilePreview,
  shareLink,
  translating = false,
  contractHiddenFromPitch = false,
  onEditModeToggle,
  onMobilePreviewToggle,
  onSave,
  onPublish,
  onAddQuoteSection,
  onAddFullImageSection,
  onAddProductionScheduleSection,
  onDuplicateVersion,
  onTranslate,
  onToggleContractHidden,
  duplicating = false,
}: EditProjectTopBarProps) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  const hasQuote = sections.find(s => s.type === 'quote')

  const secondaryItems = [
    shareLink && {
      label: 'Kopier link',
      action: (e: React.MouseEvent<HTMLButtonElement>) => {
        navigator.clipboard.writeText(shareLink!)
        const btn = e.currentTarget
        const orig = btn.textContent || 'Kopier link'
        btn.textContent = 'Kopiert!'
        setTimeout(() => { btn.textContent = orig }, 2000)
        setMenuOpen(false)
      },
    },
    shareLink && {
      label: 'Kopier signeringslink',
      action: (e: React.MouseEvent<HTMLButtonElement>) => {
        navigator.clipboard.writeText(`${shareLink}/sign`)
        const btn = e.currentTarget
        const orig = btn.textContent || 'Kopier signeringslink'
        btn.textContent = 'Kopiert!'
        setTimeout(() => { btn.textContent = orig }, 2000)
        setMenuOpen(false)
      },
    },
    {
      label: 'E-post →',
      href: `/admin/projects/${project.id}/email`,
    },
    {
      label: 'Statistikk',
      href: `/admin/projects/${project.id}/quote-analytics`,
    },
    {
      label: 'Pristilbud',
      href: `/admin/projects/${project.id}/quote`,
    },
    editMode && onAddFullImageSection && {
      label: '+ Bildeseksjon',
      action: () => { onAddFullImageSection(); setMenuOpen(false) },
    },
    editMode && onAddProductionScheduleSection && {
      label: '+ Produksjonsplan',
      action: () => { onAddProductionScheduleSection(); setMenuOpen(false) },
    },
    editMode && !hasQuote && {
      label: '+ Pristilbud',
      action: () => { onAddQuoteSection(); setMenuOpen(false) },
    },
    onTranslate && {
      label: translating
        ? 'Oversetter...'
        : project.language === 'en' ? 'NO → EN' : 'EN → NO',
      action: () => { if (!translating && !saving) { onTranslate!(); setMenuOpen(false) } },
      disabled: translating || saving,
    },
    onToggleContractHidden && {
      label: contractHiddenFromPitch ? 'Vis kontrakt for kunde' : 'Skjul kontrakt fra kunde',
      action: () => { onToggleContractHidden(); setMenuOpen(false) },
    },
  ].filter(Boolean) as Array<{
    label: string
    action?: (e: React.MouseEvent<HTMLButtonElement>) => void
    href?: string
    disabled?: boolean
  }>

  return (
    <div
      className="sticky top-14 z-30 px-4 sm:px-5 py-2.5 flex items-center justify-between gap-3"
      style={{
        background: 'rgba(12,11,9,0.96)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #2A261F',
      }}
    >
      {/* Left — back + title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={() => router.push(`/admin/projects/${project.id}`)}
          className="flex items-center gap-2 transition-colors flex-shrink-0"
          style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.6rem',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#62594E',
          }}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="hidden sm:inline">Tilbake</span>
        </button>

        <div style={{ width: 1, height: 20, background: '#2A261F', flexShrink: 0 }} />

        <div className="min-w-0">
          <p
            className="truncate"
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.75rem',
              fontWeight: 500,
              color: '#E8E1D5',
              letterSpacing: '0.04em',
            }}
          >
            {project.title}
          </p>
          {project.client_name && (
            <p style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.6rem',
              color: '#62594E',
              letterSpacing: '0.08em',
              marginTop: 1,
            }}>
              {project.client_name}
            </p>
          )}
        </div>

        <div className="flex-shrink-0">
        <Badge variant={project.status as 'draft' | 'published' | 'archived'}>
          {project.status === 'published' ? 'Publisert' : 'Utkast'}
        </Badge>
        </div>
      </div>

      {/* Right — primary actions + "Mer" dropdown */}
      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
        {/* Mobile preview toggle (only on small screens) */}
        <Button
          onClick={onMobilePreviewToggle}
          variant="ghost"
          size="sm"
          className="lg:hidden"
        >
          {showMobilePreview ? 'Rediger' : 'Vis'}
        </Button>

        {/* Secondary actions dropdown */}
        {secondaryItems.length > 0 && (
          <div ref={menuRef} style={{ position: 'relative' }}>
            <Button
              onClick={() => setMenuOpen(o => !o)}
              variant="secondary"
              size="sm"
            >
              Mer {menuOpen ? '▴' : '▾'}
            </Button>
            {menuOpen && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 4px)',
                  background: '#161410',
                  border: '1px solid #2A261F',
                  borderRadius: 3,
                  minWidth: 160,
                  zIndex: 50,
                  overflow: 'hidden',
                }}
              >
                {secondaryItems.map((item, i) =>
                  item.href ? (
                    <Link key={i} href={item.href} onClick={() => setMenuOpen(false)}>
                      <div style={{
                        padding: '9px 14px',
                        fontFamily: 'var(--font-dm-sans)',
                        fontSize: '0.65rem',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: '#9E9287',
                        cursor: 'pointer',
                        borderBottom: i < secondaryItems.length - 1 ? '1px solid #2A261F' : 'none',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#201D18')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        {item.label}
                      </div>
                    </Link>
                  ) : (
                    <button
                      key={i}
                      onClick={item.action}
                      disabled={item.disabled}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '9px 14px',
                        fontFamily: 'var(--font-dm-sans)',
                        fontSize: '0.65rem',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: item.disabled ? '#38332A' : '#9E9287',
                        background: 'transparent',
                        border: 'none',
                        cursor: item.disabled ? 'default' : 'pointer',
                        borderBottom: i < secondaryItems.length - 1 ? '1px solid #2A261F' : 'none',
                      }}
                      onMouseEnter={e => { if (!item.disabled) (e.currentTarget as HTMLElement).style.background = '#201D18' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      {item.label}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        )}

        {/* Ny versjon — flyttet ut av "Mer"-menyen, den var lett å overse der
            (feedback c7ebd472: brukere fant den ikke og redigerte gjeldende pitch direkte). */}
        {onDuplicateVersion && (
          <Button onClick={onDuplicateVersion} disabled={duplicating} variant="secondary" size="sm">
            <span className="hidden sm:inline">{duplicating ? 'Oppretter...' : 'Ny versjon'}</span>
            <span className="sm:hidden">{duplicating ? '...' : 'V+'}</span>
          </Button>
        )}

        {/* Primary actions — always visible */}
        <Button onClick={onEditModeToggle} variant={editMode ? 'primary' : 'secondary'} size="sm">
          {editMode ? 'Rediger' : 'Vis'}
        </Button>

        <Button onClick={onSave} disabled={saving} variant="secondary" size="sm">
          <span className="hidden sm:inline">{saving ? 'Lagrer...' : 'Lagre'}</span>
          <span className="sm:hidden">{saving ? '...' : 'Lagre'}</span>
        </Button>

        {project?.status === 'published' && (
          <Link href={`/admin/projects/${project.id}/email`}>
            <button
              style={SEND_BTN}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)' }}
            >
              Send til kunde →
            </button>
          </Link>
        )}

        <Button
          onClick={onPublish}
          disabled={publishing}
          variant={project?.status === 'published' ? 'danger' : 'primary'}
          size="sm"
        >
          <span className="hidden sm:inline">
            {publishing
              ? (project?.status === 'published' ? 'Avpubliserer...' : 'Publiserer...')
              : (project?.status === 'published' ? 'Avpubliser' : 'Publiser')}
          </span>
          <span className="sm:hidden">
            {publishing ? '...' : (project?.status === 'published' ? 'Avpubliser' : 'Publiser')}
          </span>
        </Button>
      </div>
    </div>
  )
}
