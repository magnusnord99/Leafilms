import Link from 'next/link'
import { Button, Card, Text } from '@/components/ui'

type Props = {
  projectId: string
}

export function NoAnalyticsData({ projectId }: Props) {
  return (
    <Card className="p-12 text-center">
      <Text variant="body" className="mb-4">
        Ingen analytics data for dette prosjektet ennå
      </Text>
      <Text variant="muted" className="text-sm mb-4">
        Analytics data vil vises her når kunder har sett på prosjektbeskrivelsen
      </Text>
      <Link href={`/admin/projects/${projectId}/edit`}>
        <Button variant="secondary">Tilbake til prosjekt</Button>
      </Link>
    </Card>
  )
}

