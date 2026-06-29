import { notFound } from 'next/navigation'
import { getGalleryForCustomer, galleryTokenExists, verifyGalleryPin } from '@/lib/actions/selections'
import PinClient from '../PinClient'
import AlbumGalleryClient from './AlbumGalleryClient'

export default async function AlbumPage({
  params,
}: {
  params: Promise<{ token: string; album: string }>
}) {
  const { token, album: albumSlug } = await params

  const data = await getGalleryForCustomer(token)

  if (!data) {
    if (!(await galleryTokenExists(token))) notFound()
    return <PinClient token={token} verifyAction={verifyGalleryPin} />
  }

  const album = data.albums.find(a => a.slug === albumSlug)
  if (!album) notFound()

  return (
    <AlbumGalleryClient
      token={token}
      galleryToken={token}
      album={album}
      images={album.images}
      totalSelected={data.albums.reduce((s, a) => s + a.selectedCount, 0)}
      targetCount={data.gallery.target_count}
      isDirectAlbumLink={false}
      allAlbums={data.albums.map(a => ({
          id: a.id,
          name: a.name,
          slug: a.slug,
          selectedCount: a.selectedCount,
          parent_album_id: a.parent_album_id,
          coverUrl: a.images[0]?.signedUrl ?? null,
        }))}
    />
  )
}
