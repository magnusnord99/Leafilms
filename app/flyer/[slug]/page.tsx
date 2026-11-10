import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { getSalesFlyerBySlug } from '@/lib/actions/sales-flyers'
import { getAuthenticatedStaffUser } from '@/lib/auth/staff'
import { createClient, createServiceClient } from '@/lib/supabase-server'
import { SalesFlyerView } from '@/components/sales-flyer/SalesFlyerView'
import { FlyerChat } from '@/components/sales-flyer/FlyerChat'

export const dynamic = 'force-dynamic'

export default async function SalesFlyerPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ chat?: string }> }) {
  const { slug } = await params

  // Staff kan forhåndsvise og redigere en upublisert kladd direkte på siden;
  // alle andre får kun publiserte flyers.
  const staff = await getAuthenticatedStaffUser()
  const flyer = await getSalesFlyerBySlug(slug, { includeDraft: staff.ok })

  if (!flyer) notFound()
  if (!flyer.published && !staff.ok) notFound()

  // Trafikk-statistikk: kun anonyme besøkende telles. Innlogget bruker
  // (staff ELLER en innlogget kunde) skal ikke spores — dette er hele
  // håndhevingen av det kravet, derfor sjekkes en genuin "finnes det noen
  // innlogget sesjon", ikke staff.ok alene.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    const serviceClient = createServiceClient()
    const referrer = (await headers()).get('referer') ?? null
    const { error } = await serviceClient
      .from('sales_flyer_views')
      .insert({ flyer_id: flyer.id, referrer })
    if (error) console.error('sales_flyer_views insert:', error)
  }

  return <>
    <SalesFlyerView initialFlyer={flyer} canEdit={staff.ok} />
    {staff.ok && <FlyerChat flyerId={flyer.id} slug={slug} forceOpen={(await searchParams).chat === '1'} />}
  </>
}
