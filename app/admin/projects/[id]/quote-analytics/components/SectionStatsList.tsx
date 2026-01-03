import { Heading, Text } from '@/components/ui'
import { Section } from '../types'
import { formatSectionName, formatTime, getSortedSections, getMaxTime, getTotalTime } from '../utils'

type Props = {
  sectionStats: Record<string, { total_time: number; sessions: number }>
  sections: Section[]
}

export function SectionStatsList({ sectionStats, sections }: Props) {
  if (!sectionStats || Object.keys(sectionStats).length === 0) {
    return null
  }

  const sortedSections = getSortedSections(sectionStats)
  const maxTime = getMaxTime(sectionStats) // Brukes for visuell sammenligning i progress bar
  const totalTime = getTotalTime(sectionStats) // Brukes for prosentberegning

  return (
    <div className="pt-6 border-t border-zinc-700">
      <Heading as="h3" size="md" className="mb-4 !text-white">
        Tid per seksjon i prosjektbeskrivelsen
      </Heading>
      <div className="space-y-4">
        {sortedSections.map(([sectionId, stats]) => {
          // Prosent av total tid (alle seksjoner skal summere til 100%)
          const percentageOfTotal = totalTime > 0 ? (stats.total_time / totalTime) * 100 : 0
          // Prosent av maksimal tid (for visuell sammenligning i progress bar)
          const percentageOfMax = maxTime > 0 ? (stats.total_time / maxTime) * 100 : 0
          const sectionLabel = formatSectionName(sectionId, sections)
          const avgTimePerSession = stats.sessions > 0 ? stats.total_time / stats.sessions : 0
          
          return (
            <div key={sectionId} className="bg-zinc-800/30 rounded-lg p-4 border border-zinc-700 hover:bg-zinc-800/50 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex-1">
                  <Text variant="body" className="font-semibold !text-white mb-1">
                    {sectionLabel}
                  </Text>
                  <div className="flex items-center gap-4 text-sm flex-wrap">
                    <span className="text-white font-medium">
                      {formatTime(stats.total_time)} totalt
                    </span>
                    <span className="text-white/60">
                      {formatTime(avgTimePerSession)} per visning
                    </span>
                    <span className="text-white/60">
                      {stats.sessions} {stats.sessions === 1 ? 'visning' : 'visninger'}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-white">
                    {Math.round(percentageOfTotal)}%
                  </div>
                  <Text variant="muted" className="text-xs">av total tid</Text>
                </div>
              </div>
              
              {/* Progress bar - viser prosent av maksimal tid for visuell sammenligning */}
              <div className="w-full h-3 bg-zinc-700 rounded-full overflow-hidden mt-3">
                <div 
                  className="h-full bg-gradient-to-r from-purple-500 via-blue-500 to-cyan-500 transition-all duration-700 ease-out"
                  style={{ width: `${Math.min(percentageOfMax, 100)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

