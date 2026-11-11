'use client'

import { useState } from 'react'

export function ShareFlyerButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false)
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null)

  async function share() {
    const url = new URL(`/flyer/${encodeURIComponent(slug)}`, window.location.origin).href
    setFallbackUrl(null)
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Leafilms', url })
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setFallbackUrl(url)
    }
  }

  return <div className="flex flex-col items-start gap-2">
    <button type="button" onClick={share}
      style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, padding: '8px 12px', borderRadius: 20, background: '#C49434', color: '#0C0B09', border: '1px solid #C49434', cursor: 'pointer', whiteSpace: 'nowrap' }}>
      {copied ? '✓ Lenke kopiert' : 'Del lenke ↗'}
    </button>
    {fallbackUrl && <label className="text-xs" style={{ color: '#C49434' }}>
      Kopier lenken:
      <input aria-label="Lenke til publisert flyer" readOnly value={fallbackUrl} onFocus={event => event.target.select()}
        className="mt-1 block max-w-full rounded border bg-white p-2 text-black" />
    </label>}
    <span className="sr-only" role="status">{copied ? 'Lenken er kopiert til utklippstavlen' : ''}</span>
  </div>
}
