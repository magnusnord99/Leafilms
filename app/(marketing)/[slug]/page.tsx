import { notFound } from 'next/navigation'
import { getIndustryLandingPageBySlug } from '@/lib/actions/industry-landing-pages'
import { getAuthenticatedStaffUser } from '@/lib/auth/staff'
import { MarketingPageView } from '@/components/marketing/MarketingPageView'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function MarketingSlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  // Staff kan forhåndsvise og redigere en upublisert kladd direkte på siden;
  // alle andre får kun publiserte sider.
  const staff = await getAuthenticatedStaffUser()
  const page = await getIndustryLandingPageBySlug(slug, { includeDraft: staff.ok })

  if (!page) notFound()

  return <MarketingPageView initialPage={page} canEdit={staff.ok} />
}
