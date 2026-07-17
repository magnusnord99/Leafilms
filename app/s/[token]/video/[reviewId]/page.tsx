import { notFound } from 'next/navigation'
import { getVideoForGallery, getVideoForAlbum } from '@/lib/actions/video-reviews'
import { albumTokenExists } from '@/lib/actions/selection-picks'
import { getAlbumLanguage, getGalleryLanguage } from '@/lib/customer-language'
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
  const isAlbumToken = await albumTokenExists(token)
  const data = isAlbumToken
    ? await getVideoForAlbum(token, reviewId)
    : await getVideoForGallery(token, reviewId)
  if (!data) notFound()

  const language = isAlbumToken
    ? await getAlbumLanguage(token)
    : await getGalleryLanguage(token)

  return (
    <VideoReviewClient
      token={token}
      review={data.review}
      comments={data.comments}
      signedUrl={data.signedUrl}
      galleryMode
      reviewId={reviewId}
      language={language}
    />
  )
}
