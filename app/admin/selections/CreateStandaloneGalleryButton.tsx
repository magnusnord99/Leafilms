'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createGallery } from '@/lib/actions/selections'

const C = {
  accent: '#7C5CFC',
}

export default function CreateStandaloneGalleryButton() {
  const router = useRouter()
  const [creating, setCreating] = useState(false)

  async function handleCreate() {
    setCreating(true)
    const { galleryId } = await createGallery()
    router.push(`/admin/selections/${galleryId}`)
  }

  return (
    <button
      onClick={handleCreate}
      disabled={creating}
      style={{
        padding: '9px 16px', borderRadius: 7, border: 'none', cursor: 'pointer',
        background: C.accent, color: '#fff', fontFamily: 'var(--font-dm-sans)',
        fontSize: '0.78rem', fontWeight: 600,
      }}
    >
      {creating ? 'Oppretter...' : '+ Opprett galleri'}
    </button>
  )
}
