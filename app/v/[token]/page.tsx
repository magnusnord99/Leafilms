import { notFound } from 'next/navigation'
import {
  videoTokenExists,
  verifyVideoPin,
  getVideoForCustomer,
} from '@/lib/actions/video-reviews'
import PinClient from '@/app/s/[token]/PinClient'
import VideoReviewClient from './VideoReviewClient'

export default async function VideoReviewPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const exists = await videoTokenExists(token)
  if (!exists) notFound()

  const data = await getVideoForCustomer(token)

  if (!data) {
    return <PinClient token={token} verifyAction={verifyVideoPin} />
  }

  return (
    <VideoReviewClient
      token={token}
      review={data.review}
      comments={data.comments}
      signedUrl={data.signedUrl}
    />
  )
}
