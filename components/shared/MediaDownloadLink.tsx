'use client'

import type { CSSProperties } from 'react'
import { supabase } from '@/lib/supabase'

export function MediaDownloadLink({ filePath, filename, style }: {
  filePath: string; filename: string; style?: CSSProperties
}) {
  const name = filename.split(/[\\/]/).pop()?.replace(/[\r\n]/g, '') || filePath.split('/').pop() || 'nedlasting'
  const url = new URL(supabase.storage.from('assets').getPublicUrl(filePath).data.publicUrl)
  // Storage setter Content-Disposition: attachment. Fungerer også på tvers av domener.
  url.searchParams.set('download', name)
  return <a href={url.href} download={name} onClick={event => event.stopPropagation()}
    aria-label={`Last ned ${name}`} title="Last ned originalfilen"
    style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
      padding: '5px 8px', border: '1px solid currentColor', borderRadius: 3, color: 'inherit',
      fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', textDecoration: 'none', ...style }}>
    <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" />
    </svg>
    Last ned
  </a>
}
