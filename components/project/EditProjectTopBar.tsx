'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Project, Section } from '@/lib/types'
import { Button, Badge } from '@/components/ui'

interface EditProjectTopBarProps {
  project: Project
  sections: Section[]
  editMode: boolean
  saving: boolean
  publishing: boolean
  showMobilePreview: boolean
  shareLink: string | null
  onEditModeToggle: () => void
  onMobilePreviewToggle: () => void
  onSave: () => void
  onPublish: () => void
  onAddQuoteSection: () => void
  onAddFullImageSection?: () => void
  onDuplicateVersion?: () => void
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
  onEditModeToggle,
  onMobilePreviewToggle,
  onSave,
  onPublish,
  onAddQuoteSection,
  onAddFullImageSection,
  onDuplicateVersion,
  duplicating = false,
}: EditProjectTopBarProps) {
  const router = useRouter()

  return (
    <div
      className="sticky top-0 z-40 px-5 py-3 flex items-center justify-between gap-3"
      style={{
        background: 'rgba(12,11,9,0.96)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid #2A261F',
      }}
    >
      {/* Left — back + title */}
      <div className="flex items-center gap-4 min-w-0">
        <button
          onClick={() => router.push('/admin')}
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
          Tilbake
        </button>

        <div style={{ width: 1, height: 20, background: '#2A261F' }} />

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

        <Badge variant={project.status as 'draft' | 'published' | 'archived'}>
          {project.status === 'published' ? 'Publisert' : 'Utkast'}
        </Badge>
      </div>

      {/* Right — actions */}
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
        {shareLink && (
          <Button
            onClick={(e) => {
              navigator.clipboard.writeText(shareLink)
              const btn = e.currentTarget
              const orig = btn.textContent || 'Kopier link'
              btn.textContent = 'Kopiert!'
              setTimeout(() => { btn.textContent = orig }, 2000)
            }}
            variant="secondary"
            size="sm"
          >
            Kopier link
          </Button>
        )}

        <Link href={`/admin/projects/${project.id}/quote-analytics`}>
          <Button variant="secondary" size="sm">Statistikk</Button>
        </Link>

        {onDuplicateVersion && (
          <Button onClick={onDuplicateVersion} disabled={duplicating} variant="secondary" size="sm">
            {duplicating ? 'Oppretter...' : 'Ny versjon'}
          </Button>
        )}

        {editMode && onAddFullImageSection && (
          <Button onClick={onAddFullImageSection} variant="secondary" size="sm">
            + Bildeseksjon
          </Button>
        )}

        {editMode && !sections.find(s => s.type === 'quote') && (
          <Button onClick={onAddQuoteSection} variant="secondary" size="sm">
            + Pristilbud
          </Button>
        )}

        <Button onClick={onEditModeToggle} variant={editMode ? 'primary' : 'secondary'} size="sm">
          {editMode ? 'Redigeringsmodus' : 'Visningsmodus'}
        </Button>

        <Button
          onClick={onMobilePreviewToggle}
          variant="ghost"
          size="sm"
          className="lg:hidden"
        >
          {showMobilePreview ? 'Rediger' : 'Forhåndsvis'}
        </Button>

        <Button onClick={onSave} disabled={saving} variant="secondary" size="sm">
          {saving ? 'Lagrer...' : 'Lagre'}
        </Button>

        <Button
          onClick={onPublish}
          disabled={publishing}
          variant={project?.status === 'published' ? 'danger' : 'primary'}
          size="sm"
        >
          {publishing
            ? (project?.status === 'published' ? 'Avpubliserer...' : 'Publiserer...')
            : (project?.status === 'published' ? 'Avpubliser' : 'Publiser')}
        </Button>
      </div>
    </div>
  )
}
