'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button, Badge, Heading } from '@/components/ui'

type Props = {
  projectId: string
  projectTitle: string
  projectStatus: string | null
  onRefresh: () => void
  onReset: () => Promise<void>
}

export function PageHeader({ projectId, projectTitle, projectStatus, onRefresh, onReset }: Props) {
  const [resetting, setResetting] = useState(false)

  async function handleReset() {
    if (!confirm('Er du sikker på at du vil nullstille all statistikk for dette prosjektet? Dette kan ikke angres.')) return
    setResetting(true)
    try {
      await onReset()
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="flex items-center justify-between mb-8">
      <div>
        <Link href={`/admin/projects/${projectId}/edit`} className="text-white/60 hover:text-white mb-2 inline-block">
          ← Tilbake til prosjekt
        </Link>
        <Heading as="h1" size="lg" className="mb-2 !text-white">
          📊 Prosjekt Analytics: {projectTitle || 'Prosjekt'}
        </Heading>
        {projectStatus && (
          <div className="mt-2">
            <Badge variant={projectStatus === 'published' ? 'published' : 'draft'}>
              {projectStatus === 'published' ? '🟢 Publisert' : '🟡 Utkast'}
            </Badge>
          </div>
        )}
      </div>
      <div className="flex gap-3">
        <Button variant="secondary" onClick={onRefresh}>
          🔄 Oppdater
        </Button>
        <Button variant="secondary" onClick={handleReset} disabled={resetting}>
          {resetting ? 'Nullstiller...' : '🗑️ Nullstill statistikk'}
        </Button>
      </div>
    </div>
  )
}

