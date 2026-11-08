import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { getGalleryForInternalReview } from '@/lib/actions/gallery-reviews'
import GalleryReviewClient from './GalleryReviewClient'

export default async function GalleryReviewPage({
  params,
}: {
  params: Promise<{ galleryId: string; reviewId: string }>
}) {
  const { reviewId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const data = await getGalleryForInternalReview(reviewId)
  if (!data) notFound()

  const isReviewer = user.id === data.review.reviewer_id

  return <GalleryReviewClient data={data} isReviewer={isReviewer} />
}
