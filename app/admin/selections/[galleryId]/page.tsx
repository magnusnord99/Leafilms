import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getAdminGalleryPage } from '@/lib/actions/selection-albums'
import SelectionAdminClient from '@/app/admin/projects/[id]/selection/SelectionAdminClient'

export default async function GalleryAdminPage({
  params,
}: {
  params: Promise<{ galleryId: string }>
}) {
  const { galleryId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const data = await getAdminGalleryPage(galleryId)
  if (!data) notFound()

  return <SelectionAdminClient galleryId={galleryId} initialData={data} />
}
