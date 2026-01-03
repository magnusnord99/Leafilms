import { ProjectAnalyticsSummary, Section } from './types'

// Oversett seksjonstyper til norsk
export const sectionTypeNames: Record<string, string> = {
  hero: 'Hero',
  goal: 'Mål',
  concept: 'Konsept',
  cases: 'Tidligere arbeid',
  moodboard: 'Moodboard',
  timeline: 'Tidslinje',
  deliverables: 'Leveranser',
  contact: 'Kontakt',
  team: 'Team',
  example_work: 'Eksempelarbeid',
  quote: 'Pristilbud'
}

// Hjelpefunksjon for å formatere seksjonsnavn
export const formatSectionName = (sectionId: string, sections: Section[]): string => {
  const section = sections.find(s => s.id === sectionId)
  if (section && section.type) {
    return sectionTypeNames[section.type] || section.type
  }
  return sectionId.substring(0, 8) + '...'
}

export const formatTime = (seconds: number | null): string => {
  if (!seconds) return '0s'
  if (seconds < 60) return `${Math.floor(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}t ${remainingMinutes}m`
}

export const formatDate = (dateString: string | null): string => {
  if (!dateString) return 'Aldri'
  return new Date(dateString).toLocaleDateString('nb-NO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Beregn engagement score (basert på tid og antall visninger)
export const calculateEngagementScore = (analytics: ProjectAnalyticsSummary): number => {
  const avgTime = analytics.avg_time_seconds || 0
  const sessions = analytics.total_sessions
  
  let score = Math.min(avgTime / 60, 100) // Max 100 poeng for tid
  score += Math.min(sessions * 5, 50) // Max 50 poeng for visninger
  
  return Math.min(Math.round(score), 100)
}

// Sorter seksjoner etter total tid
export const getSortedSections = (sectionStats: Record<string, { total_time: number; sessions: number }>) => {
  return Object.entries(sectionStats)
    .sort(([, a], [, b]) => b.total_time - a.total_time)
}

// Beregn maksimal tid for progress bar (brukes kun for visuell sammenligning)
export const getMaxTime = (sectionStats: Record<string, { total_time: number; sessions: number }>) => {
  const times = Object.values(sectionStats).map(s => s.total_time)
  return Math.max(...times, 1) // Minst 1 for å unngå divisjon med 0
}

// Beregn total tid for alle seksjoner (for prosentberegning)
export const getTotalTime = (sectionStats: Record<string, { total_time: number; sessions: number }>) => {
  const times = Object.values(sectionStats).map(s => s.total_time)
  return times.reduce((sum, time) => sum + time, 0) || 1 // Minst 1 for å unngå divisjon med 0
}

