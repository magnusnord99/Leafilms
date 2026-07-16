import { notFound } from 'next/navigation'
import {
  getGalleryForCustomer,
  galleryTokenExists,
  verifyGalleryPin,
} from '@/lib/actions/selections'
import { albumTokenExists, getAlbumForCustomer, verifyAlbumPin } from '@/lib/actions/selection-picks'
import PinClient from './PinClient'
import GalleryClient from './GalleryClient'
import AlbumOverviewClient from './AlbumOverviewClient'
import AlbumGalleryClient from './[album]/AlbumGalleryClient'

export default async function SelectionPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // Sjekk om token er et album-token
  if (await albumTokenExists(token)) {
    const albumData = await getAlbumForCustomer(token)
    if (!albumData) {
      return <PinClient token={token} verifyAction={verifyAlbumPin} />
    }
    return (
      <AlbumGalleryClient
        token={token}
        album={albumData.album}
        images={albumData.images}
        videos={albumData.videos}
        isDirectAlbumLink
      />
    )
  }

  // Galleri-token
  const data = await getGalleryForCustomer(token)

  if (!data) {
    if (!(await galleryTokenExists(token))) notFound()
    return <PinClient token={token} verifyAction={verifyGalleryPin} />
  }

  // Bakoverkompatibilitet: ingen album → gammel flat visning
  if (data.albums.length === 0) {
    return (
      <GalleryClient
        token={token}
        gallery={data.gallery}
        images={data.legacyImages}
      />
    )
  }

  return (
    <AlbumOverviewClient
      token={token}
      gallery={data.gallery}
      albums={data.albums}
      videos={data.videos}
    />
  )
}
