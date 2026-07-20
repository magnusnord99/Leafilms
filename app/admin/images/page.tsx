'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Image } from '@/lib/types'
import { C } from '@/lib/admin-theme'

const categories = [
  { value: 'all',          label: 'Alle' },
  { value: 'landskap',     label: 'Landskap' },
  { value: 'sport',        label: 'Sport' },
  { value: 'closeup',      label: 'Close-up' },
  { value: 'portrett',     label: 'Portrett' },
  { value: 'event',        label: 'Event' },
  { value: 'kommersiell',  label: 'Kommersiell' },
  { value: 'abstrakt',     label: 'Abstrakt' },
  { value: 'bts',          label: 'BTS' },
  { value: 'bryllup',      label: 'Bryllup' },
]

function getImageUrl(image: Image) {
  return supabase.storage.from('assets').getPublicUrl(image.file_path).data.publicUrl
}

export default function ImagesPage() {
  const [loading, setLoading] = useState(true)
  const [images, setImages] = useState<Image[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function fetchImages() {
    setLoading(true)
    try {
      let query = supabase
        .from('images')
        .select('id, filename, file_path, title, category, subcategory, tags, width, height, file_size, created_at, updated_at')
        .order('created_at', { ascending: false })

      if (selectedCategory !== 'all') {
        query = query.eq('category', selectedCategory)
      }

      const { data, error } = await query
      if (error) throw error
      setImages((data || []) as Image[])
    } catch (err) {
      console.error('Error fetching images:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchImages() }, [selectedCategory])

  const filtered = searchQuery
    ? images.filter(img =>
        (img.title || img.filename).toLowerCase().includes(searchQuery.toLowerCase()) ||
        (img.tags || []).some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : images

  async function handleDelete(image: Image) {
    if (!confirm(`Slett "${image.title || image.filename}"?\n\nDette kan ikke angres.`)) return
    setDeletingId(image.id)
    setDeleteError(null)
    try {
      await supabase.storage.from('assets').remove([image.file_path])
      const { error } = await supabase.from('images').delete().eq('id', image.id)
      if (error) throw error
      setImages(prev => prev.filter(i => i.id !== image.id))
    } catch (err) {
      console.error('Delete error:', err)
      setDeleteError(err instanceof Error ? err.message : 'Sletting feilet')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '32px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 28 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.4rem', fontWeight: 600, color: C.text, marginBottom: 4 }}>
              Bildebibliiotek
            </h1>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>
              {images.length} bilder totalt
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/admin/images/presets" style={{ textDecoration: 'none' }}>
              <button style={{
                padding: '8px 16px',
                background: C.surface,
                color: C.text2,
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.65rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                border: `1px solid ${C.border}`,
                borderRadius: 3,
                cursor: 'pointer',
              }}>
                Collage-presets
              </button>
            </Link>
            <Link href="/admin/images/new" style={{ textDecoration: 'none' }}>
              <button style={{
                padding: '8px 16px',
                background: C.accent,
                color: '#fff',
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.65rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                fontWeight: 600,
                border: 'none',
                borderRadius: 3,
                cursor: 'pointer',
              }}>
                + Last opp bilder
              </button>
            </Link>
          </div>
        </div>

        {deleteError && (
          <div style={{ padding: '10px 14px', background: 'rgba(224,85,85,0.1)', border: '1px solid rgba(224,85,85,0.3)', borderRadius: 3, marginBottom: 16 }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: '#E07070' }}>{deleteError}</p>
          </div>
        )}

        {/* Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 280 }}>
            <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              width="13" height="13" fill="none" stroke={C.text3} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Søk på tittel eller tags..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 32px',
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 3,
                color: C.text,
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.72rem',
                outline: 'none',
              }}
            />
          </div>

          {/* Category filter */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {categories.map(cat => (
              <button
                key={cat.value}
                onClick={() => setSelectedCategory(cat.value)}
                style={{
                  padding: '6px 12px',
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.65rem',
                  letterSpacing: '0.04em',
                  borderRadius: 3,
                  border: selectedCategory === cat.value ? `1px solid ${C.accent}` : `1px solid ${C.border}`,
                  background: selectedCategory === cat.value ? C.accentBg : C.surface,
                  color: selectedCategory === cat.value ? C.accent : C.text3,
                  cursor: 'pointer',
                  transition: 'all 0.12s',
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
            <div style={{ width: 20, height: 20, border: `1.5px solid ${C.border}`, borderTop: `1.5px solid ${C.accent}`, borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '56px 24px', border: `1px solid ${C.border}`, borderRadius: 4, background: C.surface }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, marginBottom: 16 }}>
              {images.length === 0 ? 'Ingen bilder ennå' : 'Ingen bilder matcher søket'}
            </p>
            {images.length === 0 && (
              <Link href="/admin/images/new" style={{ textDecoration: 'none' }}>
                <button style={{
                  padding: '9px 20px', background: C.accent, color: '#fff',
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.12em',
                  textTransform: 'uppercase', fontWeight: 600, border: 'none', borderRadius: 3, cursor: 'pointer',
                }}>
                  Last opp første bilde
                </button>
              </Link>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
            {filtered.map(image => {
              const imgUrl = getImageUrl(image)
              const isDeleting = deletingId === image.id
              return (
                <div
                  key={image.id}
                  style={{
                    position: 'relative',
                    background: C.surface,
                    border: `1px solid ${C.border}`,
                    borderRadius: 3,
                    overflow: 'hidden',
                    opacity: isDeleting ? 0.5 : 1,
                    transition: 'opacity 0.15s',
                  }}
                >
                  <div style={{ aspectRatio: '4/3', overflow: 'hidden', background: C.surface2 }}>
                    <img
                      src={imgUrl}
                      alt={image.title || image.filename}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      loading="lazy"
                    />
                  </div>
                  <div style={{ padding: '8px 10px' }}>
                    <p style={{
                      fontFamily: 'var(--font-dm-sans)',
                      fontSize: '0.68rem',
                      fontWeight: 500,
                      color: C.text,
                      marginBottom: 2,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}>
                      {image.title || image.filename}
                    </p>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3 }}>
                      {image.category}{image.subcategory ? ` · ${image.subcategory.split('/').pop()}` : ''}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 4, padding: '0 8px 8px' }}>
                    <Link href={`/admin/images/${image.id}/edit`} style={{ textDecoration: 'none', flex: 1 }}>
                      <button style={{
                        width: '100%',
                        padding: '4px 8px',
                        background: 'transparent',
                        color: C.text3,
                        fontFamily: 'var(--font-dm-sans)',
                        fontSize: '0.6rem',
                        border: `1px solid ${C.border}`,
                        borderRadius: 2,
                        cursor: 'pointer',
                      }}>
                        Rediger
                      </button>
                    </Link>
                    <button
                      onClick={() => handleDelete(image)}
                      disabled={isDeleting}
                      style={{
                        padding: '4px 8px',
                        background: 'transparent',
                        color: '#E05555',
                        fontFamily: 'var(--font-dm-sans)',
                        fontSize: '0.6rem',
                        border: '1px solid rgba(224,85,85,0.25)',
                        borderRadius: 2,
                        cursor: isDeleting ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {isDeleting ? '...' : 'Slett'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, marginTop: 16, textAlign: 'right' }}>
            {filtered.length} {filtered.length !== images.length ? `av ${images.length} ` : ''}bilder
          </p>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
