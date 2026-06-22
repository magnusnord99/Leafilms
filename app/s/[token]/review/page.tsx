import { notFound } from 'next/navigation'
import { getGalleryForCustomer, galleryTokenExists, verifyGalleryPin } from '@/lib/actions/selections'
import PinClient from '../PinClient'
import ReviewClient from './ReviewClient'

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const data = await getGalleryForCustomer(token)

  if (!data) {
    if (!(await galleryTokenExists(token))) notFound()
    return <PinClient token={token} verifyAction={verifyGalleryPin} />
  }

  const selectedAlbums = data.albums
    .map(album => ({
      ...album,
      images: album.images.filter(i => i.selected),
    }))
    .filter(album => album.images.length > 0)

  const totalSelected = data.albums.reduce((s, a) => s + a.selectedCount, 0)

  return (
    <ReviewClient
      token={token}
      gallery={data.gallery}
      selectedAlbums={selectedAlbums}
      totalSelected={totalSelected}
    />
  )
}
