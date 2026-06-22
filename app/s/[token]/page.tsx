import { notFound } from 'next/navigation'
import { getGalleryForCustomer, galleryTokenExists } from '@/lib/actions/selections'
import PinClient from './PinClient'
import GalleryClient from './GalleryClient'

export default async function SelectionPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const data = await getGalleryForCustomer(token)

  if (!data) {
    if (!(await galleryTokenExists(token))) {
      notFound()
    }
    return <PinClient token={token} />
  }

  return <GalleryClient token={token} gallery={data.gallery} images={data.legacyImages} />
}
