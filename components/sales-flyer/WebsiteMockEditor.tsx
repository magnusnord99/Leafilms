'use client'

import { useState, type ReactNode } from 'react'
import { ImagePickerModal } from '@/components/modals/ImagePickerModal'
import { VideoPickerModal } from '@/components/modals/VideoPickerModal'
import { copyLibraryImageToFlyer, copyLibraryVideoToFlyer, updateSalesFlyer } from '@/lib/actions/sales-flyers'
import { WEBSITE_MOCK_DEFAULTS, type WebsiteMockSettings } from '@/lib/website-mock'

const EMPTY_IDS: string[] = []
const FIELDS = [
  ['brand', 'Navn i menyen'], ['domain', 'Adresse i mockupen'], ['buttonText', 'Knappetekst'],
  ['heroTitle', 'Overskrift på toppbildet'], ['heroSubtitle', 'Undertekst på toppbildet'],
  ['eyebrow', 'Liten overskrift'], ['heading', 'Overskrift i innholdet'], ['body', 'Brødtekst'],
] as const

export type WebsiteMockControls = { changeImages: () => void; changeVideo?: () => void; busy: boolean }

export function WebsiteMockEditor({ flyerId, slug, value, onChange, onSaved, allowVideo, renderPreview }: {
  renderPreview?: (controls: WebsiteMockControls) => ReactNode
  flyerId: string; slug: string; value: WebsiteMockSettings; allowVideo: boolean
  onChange: (value: WebsiteMockSettings) => void; onSaved: (value: WebsiteMockSettings) => void
}) {
  const [picker, setPicker] = useState<'images' | 'video' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)
  function change(next: WebsiteMockSettings) { onChange(next); setDirty(true); setSaved(false) }
  function follow(key: keyof WebsiteMockSettings) {
    const next = { ...value }; delete next[key]; change(next)
  }
  async function pick(ids: string[], kind: 'images' | 'video') {
    setPicker(null); setBusy(true); setError(null)
    try {
      if (kind === 'images') {
        const results = await Promise.all(ids.slice(0, 2).map(id => copyLibraryImageToFlyer(slug, id, 'website_mock_image')))
        const failed = results.find(result => 'error' in result)
        if (failed && 'error' in failed) throw new Error(failed.error)
        const next = { ...value, images: results.flatMap(result => 'url' in result ? [result.url] : []) }
        change(next); await save(next)
      } else if (ids[0]) {
        const result = await copyLibraryVideoToFlyer(slug, ids[0], 'website_mock_video')
        if ('error' in result) throw new Error(result.error)
        const next = { ...value, video: result.url }
        change(next); await save(next)
      }
    } catch (error) { setError(error instanceof Error ? error.message : 'Kunne ikke hente medier') }
    finally { setBusy(false) }
  }
  async function save(next = value) {
    setBusy(true); setError(null)
    try {
      const result = await updateSalesFlyer(flyerId, { website_mock: next })
      if ('error' in result) throw new Error(result.error)
      onSaved(next); setSaved(true); setDirty(false)
    } catch (error) { setError(error instanceof Error ? error.message : 'Kunne ikke lagre') }
    finally { setBusy(false) }
  }
  return <>
  <details className="my-5 rounded border border-[#3C3529] p-4 text-sm text-[#E8E1D5]">
    <summary className="cursor-pointer font-medium">Tilpass tekst og innstillinger</summary>
    <p className="my-3 text-xs leading-relaxed text-[#9E9287]">Gjelder denne flyeren og alle pakkene på den. Endre medier med knappene direkte på forhåndsvisningen. Tekstendringer lagres med knappen nedenfor.</p>
    <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(([key, label]) => <label key={key} className={`grid gap-1 text-xs ${key === 'body' ? 'sm:col-span-2' : ''}`}>
          {label}
          <textarea rows={key === 'body' ? 3 : 1} value={value[key] ?? WEBSITE_MOCK_DEFAULTS[key]}
            maxLength={key === 'body' ? 2000 : 200}
            onChange={event => change({ ...value, [key]: event.target.value })}
            className="w-full rounded border border-[#3C3529] bg-[#0C0B09] p-2 text-sm" />
        </label>)}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <button type="button" className="text-[#C49434] underline" onClick={() => follow('images')}>Bruk flyerens bilder</button>
        <span className="text-[#9E9287]">{value.images === undefined ? 'Følger flyeren' : `${value.images.length} egne bilder`}</span>
      </div>
      {allowVideo && <div className="flex flex-wrap items-center gap-3 text-xs">
        <button type="button" className="text-[#C49434] underline" onClick={() => follow('video')}>Bruk flyerens toppvideo</button>
        <button type="button" className="text-[#C49434] underline" onClick={() => change({ ...value, video: null })}>Ingen video</button>
        <span className="text-[#9E9287]">{value.video === undefined ? 'Følger flyeren' : value.video === null ? 'Video skjult' : 'Egen video'}</span>
      </div>}
      <div className="flex flex-wrap items-center gap-4">
        <button type="button" onClick={() => save()} className="rounded bg-[#C49434] px-4 py-2 font-medium text-black">{busy ? 'Lagrer…' : 'Lagre nettsideeksempel'}</button>
        <button type="button" onClick={() => change({})} className="text-xs underline">Bruk flyerens innhold og standardtekst</button>
      </div>
    </fieldset>
  </details>
    <p role="status" className="mt-2 text-xs text-[#9E9287]">{dirty ? 'Ulagrede endringer' : saved ? 'Lagret' : ''}</p>
    {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
    {renderPreview?.({ changeImages: () => setPicker('images'), changeVideo: allowVideo ? () => setPicker('video') : undefined, busy })}
    <ImagePickerModal isOpen={picker === 'images'} onClose={() => setPicker(null)} onSelect={ids => pick(ids, 'images')} selectedImageIds={EMPTY_IDS} maxSelection={2} />
    <VideoPickerModal isOpen={picker === 'video'} onClose={() => setPicker(null)} onSelect={ids => pick(ids, 'video')} selectedVideoIds={EMPTY_IDS} maxSelection={1} />
  </>
}
