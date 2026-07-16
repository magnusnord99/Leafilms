import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getAdminVideoReviews } from '@/lib/actions/video-reviews'
import { getGalleryIdForProject } from '@/lib/actions/selections'
import VideoAdminClient from './VideoAdminClient'

export default async function VideoAdminPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: projectId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: project } = await supabase
    .from('projects')
    .select('id, title')
    .eq('id', projectId)
    .single()

  if (!project) notFound()

  const reviews = await getAdminVideoReviews(projectId)
  const gallery = await getGalleryIdForProject(projectId)

  return (
    <VideoAdminClient
      projectId={projectId}
      projectName={project.title}
      initialReviews={reviews}
      galleryId={gallery?.id ?? null}
    />
  )
}
