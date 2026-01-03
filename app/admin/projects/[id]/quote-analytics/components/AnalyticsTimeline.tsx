import { Text } from '@/components/ui'
import { ProjectAnalyticsSummary } from '../types'
import { formatDate } from '../utils'

type Props = {
  analytics: ProjectAnalyticsSummary
}

export function AnalyticsTimeline({ analytics }: Props) {
  return (
    <div className="pt-6 border-t border-zinc-700">
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <Text variant="muted" className="text-xs text-white mb-1 uppercase tracking-wide">Første visning</Text>
          <Text variant="body" className="text-lg !text-white">
            {formatDate(analytics.first_view)}
          </Text>
        </div>
        <div>
          <Text variant="muted" className="text-xs text-white mb-1 uppercase tracking-wide">Siste visning</Text>
          <Text variant="body" className="text-lg !text-white">
            {formatDate(analytics.last_view)}
          </Text>
        </div>
      </div>
    </div>
  )
}

