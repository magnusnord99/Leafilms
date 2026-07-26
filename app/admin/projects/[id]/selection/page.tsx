import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getGalleryIdForProject } from '@/lib/actions/selections'
import CreateGalleryForm from './CreateGalleryForm'

export default async function SelectionAdminPage({
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

  const gallery = await getGalleryIdForProject(projectId)
  if (gallery) redirect(`/admin/selections/${gallery.id}`)

  return <CreateGalleryForm projectId={projectId} projectName={project.title} />
}
