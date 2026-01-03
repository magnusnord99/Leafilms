import { Text } from '@/components/ui'
import { ProjectAnalyticsSummary } from '../types'
import { formatTime, formatDate } from '../utils'

type Props = {
  analytics: ProjectAnalyticsSummary
}

export function AnalyticsStatsCards({ analytics }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
      <div className="bg-zinc-800/50 rounded-lg p-6 border border-zinc-700">
        <Text variant="muted" className="text-xs mb-2 text-white uppercase tracking-wide">Totale visninger</Text>
        <div className="text-4xl font-bold text-white mb-1">
          {analytics.total_sessions}
        </div>
      </div>
      
      <div className="bg-zinc-800/50 rounded-lg p-6 border border-zinc-700">
        <Text variant="muted" className="text-xs text-white mb-2 uppercase tracking-wide">Gjennomsnittlig tid</Text>
        <div className="text-4xl font-bold text-green-400 mb-1">
          {formatTime(analytics.avg_time_seconds)}
        </div>

      </div>
      
      <div className="bg-zinc-800/50 rounded-lg p-6 border border-zinc-700">
        <Text variant="muted" className="text-xs mb-2 text-white uppercase tracking-wide">Total tid</Text>
        <div className="text-4xl font-bold text-blue-400 mb-1">
          {formatTime(analytics.total_time_seconds)}
        </div>
      </div>
      
      <div className="bg-zinc-800/50 rounded-lg p-6 border border-zinc-700">
        <Text variant="muted" className="text-xs mb-2 text-white uppercase tracking-wide">Sist sett</Text>
        <div className="text-lg font-semibold text-white mb-1">
          {formatDate(analytics.last_view)}
        </div>
        <Text variant="muted" className="text-xs text-white">
          {analytics.first_view && (
            <>Første: {new Date(analytics.first_view).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })}</>
          )}
        </Text>
      </div>
    </div>
  )
}

