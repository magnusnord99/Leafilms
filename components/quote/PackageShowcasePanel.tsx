'use client'

import { useEffect, useState } from 'react'
import { C } from '@/lib/admin-theme'
import { ImagePickerModal } from '@/components/modals/ImagePickerModal'
import { VideoPickerModal } from '@/components/modals/VideoPickerModal'
import {
  listQuotePackageShowcaseItems,
  setQuotePackageShowcaseItems,
  copyLibraryImageToQuotePackage,
  copyLibraryVideoToQuotePackage,
} from '@/lib/actions/quote-package-showcase'
import { QuotePackageShowcaseItem, QuotePackageShowcaseKind } from '@/lib/types'

type Props = { flyerId: string; quoteId: string }

// Hvilken picker-modal som er åpen akkurat nå, og hvilken kind/media_type den
// skriver til. 'social_clip' har to varianter siden den kinden kan ta begge
// media-typer (migrasjonens CHECK-constraint).
type PickerTarget = 'main_video' | 'social_clip_video' | 'social_clip_image' | 'photo' | 'website_photo' | null

const ROW_LABEL: Record<QuotePackageShowcaseKind, string> = {
  main_video: 'Hovedvideo',
  social_clip: 'Sosiale klipp',
  photo: 'Bilder (stack)',
  website_photo: 'Nettside-bilder',
}

// Ikke-bindende hint, byggeren avgjør selv — se spec, "ikke et krav".
const ROW_HINT: Record<QuotePackageShowcaseKind, string> = {
  main_video: 'f.eks. 1',
  social_clip: 'f.eks. 2-4',
  photo: 'f.eks. 2-5 — vises som en bunke med antall, ikke alle enkeltvis',
  website_photo: 'f.eks. 2-4 — vises inni nettside-moccen sammen med hovedvideoen',
}

// Stabil referanse til pickerne — unngår at de to modalene synker selectedIds
// på nytt på hver render av dette panelet (samme mønster som SalesFlyerView/
// MarketingPageView).
const EMPTY_IDS: string[] = []

function withOrderIndex(list: QuotePackageShowcaseItem[]): QuotePackageShowcaseItem[] {
  return list.map((item, idx) => ({ ...item, order_index: idx }))
}

function makeTempId(): string {
  return `tmp-${Math.random().toString(36).slice(2)}-${Date.now()}`
}

