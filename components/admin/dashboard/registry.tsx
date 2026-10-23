import type { ComponentType } from 'react'
import type { DashboardWidgetKey } from '@/lib/types'
import StatsWidget from './widgets/StatsWidget'
import PipelineWidget from './widgets/PipelineWidget'
import CalendarWidget from './widgets/CalendarWidget'
import RecentProjectsWidget from './widgets/RecentProjectsWidget'
import CustomersWidget from './widgets/CustomersWidget'
import MarketAnalysisWidget from './widgets/MarketAnalysisWidget'
import MyTasksWidget from './widgets/MyTasksWidget'
import LeadsFollowUpWidget from './widgets/LeadsFollowUpWidget'
import UpcomingShootsWidget from './widgets/UpcomingShootsWidget'

export type WidgetDef = {
  key: DashboardWidgetKey
  label: string
  description: string
  component: ComponentType
}

export const WIDGET_REGISTRY: WidgetDef[] = [
  { key: 'stats', label: 'Nøkkeltall', description: 'Prosjekter, pipeline, kunder og e-post-oppfølging', component: StatsWidget },
  { key: 'pipeline', label: 'Pipeline-oversikt', description: 'Antall prosjekter per pipeline-steg', component: PipelineWidget },
  { key: 'calendar', label: 'Kalender', description: 'Månedsoversikt med opptak og frister', component: CalendarWidget },
  { key: 'recent_projects', label: 'Siste prosjekter', description: 'De 5 sist oppdaterte prosjektene', component: RecentProjectsWidget },
  { key: 'customers', label: 'Kunder', description: 'Liste over alle kunder', component: CustomersWidget },
  { key: 'market_analysis', label: 'Markedsanalyse', description: 'Siste kjørte markedsanalyse', component: MarketAnalysisWidget },
  { key: 'my_tasks', label: 'Mine oppgaver', description: 'Dine åpne oppgaver, sortert etter frist', component: MyTasksWidget },
  { key: 'leads_follow_up', label: 'Leads som trenger oppfølging', description: 'Varme leads og leads forbi kontaktfrist', component: LeadsFollowUpWidget },
  { key: 'upcoming_shoots', label: 'Kommende opptak', description: 'Neste planlagte opptak, sortert etter dato', component: UpcomingShootsWidget },
]

export const DEFAULT_WIDGET_ORDER: DashboardWidgetKey[] = WIDGET_REGISTRY.map((w) => w.key)
