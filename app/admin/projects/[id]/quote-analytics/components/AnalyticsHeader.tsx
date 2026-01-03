import { Heading, Text } from '@/components/ui'
import { ProjectAnalyticsSummary } from '../types'
import { calculateEngagementScore } from '../utils'

type Props = {
  analytics: ProjectAnalyticsSummary
}

export function AnalyticsHeader({ analytics }: Props) {
  const engagementScore = calculateEngagementScore(analytics)

  return (
    <div className="flex items-start justify-between pb-4 border-b border-zinc-700">
      <div>
        {analytics.customer_name && (
          <div className="mb-3">
            <Text variant="muted" className="text-sm mb-1">Kunde</Text>
            <Heading as="h2" size="md" className="!text-white">
              {analytics.customer_name}
            </Heading>
          </div>
        )}
      </div>
      
      {/* Engagement Score */}
      <div className="text-right ">
        <Text variant="muted" className="text-xs text-white mb-1 uppercase tracking-wide">Engagement Score</Text>
        <div className="flex items-center gap-2">
          <div className="text-3xl font-bold text-white">
            {engagementScore}
          </div>
          <div className="text-sm text-white/60">/ 100</div>
        </div>
        <div className="w-32 h-2 bg-zinc-700 rounded-full mt-2 overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500"
            style={{ width: `${engagementScore}%` }}
          />
        </div>
      </div>
    </div>
  )
}

