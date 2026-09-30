'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteGallery } from '@/lib/actions/selections'
import { C } from '@/lib/admin-theme'

export default function DeleteGalleryButton({ galleryId }: { galleryId: string }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirm('Slette dette galleriet permanent? Dette kan ikke angres.')) return
    setDeleting(true)
    await deleteGallery(galleryId)
    router.refresh()
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      style={{
        padding: '4px 9px', borderRadius: 6, border: `1px solid ${C.border}`, cursor: 'pointer',
        background: 'none', color: C.text3, fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem',
      }}
    >
      {deleting ? 'Sletter...' : '⊗ Slett'}
    </button>
  )
}
