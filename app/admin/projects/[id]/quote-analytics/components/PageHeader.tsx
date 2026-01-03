import Link from 'next/link'
import { Button, Badge, Heading } from '@/components/ui'

type Props = {
  projectId: string
  projectTitle: string
  projectStatus: string | null
  onRefresh: () => void
}

export function PageHeader({ projectId, projectTitle, projectStatus, onRefresh }: Props) {
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
      <Button variant="secondary" onClick={onRefresh}>
        🔄 Oppdater
      </Button>
    </div>
  )
}

