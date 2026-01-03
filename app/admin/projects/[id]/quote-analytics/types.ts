export type ProjectAnalyticsSummary = {
  project_id: string
  project_title: string
  customer_name: string | null
  total_sessions: number
  avg_time_seconds: number | null
  total_time_seconds: number | null
  first_view: string | null
  last_view: string | null
  section_stats: Record<string, {
    total_time: number
    sessions: number
  }>
}

export type Section = {
  id: string
  type: string
  visible: boolean
}

