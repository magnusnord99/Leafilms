'use client'

import { useEffect, useState } from 'react'
import { getTaskVideoFileSignedUrl } from '@/lib/actions/task-video-files'
import { C } from '@/lib/admin-theme'

// Enkel forhåndsvisningsspiller for en opplastet postprod-fil — internt,
// admin-only, uten PIN eller kommentarfelt (det hører til /v/[token]-siden
// når filen er sendt til kunde). Se spec §Forhåndsvisning.
export function TaskVideoFilePreview({ fileId }: { fileId: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setUrl(null)
    setError(false)
    getTaskVideoFileSignedUrl(fileId).then(u => {
      if (cancelled) return
      if (u) setUrl(u)
      else setError(true)
    })
    return () => { cancelled = true }
  }, [fileId])

  if (error) {
    return (
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.danger, padding: '10px 0' }}>
        Kunne ikke laste forhåndsvisning
      </p>
    )
  }

  if (!url) {
    return (
      <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.surface2, borderRadius: 8 }}>
        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>Laster forhåndsvisning...</span>
      </div>
    )
  }

  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption -- internt admin-verktøy, ikke kundevendt innhold
    <video controls src={url} style={{ width: '100%', borderRadius: 8, background: '#000', maxHeight: 420, display: 'block' }} />
  )
}
