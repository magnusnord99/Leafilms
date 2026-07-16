import { notFound } from 'next/navigation'
import { getVideoForGallery, getVideoForAlbum } from '@/lib/actions/video-reviews'
import { albumTokenExists } from '@/lib/actions/selection-picks'
import VideoReviewClient from '@/app/v/[token]/VideoReviewClient'

export default async function GalleryVideoPage({
  params,
}: {
  params: Promise<{ token: string; reviewId: string }>
}) {
  const { token, reviewId } = await params

  // token kan enten være et galleri-token (video nådd via galleriets albumoversikt)
  // eller et album-token (video nådd via en direkte albumlenke) — samme skille
  // som brukes i app/s/[token]/page.tsx.
  const data = (await albumTokenExists(token))
    ? await getVideoForAlbum(token, reviewId)
    : await getVideoForGallery(token, reviewId)
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
