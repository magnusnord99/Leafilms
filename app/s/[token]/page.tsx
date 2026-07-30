import { notFound } from 'next/navigation'
import {
  getGalleryForCustomer,
  galleryTokenExists,
  verifyGalleryPin,
} from '@/lib/actions/selections'
import { albumTokenExists, getAlbumForCustomer, verifyAlbumPin } from '@/lib/actions/selection-picks'
import { getAlbumLanguage, getGalleryLanguage } from '@/lib/customer-language'
import PinClient from './PinClient'
import GalleryClient from './GalleryClient'
import AlbumOverviewClient from './AlbumOverviewClient'
import AlbumGalleryClient from './[album]/AlbumGalleryClient'
import NotReadyMessage from './NotReadyMessage'

export default async function SelectionPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // Sjekk om token er et album-token
  if (await albumTokenExists(token)) {
    const language = await getAlbumLanguage(token)
    const albumData = await getAlbumForCustomer(token)
    if (albumData === 'not_ready') {
      return <NotReadyMessage language={language} />
    }
    if (!albumData) {
      return <PinClient token={token} verifyAction={verifyAlbumPin} language={language} />
    }
    return (
      <AlbumGalleryClient
        token={token}
        album={albumData.album}
        images={albumData.images}
        videos={albumData.videos}
        isDirectAlbumLink
        language={language}
      />
    )
  }

  // Galleri-token
  const data = await getGalleryForCustomer(token)
  const language = await getGalleryLanguage(token)

  if (data === 'not_ready') {
    return <NotReadyMessage language={language} />
  }

  if (!data) {
    if (!(await galleryTokenExists(token))) notFound()
    return <PinClient token={token} verifyAction={verifyGalleryPin} language={language} />
  }

  // Bakoverkompatibilitet: ingen album → gammel flat visning
  if (data.albums.length === 0) {
    return (
      <GalleryClient
        token={token}
        gallery={data.gallery}
        images={data.legacyImages}
        language={language}
      />
    )
  }

  return (
    <AlbumOverviewClient
      token={token}
      gallery={data.gallery}
      language={language}
      albums={data.albums}
      videos={data.videos}
    />
  )
}
