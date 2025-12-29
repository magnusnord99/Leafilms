'use client'

import { useRouter } from 'next/navigation'
import { Project, Section } from '@/lib/types'
import { Button, Badge, Heading, Text } from '@/components/ui'

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
}: EditProjectTopBarProps) {
  const router = useRouter()

  return (
    <div className="sticky top-0 bg-background border-b border-zinc-300 p-4 z-40">
      <div className="max-w-[2500px] mx-auto flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => router.push('/admin')}
            size="sm"
          >
            ← Tilbake
          </Button>
          <div>
            <Heading as="h1" size="sm" className="mb-0">{project.title}</Heading>
            {project.client_name && (
              <Text variant="muted" className="text-xs">Kunde: {project.client_name}</Text>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Kopier link knapp - vises kun når prosjektet er publisert */}
          {shareLink && (
            <Button
              onClick={(e) => {
                navigator.clipboard.writeText(shareLink)
                // Vis en kort bekreftelse
                const button = e.currentTarget
                const originalText = button.textContent || '📋 Kopier link'
                button.textContent = '✓ Kopiert!'
                setTimeout(() => {
                  button.textContent = originalText
                }, 2000)
              }}
              variant="secondary"
              size="sm"
            >
              📋 Kopier link
            </Button>
          )}
          {/* Legg til Pristilbud-seksjon */}
          {editMode && !sections.find(s => s.type === 'quote') && (
            <Button
              onClick={onAddQuoteSection}
              variant="secondary"
              size="sm"
            >
              + Legg til Pristilbud
            </Button>
          )}
          {/* Rediger-modus Toggle */}
          <Button
            onClick={onEditModeToggle}
            variant={editMode ? 'primary' : 'secondary'}
            size="sm"
          >
            {editMode ? ' Rediger-modus' : 'Visning-modus'}
          </Button>
          <Badge variant={project.status as 'draft' | 'published' | 'archived'}>
            {project.status === 'published' ? '🟢 Publisert' : '🟡 Utkast'}
          </Badge>
          <Button
            onClick={onMobilePreviewToggle}
            variant="ghost"
            size="sm"
            className="lg:hidden"
          >
            {showMobilePreview ? '✏️ Rediger' : '👁️ Preview'}
          </Button>
          <Button
            onClick={onSave}
            disabled={saving}
            variant="secondary"
            size="sm"
          >
            {saving ? 'Lagrer...' : '💾 Lagre'}
          </Button>
          <Button
            onClick={onPublish}
            disabled={publishing}
            variant={project?.status === 'published' ? 'danger' : 'primary'}
            size="sm"
          >
            {publishing 
              ? (project?.status === 'published' ? 'Avpubliserer...' : 'Publiserer...') 
              : (project?.status === 'published' ? '🔴 Avpubliser' : '🚀 Publiser')}
          </Button>
        </div>
      </div>
    </div>
  )
}

