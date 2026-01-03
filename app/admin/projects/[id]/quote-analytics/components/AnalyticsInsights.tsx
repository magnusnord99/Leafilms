import { Heading, Text } from '@/components/ui'
import { ProjectAnalyticsSummary, Section } from '../types'
import { calculateEngagementScore, getSortedSections, formatSectionName, formatTime } from '../utils'

type Props = {
  analytics: ProjectAnalyticsSummary
  sections: Section[]
}

export function AnalyticsInsights({ analytics, sections }: Props) {
  if (!analytics.section_stats || Object.keys(analytics.section_stats).length === 0) {
    return null
  }

  const sortedSections = getSortedSections(analytics.section_stats)
  const engagementScore = calculateEngagementScore(analytics)

  return (
    <div className="pt-6 border-t border-zinc-700">
      <Heading as="h3" size="md" className="mb-4 !text-white">
        💡 Insights
      </Heading>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
          <Text variant="body" className="font-semibold !text-blue-300 mb-2">
            Interesse-nivå
          </Text>
          <Text variant="small" className="!text-white/80">
            {engagementScore >= 70 
              ? '🔥 Høy interesse - Kunden har brukt mye tid på prosjektbeskrivelsen'
              : engagementScore >= 40
              ? '📊 Moderat interesse - Kunden har sett gjennom prosjektbeskrivelsen'
              : '👀 Lav interesse - Kunden har kun skimmet gjennom'
            }
          </Text>
        </div>
        
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
          <Text variant="body" className="font-semibold !text-green-300 mb-2">
            Mest interessert i
          </Text>
          <Text variant="small" className="!text-white/80">
            {sortedSections.length > 0 
              ? `${formatSectionName(sortedSections[0][0], sections)} - ${formatTime(sortedSections[0][1].total_time)}`
              : 'Ingen data'
            }
          </Text>
        </div>
      </div>
    </div>
  )
}

