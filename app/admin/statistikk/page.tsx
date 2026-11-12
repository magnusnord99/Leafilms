import { redirect } from 'next/navigation'
import { getAuthenticatedStaffUser } from '@/lib/auth/staff'
import { getStatisticsOverview } from '@/lib/actions/statistics'
import { StatisticsOverview } from '@/components/admin/StatisticsOverview'

export const dynamic = 'force-dynamic'

export default async function StatisticsPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  if (!(await getAuthenticatedStaffUser()).ok) redirect('/login')
  const [data, params] = await Promise.all([getStatisticsOverview(), searchParams])
  return <StatisticsOverview {...data} initialTab={params.type === 'flyers' ? 'flyers' : 'pitcher'} />
}