export function PackageShowcasePanel({ flyerId, quoteId }: Props) {
  const [items, setItems] = useState<QuotePackageShowcaseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingKinds, setSavingKinds] = useState<Record<QuotePackageShowcaseKind, boolean>>({
    main_video: false,
    social_clip: false,
    photo: false,
    website_photo: false,
  })
  const [activePicker, setActivePicker] = useState<PickerTarget>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listQuotePackageShowcaseItems(flyerId, quoteId).then(result => {
      if (!cancelled) {
        setItems(result)
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [flyerId, quoteId])

  function setSaving(kind: QuotePackageShowcaseKind, value: boolean) {
    setSavingKinds(prev => ({ ...prev, [kind]: value }))
  }

  function itemsForKind(kind: QuotePackageShowcaseKind): QuotePackageShowcaseItem[] {
    return items.filter(i => i.kind === kind).sort((a, b) => a.order_index - b.order_index)
  }

  // Erstatter hele vareliste-fanen for én kind — aldri en partiell diff, se
  // setQuotePackageShowcaseItems' atomiske replace-kontrakt.
  async function persistKind(kind: QuotePackageShowcaseKind, nextKindItems: QuotePackageShowcaseItem[]) {
    const previousKindItems = itemsForKind(kind)
    setItems(prev => [...prev.filter(i => i.kind !== kind), ...nextKindItems])
    setSaving(kind, true)
    try {
      const payload = nextKindItems.map(i => ({ media_type: i.media_type, path: i.path, caption: i.caption }))
      const result = await setQuotePackageShowcaseItems(flyerId, quoteId, kind, payload)
      if ('error' in result) {
        setError(result.error)
        setItems(prev => [...prev.filter(i => i.kind !== kind), ...previousKindItems])
      } else {
        setError(null)
      }
    } catch (err) {
      console.error('PackageShowcasePanel persistKind:', err)
      setError('Kunne ikke lagre eksempelmedia — sjekk nettforbindelsen')
      setItems(prev => [...prev.filter(i => i.kind !== kind), ...previousKindItems])
    } finally {
      setSaving(kind, false)
    }
  }

  async function handlePickedVideos(kind: 'main_video' | 'social_clip', ids: string[]) {
    if (ids.length === 0) return
    setError(null)
    setSaving(kind, true)
    try {
      const current = itemsForKind(kind)
      const additions: QuotePackageShowcaseItem[] = []
      for (const id of ids) {
        const result = await copyLibraryVideoToQuotePackage(flyerId, quoteId, id, kind)
        if ('error' in result) {
          setError(result.error)
          return
        }
        additions.push({
          id: makeTempId(),
          quote_id: quoteId,
          flyer_id: flyerId,
          kind,
          media_type: 'video',
          path: result.url,
          caption: null,
          order_index: 0,
        })
      }
      await persistKind(kind, withOrderIndex([...current, ...additions]))
    } finally {
      setSaving(kind, false)
    }
  }

  async function handlePickedImages(kind: 'photo' | 'social_clip' | 'website_photo', ids: string[]) {
    if (ids.length === 0) return
    setError(null)
    setSaving(kind, true)
    try {
      const current = itemsForKind(kind)
      const additions: QuotePackageShowcaseItem[] = []
      for (const id of ids) {
        const result = await copyLibraryImageToQuotePackage(flyerId, quoteId, id, kind)
        if ('error' in result) {
          setError(result.error)
          return
        }
        additions.push({
          id: makeTempId(),
          quote_id: quoteId,
          flyer_id: flyerId,
          kind,
          media_type: 'image',
          path: result.url,
          caption: null,
          order_index: 0,
        })
      }
      await persistKind(kind, withOrderIndex([...current, ...additions]))
    } finally {
      setSaving(kind, false)
    }
  }

  function moveItem(kind: QuotePackageShowcaseKind, id: string, direction: 'up' | 'down') {
    if (savingKinds[kind]) return
    const kindItems = itemsForKind(kind)
    const index = kindItems.findIndex(i => i.id === id)
    if (index === -1) return
    const swapWith = direction === 'up' ? index - 1 : index + 1
    if (swapWith < 0 || swapWith >= kindItems.length) return
    const next = [...kindItems]
    ;[next[index], next[swapWith]] = [next[swapWith], next[index]]
    persistKind(kind, withOrderIndex(next))
  }

  function removeItem(kind: QuotePackageShowcaseKind, id: string) {
    if (savingKinds[kind]) return
    const next = itemsForKind(kind).filter(i => i.id !== id)
    persistKind(kind, withOrderIndex(next))
  }

  function updateCaption(id: string, caption: string) {
    if (savingKinds.social_clip) return
    const current = itemsForKind('social_clip')
    const existing = current.find(i => i.id === id)
    if (!existing) return
    const trimmed = caption.trim()
    const nextCaption = trimmed.length > 0 ? trimmed : null
    if (existing.caption === nextCaption) return
    const next = current.map(i => i.id === id ? { ...i, caption: nextCaption } : i)
    persistKind('social_clip', next)
  }

  function addButtonStyle(disabled: boolean): React.CSSProperties {
    return {
      fontFamily: 'var(--font-dm-sans)',
      fontSize: '0.68rem',
      fontWeight: 600,
      padding: '6px 10px',
      borderRadius: 6,
      cursor: disabled ? 'default' : 'pointer',
      background: C.accentBg,
      color: C.accent,
      border: '1px solid rgba(124,92,252,0.25)',
      opacity: disabled ? 0.6 : 1,
    }
  }

  function arrowButtonStyle(disabled: boolean): React.CSSProperties {
    return {
      width: 22,
      height: 22,
      borderRadius: 11,
      background: C.surface2,
      color: C.text,
      border: `1px solid ${C.border}`,
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.4 : 1,
      fontSize: '0.7rem',
      lineHeight: 1,
    }
  }

  function renderThumb(kind: QuotePackageShowcaseKind, item: QuotePackageShowcaseItem, idx: number, count: number, busy: boolean) {
    return (
      <div key={item.id} style={{ width: 118 }}>
        <div style={{ position: 'relative', width: 118, height: 88, borderRadius: 6, overflow: 'hidden', background: C.surface2, border: `1px solid ${C.border}` }}>
          {item.media_type === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.path} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <video src={item.path} muted style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          )}
          <button
            type="button"
            onClick={() => removeItem(kind, item.id)}
            disabled={busy}
            aria-label="Fjern"
            style={{ position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10, background: '#C0392B', color: '#fff', border: 'none', fontSize: '0.68rem', lineHeight: 1, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1 }}
          >
            ×
          </button>
        </div>
        <div className="flex items-center justify-center gap-1" style={{ marginTop: 4 }}>
          <button type="button" onClick={() => moveItem(kind, item.id, 'up')} disabled={idx === 0 || busy} aria-label="Flytt opp" style={arrowButtonStyle(idx === 0 || busy)}>↑</button>
          <button type="button" onClick={() => moveItem(kind, item.id, 'down')} disabled={idx === count - 1 || busy} aria-label="Flytt ned" style={arrowButtonStyle(idx === count - 1 || busy)}>↓</button>
        </div>
        {kind === 'social_clip' && (
          <input
            type="text"
            defaultValue={item.caption ?? ''}
            placeholder="Bildetekst"
            disabled={busy}
            onBlur={e => updateCaption(item.id, e.target.value)}
            style={{ marginTop: 4, width: '100%', fontSize: '0.66rem', padding: '4px 6px', borderRadius: 4, background: C.surface2, border: `1px solid ${C.border}`, color: C.text, fontFamily: 'var(--font-dm-sans)' }}
          />
        )}
      </div>
    )
  }

  function renderRow(kind: QuotePackageShowcaseKind, label: string, kindItems: QuotePackageShowcaseItem[]) {
    const busy = savingKinds[kind]
    return (
      <div key={kind} style={{ marginTop: 16 }}>
        <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginBottom: 6 }}>
          <div>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.74rem', fontWeight: 600, color: C.text }}>
              {label}
            </p>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3 }}>
              {ROW_HINT[kind]}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {kind === 'main_video' && (
              <button type="button" onClick={() => setActivePicker('main_video')} disabled={busy} style={addButtonStyle(busy)}>
                + Legg til hovedvideo
              </button>
            )}
            {kind === 'photo' && (
              <button type="button" onClick={() => setActivePicker('photo')} disabled={busy} style={addButtonStyle(busy)}>
                + Legg til bilde
              </button>
            )}
            {kind === 'social_clip' && (
              <>
                <button type="button" onClick={() => setActivePicker('social_clip_video')} disabled={busy} style={addButtonStyle(busy)}>
                  + Legg til klippvideo
                </button>
                <button type="button" onClick={() => setActivePicker('social_clip_image')} disabled={busy} style={addButtonStyle(busy)}>
                  + Legg til klippbilde
                </button>
              </>
            )}
            {kind === 'website_photo' && (
              <button type="button" onClick={() => setActivePicker('website_photo')} disabled={busy} style={addButtonStyle(busy)}>
                + Legg til nettside-bilde
              </button>
            )}
          </div>
        </div>
        {kindItems.length === 0 ? (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>
            Ingen eksempelmedia lagt til ennå.
          </p>
        ) : (
          <div className="flex gap-2 flex-wrap">
            {kindItems.map((item, idx) => renderThumb(kind, item, idx, kindItems.length, busy))}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
        Laster eksempelmedia…
      </p>
    )
  }

  return (
    <div>
      {error && (
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.danger, marginBottom: 10 }}>
          {error}
        </p>
      )}
      {renderRow('main_video', ROW_LABEL.main_video, itemsForKind('main_video'))}
      {renderRow('social_clip', ROW_LABEL.social_clip, itemsForKind('social_clip'))}
      {renderRow('photo', ROW_LABEL.photo, itemsForKind('photo'))}
      {renderRow('website_photo', ROW_LABEL.website_photo, itemsForKind('website_photo'))}

      <ImagePickerModal
        isOpen={activePicker === 'photo' || activePicker === 'social_clip_image' || activePicker === 'website_photo'}
        onClose={() => setActivePicker(null)}
        onSelect={(ids) => {
          if (activePicker === 'photo') handlePickedImages('photo', ids)
          else if (activePicker === 'social_clip_image') handlePickedImages('social_clip', ids)
          else if (activePicker === 'website_photo') handlePickedImages('website_photo', ids)
        }}
        selectedImageIds={EMPTY_IDS}
      />
      <VideoPickerModal
        isOpen={activePicker === 'main_video' || activePicker === 'social_clip_video'}
        onClose={() => setActivePicker(null)}
        onSelect={(ids) => {
          if (activePicker === 'main_video') handlePickedVideos('main_video', ids)
          else if (activePicker === 'social_clip_video') handlePickedVideos('social_clip', ids)
        }}
        selectedVideoIds={EMPTY_IDS}
      />
    </div>
  )
}
