import { notFound } from 'next/navigation'
import { getVideoForGallery } from '@/lib/actions/video-reviews'
import VideoReviewClient from '@/app/v/[token]/VideoReviewClient'

export default async function GalleryVideoPage({
  params,
}: {
  params: Promise<{ token: string; reviewId: string }>
}) {
  const { token, reviewId } = await params

  const data = await getVideoForGallery(token, reviewId)
  if (!data) notFound()

  return (
    <VideoReviewClient
      token={token}
      review={data.review}
      comments={data.comments}
      signedUrl={data.signedUrl}
      galleryMode
      reviewId={reviewId}
    />
  )
}
