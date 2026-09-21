// app/admin/reviews/[reviewId]/page.tsx
// Varselklikk på gallery_review_requested/responded peker hit uansett om
// reviewen kom fra et galleri eller en opplastet postprod-fil (samme
// gallery_reviews-tabell, se supabase/migrations/162) — denne siden ruter
// videre til riktig detaljside uten at klienten (VarslerClient) må vite hvilken.
// Fil-baserte reviews skjer inline i selve post-prod-steget (ikke på en egen
// side), så her rutes det til postprod-siden med steg+fil forhåndsvalgt.
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getPostprodLinkForFileReview } from '@/lib/actions/task-video-files'

export default async function ReviewResolverPage({
  params,
}: {
  params: Promise<{ reviewId: string }>
}) {
  const { reviewId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: review } = await supabase
    .from('gallery_reviews')
    .select('id, gallery_id, task_video_file_id')
    .eq('id', reviewId)
    .maybeSingle()

  if (!review) notFound()

  if (review.gallery_id) redirect(`/admin/selections/${review.gallery_id}/review/${review.id}`)

  if (review.task_video_file_id) {
    const link = await getPostprodLinkForFileReview(reviewId)
    if (!link) notFound()
    redirect(`/admin/postprod/${link.projectId}?task=${link.taskId}&file=${link.fileId}`)
  }

  notFound()
}
