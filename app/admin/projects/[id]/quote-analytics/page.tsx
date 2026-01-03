'use client'

import { useEffect, useState } from 'react'
import { use } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, Text } from '@/components/ui'
import { ProjectAnalyticsSummary, Section } from './types'
import {
  PageHeader,
  AnalyticsHeader,
  AnalyticsStatsCards,
  SectionStatsList,
  AnalyticsInsights,
  AnalyticsTimeline,
  NoAnalyticsData
} from './components'

type Props = {
  params: Promise<{ id: string }>
}

export default function ProjectQuoteAnalyticsPage({ params }: Props) {
  const { id } = use(params)
  const [loading, setLoading] = useState(true)
  const [analytics, setAnalytics] = useState<ProjectAnalyticsSummary | null>(null)
  const [projectTitle, setProjectTitle] = useState<string>('')
  const [projectStatus, setProjectStatus] = useState<string | null>(null)
  const [sections, setSections] = useState<Section[]>([])

  useEffect(() => {
    fetchProjectAndAnalytics()
  }, [id])

  async function fetchProjectAndAnalytics() {
    try {
      setLoading(true)
      
      // Hent prosjektinfo inkludert status
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('title, status')
        .eq('id', id)
        .single()

      if (projectError) {
        console.error('Error fetching project:', {
          message: projectError.message,
          details: projectError.details,
          hint: projectError.hint,
          code: projectError.code,
          fullError: projectError
        })
      } else if (project) {
        setProjectTitle(project.title)
        setProjectStatus(project.status)
      } else {
        console.warn('No project found and no error - project might not exist')
      }

      // Hent alle seksjoner for prosjektet (for å kunne vise navn)
      const { data: sectionsData, error: sectionsError } = await supabase
        .from('sections')
        .select('id, type, visible')
        .eq('project_id', id)
        .order('order_index', { ascending: true })

      if (!sectionsError && sectionsData) {
        setSections(sectionsData)
      }

      // Hent project analytics for dette prosjektet
      const { data, error } = await supabase
        .from('project_analytics_summary')
        .select('*')
        .eq('project_id', id)
        .maybeSingle()

      if (error) {
        console.error('Error fetching project analytics:', error)
      } else if (data) {
        console.log('[Analytics Page] Fetched analytics data:', {
          total_sessions: data.total_sessions,
          avg_time_seconds: data.avg_time_seconds,
          total_time_seconds: data.total_time_seconds,
          section_stats_count: Object.keys(data.section_stats || {}).length,
          section_stats: data.section_stats
        })
        setAnalytics(data as ProjectAnalyticsSummary)
      } else {
        console.log('[Analytics Page] No analytics data found for project:', id)
      }
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Text variant="body">Laster...</Text>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        <PageHeader
          projectId={id}
          projectTitle={projectTitle}
          projectStatus={projectStatus}
          onRefresh={fetchProjectAndAnalytics}
        />

        {analytics ? (
          <Card className="bg-zinc-900 border-zinc-700">
            <div className="space-y-6">
              <AnalyticsHeader analytics={analytics} />
              <AnalyticsStatsCards analytics={analytics} />
              <SectionStatsList 
                sectionStats={analytics.section_stats} 
                sections={sections}
              />
              <AnalyticsInsights 
                analytics={analytics} 
                sections={sections}
              />
              <AnalyticsTimeline analytics={analytics} />
            </div>
          </Card>
        ) : (
          <NoAnalyticsData projectId={id} />
        )}
      </div>
    </div>
  )
}
