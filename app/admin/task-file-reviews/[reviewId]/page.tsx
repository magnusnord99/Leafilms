import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getTaskFileForInternalReview } from '@/lib/actions/task-video-files'
import TaskFileReviewClient from './TaskFileReviewClient'

export default async function TaskFileReviewPage({
  params,
}: {
  params: Promise<{ reviewId: string }>
}) {
  const { reviewId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const data = await getTaskFileForInternalReview(reviewId)
  if (!data) notFound()

  return <TaskFileReviewClient reviewId={reviewId} data={data} />
}
