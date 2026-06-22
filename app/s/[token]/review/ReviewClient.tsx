'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { submitGallery } from '@/lib/actions/selections'
import type { SelectionGallery, AlbumForCustomer } from '@/lib/actions/selections'

const S = {
  bg:      '#0C0B09',
  surface: '#131210',
  surface2:'#1A1916',
  border:  '#2A2820',
  gold:    '#C49434',
  text:    '#E8E0D0',
  text2:   '#8A8070',
  text3:   '#5A5448',
  green:   '#4CAF7D',
  warning: '#D4863A',
}

type SelectedAlbum = AlbumForCustomer & { images: AlbumForCustomer['images'] }

export default function ReviewClient({
  token,
  gallery,
  selectedAlbums,
  totalSelected,
}: {
  token: string
  gallery: SelectionGallery
  selectedAlbums: SelectedAlbum[]
  totalSelected: number
}) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const target = gallery.target_count
  const isOver = target != null && totalSelected > target

  async function handleSubmit() {
    setSubmitting(true)
    setSubmitError(null)
    try {
      await submitGallery(token)
      setSubmitted(true)
    } catch {
      setSubmitError('Noe gikk galt. Prøv igjen.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div style={{ minHeight: '100dvh', background: S.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <p style={{ fontFamily: 'Georgia, serif', fontSize: '1rem', letterSpacing: '0.1em', color: S.gold, textTransform: 'uppercase', marginBottom: 24 }}>Leafilms</p>
          <p style={{ fontFamily: 'sans-serif', fontSize: '0.95rem', color: S.green, fontWeight: 600 }}>✓ Utvalget er sendt inn</p>
          <p style={{ fontFamily: 'sans-serif', fontSize: '0.8rem', color: S.text2, marginTop: 8 }}>
            Vi har mottatt dine {totalSelected} valgte bilder og tar kontakt.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100dvh', background: S.bg, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: S.surface, borderBottom: `1px solid ${S.border}`, padding: '13px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => router.push(`/s/${token}`)} style={{ background: 'none', border: 'none', color: S.text2, cursor: 'pointer', fontSize: '1rem', padding: '0 4px' }}>‹</button>
          <span style={{ fontFamily: 'Georgia, serif', fontSize: '1rem', letterSpacing: '0.1em', color: S.gold, textTransform: 'uppercase' }}>Leafilms</span>
        </div>
        <span style={{ fontFamily: 'sans-serif', fontSize: '0.82rem', color: S.text2 }}>Gjennomgang</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', maxWidth: 720, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {/* Totalteller */}
        <div style={{
          background: isOver ? 'rgba(212,134,58,0.08)' : 'rgba(76,175,125,0.06)',
          border: `1px solid ${isOver ? 'rgba(212,134,58,0.3)' : 'rgba(76,175,125,0.25)'}`,
          borderRadius: 10, padding: '14px 18px', marginBottom: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontFamily: 'sans-serif', fontSize: '1.4rem', fontWeight: 700, color: isOver ? S.warning : S.green }}>
              {totalSelected} bilder
            </div>
            <div style={{ fontFamily: 'sans-serif', fontSize: '0.68rem', color: S.text2, marginTop: 2 }}>
              {target != null ? `av ${target} avtalte` : 'valgt'}
            </div>
          </div>
          {isOver && (
            <div style={{ fontFamily: 'sans-serif', fontSize: '0.72rem', color: S.warning, textAlign: 'right', maxWidth: 180 }}>
              {totalSelected - target!} over avtalt antall — kan medføre tillegg
            </div>
          )}
        </div>

        {/* Bilder per album */}
        {selectedAlbums.map(album => (
          <div key={album.id} style={{ marginBottom: 20 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              paddingBottom: 8, marginBottom: 8, borderBottom: `1px solid ${S.border}`,
            }}>
              <span style={{ fontFamily: 'sans-serif', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: S.text3 }}>
                {album.name}
              </span>
              <span style={{ fontFamily: 'sans-serif', fontSize: '0.75rem', color: S.gold }}>
                {album.images.length} bilder
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 4 }}>
              {album.images.map(img => (
                <div key={img.id} style={{ position: 'relative', aspectRatio: '4/3', borderRadius: 5, overflow: 'hidden' }}>
                  {img.signedUrl
                    ? <img src={img.signedUrl} alt={img.filename} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    : <div style={{ width: '100%', height: '100%', background: S.surface2 }} />
                  }
                  <div style={{ position: 'absolute', top: 3, right: 3, width: 12, height: 12, borderRadius: '50%', background: S.gold }} />
                  {img.comment && (
                    <div style={{ position: 'absolute', bottom: 3, left: 3, width: 10, height: 10, borderRadius: '50%', background: 'rgba(196,148,52,0.7)' }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {totalSelected === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <p style={{ fontFamily: 'sans-serif', fontSize: '0.82rem', color: S.text3 }}>
              Ingen bilder er valgt enda.
            </p>
            <button
              onClick={() => router.push(`/s/${token}`)}
              style={{ marginTop: 12, padding: '8px 16px', borderRadius: 7, border: `1px solid ${S.border}`, background: 'none', color: S.text2, fontFamily: 'sans-serif', fontSize: '0.78rem', cursor: 'pointer' }}
            >
              Gå tilbake til oversikten
            </button>
          </div>
        )}
      </div>

      {/* Send inn */}
      <div style={{ padding: '12px 16px', borderTop: `1px solid ${S.border}`, background: S.surface, flexShrink: 0 }}>
        <button
          onClick={handleSubmit}
          disabled={submitting || totalSelected === 0}
          style={{
            width: '100%', padding: '13px', borderRadius: 9, border: 'none',
            fontFamily: 'sans-serif', fontSize: '0.88rem', fontWeight: 600, cursor: 'pointer',
            background: S.gold, color: '#0C0B09', opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? 'Sender...' : 'Bekreft og send inn'}
        </button>
        {submitError && (
          <p style={{ fontFamily: 'sans-serif', fontSize: '0.72rem', color: '#C0503A', textAlign: 'center', marginTop: 6 }}>
            {submitError}
          </p>
        )}
        {!submitError && (
          <p style={{ fontFamily: 'sans-serif', fontSize: '0.62rem', color: S.text3, textAlign: 'center', marginTop: 6 }}>
            Kan ikke endres etter innsending
          </p>
        )}
      </div>
    </div>
  )
}
