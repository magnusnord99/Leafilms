import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getAdminSelectionPage } from '@/lib/actions/selection-albums'
import SelectionAdminClient from './SelectionAdminClient'

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
    .select('id, name')
    .eq('id', projectId)
    .single()

  if (!project) notFound()

  const selectionData = await getAdminSelectionPage(projectId)

  return (
    <SelectionAdminClient
      projectId={projectId}
      projectName={project.name}
      initialData={selectionData}
    />
  )
}
