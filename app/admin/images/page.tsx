'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Image } from '@/lib/types'
import { C } from '@/lib/admin-theme'
import { useImageCategories, type ImageCategory, type ImageSubcategory } from '@/hooks/useImageCategories'
import { useGridZoom } from '@/hooks/useGridZoom'

function getImageUrl(image: Image) {
  return supabase.storage.from('assets').getPublicUrl(image.file_path).data.publicUrl
}

function PencilIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0l-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z" />
    </svg>
  )
}

function CategoryChip({
  label,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  label: string
  active: boolean
  onSelect: () => void
  onRename: (newLabel: string) => Promise<void>
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(label)
  const [saving, setSaving] = useState(false)

  useEffect(() => { setValue(label) }, [label])

  async function save() {
    const trimmed = value.trim()
    if (!trimmed || trimmed === label) { setValue(label); setEditing(false); return }
    setSaving(true)
    try {
      await onRename(trimmed)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Kunne ikke lagre nytt navn')
      setValue(label)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  const chipFont = { fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.04em' }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        disabled={saving}
        onChange={e => setValue(e.target.value)}
        onFocus={e => e.target.select()}
        onBlur={save}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); save() }
          if (e.key === 'Escape') { setValue(label); setEditing(false) }
        }}
        style={{
          ...chipFont,
          padding: '6px 10px',
          borderRadius: 3,
          border: `1px solid ${C.accent}`,
          background: C.surface,
          color: C.text,
          outline: 'none',
          width: 140,
        }}
      />
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        padding: '5px 5px 5px 12px',
        borderRadius: 3,
        border: active ? `1px solid ${C.accent}` : `1px solid ${C.border}`,
        background: active ? C.accentBg : C.surface,
      }}
    >
      <button
        onClick={onSelect}
        style={{ ...chipFont, background: 'none', border: 'none', padding: '1px 2px', color: active ? C.accent : C.text3, cursor: 'pointer' }}
      >
        {label}
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); setEditing(true) }}
        title="Gi nytt navn"
        style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', opacity: 0.55, color: active ? C.accent : C.text3, display: 'flex' }}
      >
        <PencilIcon />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        title="Slett"
        style={{ background: 'none', border: 'none', padding: 4, cursor: 'pointer', opacity: 0.55, color: active ? C.accent : C.text3, display: 'flex' }}
      >
        <TrashIcon />
      </button>
    </div>
  )
}

function NewCategoryChip({ placeholder, onCreate }: { placeholder: string; onCreate: (label: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit() {
    const trimmed = value.trim()
    if (!trimmed) { setEditing(false); return }
    setSaving(true)
    try {
      await onCreate(trimmed)
      setValue('')
      setEditing(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Kunne ikke opprette')
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        disabled={saving}
        placeholder={placeholder}
        onChange={e => setValue(e.target.value)}
        onBlur={submit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); submit() }
          if (e.key === 'Escape') { setValue(''); setEditing(false) }
        }}
        style={{
          fontFamily: 'var(--font-dm-sans)',
          fontSize: '0.65rem',
          padding: '6px 10px',
          borderRadius: 3,
          border: `1px dashed ${C.accent}`,
          background: C.surface,
          color: C.text,
          outline: 'none',
          width: 150,
        }}
      />
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      style={{
        fontFamily: 'var(--font-dm-sans)',
        fontSize: '0.65rem',
        letterSpacing: '0.04em',
        padding: '6px 12px',
        borderRadius: 3,
        border: `1px dashed ${C.border}`,
        background: 'transparent',
        color: C.text3,
        cursor: 'pointer',
      }}
    >
      + Ny
    </button>
  )
}

export default function ImagesPage() {
  const [loading, setLoading] = useState(true)
  const [images, setImages] = useState<Image[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const {
    categories: cats,
    createCategory,
    renameCategory,
    createSubcategory,
    renameSubcategory,
    deleteCategory,
    deleteSubcategory,
  } = useImageCategories()
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string | null>(null)
  const [selectedSubSlug, setSelectedSubSlug] = useState<string | null>(null)
  const [zoom, setZoom] = useGridZoom('lf_admin_images_zoom', 180)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkCategory, setBulkCategory] = useState('')
  const [bulkSubcategory, setBulkSubcategory] = useState('')
  const [bulkApplying, setBulkApplying] = useState(false)
  const [bulkError, setBulkError] = useState<string | null>(null)

  async function fetchImages() {
    setLoading(true)
    try {
      let query = supabase
        .from('images')
        .select('id, filename, file_path, title, category, subcategory, tags, width, height, file_size, created_at, updated_at')
        .order('created_at', { ascending: false })

      if (selectedCategorySlug) {
        query = query.eq('category', selectedCategorySlug)
        if (selectedSubSlug) {
          query = query.eq('subcategory', `${selectedCategorySlug}/${selectedSubSlug}`)
        }
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

  useEffect(() => { fetchImages() }, [selectedCategorySlug, selectedSubSlug])

  const filtered = searchQuery
    ? images.filter(img =>
        (img.title || img.filename).toLowerCase().includes(searchQuery.toLowerCase()) ||
        (img.tags || []).some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : images

  const visibleIds = filtered.map(img => img.id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id))
  const activeCategory = cats.find(c => c.slug === selectedCategorySlug) || null
  const bulkCategoryObj = cats.find(c => c.slug === bulkCategory)
  const bulkSubcategoryOptions = bulkCategoryObj?.subcategories || []

  function labelForCategory(slug: string) {
    return cats.find(c => c.slug === slug)?.label || slug
  }

  function labelForSubcategory(fullSlug: string) {
    const [catSlug, subSlug] = fullSlug.split('/')
    const sub = cats.find(c => c.slug === catSlug)?.subcategories.find(s => s.slug === subSlug)
    return sub?.label || subSlug
  }

  async function handleDeleteCategory(cat: ImageCategory) {
    if (!confirm(`Slett kategorien "${cat.label}"?`)) return
    try {
      await deleteCategory(cat)
      if (selectedCategorySlug === cat.slug) {
        setSelectedCategorySlug(null)
        setSelectedSubSlug(null)
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Kunne ikke slette kategorien')
    }
  }

  async function handleDeleteSubcategory(cat: ImageCategory, sub: ImageSubcategory) {
    if (!confirm(`Slett underkategorien "${sub.label}"?`)) return
    try {
      await deleteSubcategory(cat, sub)
      if (selectedSubSlug === sub.slug) setSelectedSubSlug(null)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Kunne ikke slette underkategorien')
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAllVisible() {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        visibleIds.forEach(id => next.delete(id))
      } else {
        visibleIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  async function handleBulkApply() {
    if (!bulkCategory || selectedIds.size === 0) return
    const count = selectedIds.size
    if (!confirm(`Endre kategori til "${labelForCategory(bulkCategory)}" for ${count} bilde${count === 1 ? '' : 'r'}?`)) return

    setBulkApplying(true)
    setBulkError(null)
    try {
      const { error } = await supabase
        .from('images')
        .update({ category: bulkCategory, subcategory: bulkSubcategory || null })
        .in('id', Array.from(selectedIds))
      if (error) throw error

      await fetchImages()
      clearSelection()
      setBulkCategory('')
      setBulkSubcategory('')
    } catch (err) {
      console.error('Bulk update error:', err)
      setBulkError(err instanceof Error ? err.message : 'Bulk-oppdatering feilet')
    } finally {
      setBulkApplying(false)
    }
  }

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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14, alignItems: 'center' }}>
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
                fontSize: '1rem',
                outline: 'none',
              }}
            />
          </div>

          {/* Zoom */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>－</span>
            <input
              type="range"
              min={120}
              max={320}
              step={20}
              value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              style={{ width: 110, accentColor: C.accent, cursor: 'pointer' }}
              aria-label="Zoom i bildegrid"
            />
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>＋</span>
          </div>
        </div>

        {/* Category / underkategori-mapper */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <button
              onClick={() => { setSelectedCategorySlug(null); setSelectedSubSlug(null) }}
              style={{
                padding: '6px 12px',
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.65rem',
                letterSpacing: '0.04em',
                borderRadius: 3,
                border: !selectedCategorySlug ? `1px solid ${C.accent}` : `1px solid ${C.border}`,
                background: !selectedCategorySlug ? C.accentBg : C.surface,
                color: !selectedCategorySlug ? C.accent : C.text3,
                cursor: 'pointer',
              }}
            >
              Alle
            </button>
            {cats.map(cat => (
              <CategoryChip
                key={cat.id}
                label={cat.label}
                active={selectedCategorySlug === cat.slug}
                onSelect={() => { setSelectedCategorySlug(cat.slug); setSelectedSubSlug(null) }}
                onRename={(label) => renameCategory(cat.id, label)}
                onDelete={() => handleDeleteCategory(cat)}
              />
            ))}
            <NewCategoryChip placeholder="Ny kategori..." onCreate={createCategory} />
          </div>

          {activeCategory && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 8, paddingLeft: 18 }}>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3 }}>↳</span>
              <button
                onClick={() => setSelectedSubSlug(null)}
                style={{
                  padding: '6px 12px',
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.65rem',
                  letterSpacing: '0.04em',
                  borderRadius: 3,
                  border: !selectedSubSlug ? `1px solid ${C.accent}` : `1px solid ${C.border}`,
                  background: !selectedSubSlug ? C.accentBg : C.surface,
                  color: !selectedSubSlug ? C.accent : C.text3,
                  cursor: 'pointer',
                }}
              >
                Alle i {activeCategory.label}
              </button>
              {activeCategory.subcategories.map(sub => (
                <CategoryChip
                  key={sub.id}
                  label={sub.label}
                  active={selectedSubSlug === sub.slug}
                  onSelect={() => setSelectedSubSlug(sub.slug)}
                  onRename={(label) => renameSubcategory(sub.id, label)}
                  onDelete={() => handleDeleteSubcategory(activeCategory, sub)}
                />
              ))}
              <NewCategoryChip
                placeholder="Ny underkategori..."
                onCreate={(label) => createSubcategory(activeCategory, label)}
              />
            </div>
          )}
        </div>

        {/* Selection toolbar */}
        {!loading && filtered.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <button
              onClick={toggleSelectAllVisible}
              style={{
                padding: '6px 12px',
                background: C.surface,
                color: C.text2,
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.65rem',
                letterSpacing: '0.05em',
                border: `1px solid ${C.border}`,
                borderRadius: 3,
                cursor: 'pointer',
              }}
            >
              {allVisibleSelected ? 'Fjern alle synlige' : `Velg alle synlige (${visibleIds.length})`}
            </button>
            {selectedIds.size > 0 && (
              <>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text2 }}>
                  {selectedIds.size} valgt
                </span>
                <button
                  onClick={clearSelection}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: '0.65rem',
                    color: C.text3,
                    textDecoration: 'underline',
                    cursor: 'pointer',
                  }}
                >
                  Tøm valg
                </button>
              </>
            )}
          </div>
        )}

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
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${zoom}px, 1fr))`, gap: 8 }}>
            {filtered.map(image => {
              const imgUrl = getImageUrl(image)
              const isDeleting = deletingId === image.id
              const isSelected = selectedIds.has(image.id)
              return (
                <div
                  key={image.id}
                  style={{
                    position: 'relative',
                    background: C.surface,
                    border: isSelected ? `1px solid ${C.accent}` : `1px solid ${C.border}`,
                    borderRadius: 3,
                    overflow: 'hidden',
                    opacity: isDeleting ? 0.5 : 1,
                    transition: 'opacity 0.15s',
                  }}
                >
                  <div style={{ position: 'relative', aspectRatio: '4/3', overflow: 'hidden', background: C.surface2 }}>
                    <img
                      src={imgUrl}
                      alt={image.title || image.filename}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      loading="lazy"
                    />
                    <label
                      style={{
                        position: 'absolute',
                        top: 6,
                        left: 6,
                        width: 24,
                        height: 24,
                        borderRadius: 3,
                        background: isSelected ? C.accent : 'rgba(24,25,32,0.7)',
                        border: `1px solid ${isSelected ? C.accent : 'rgba(255,255,255,0.4)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelected(image.id)}
                        style={{ position: 'absolute', opacity: 0, width: 24, height: 24, cursor: 'pointer' }}
                      />
                      {isSelected && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </label>
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
                      {labelForCategory(image.category)}{image.subcategory ? ` · ${labelForSubcategory(image.subcategory)}` : ''}
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

        {selectedIds.size > 0 && <div style={{ height: 80 }} />}
      </div>

      {selectedIds.size > 0 && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: C.sidebar,
          borderTop: `1px solid ${C.border}`,
          padding: '14px 32px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          zIndex: 10,
        }}>
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text, fontWeight: 500 }}>
            {selectedIds.size} bilde{selectedIds.size === 1 ? '' : 'r'} valgt
          </span>

          <select
            value={bulkCategory}
            onChange={e => { setBulkCategory(e.target.value); setBulkSubcategory('') }}
            style={{
              padding: '7px 10px',
              background: C.surface,
              color: C.text,
              border: `1px solid ${C.border}`,
              borderRadius: 3,
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.7rem',
            }}
          >
            <option value="">Ny kategori...</option>
            {cats.map(cat => (
              <option key={cat.id} value={cat.slug}>{cat.label}</option>
            ))}
          </select>

          {bulkSubcategoryOptions.length > 0 && (
            <select
              value={bulkSubcategory}
              onChange={e => setBulkSubcategory(e.target.value)}
              style={{
                padding: '7px 10px',
                background: C.surface,
                color: C.text,
                border: `1px solid ${C.border}`,
                borderRadius: 3,
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.7rem',
              }}
            >
              <option value="">Ingen underkategori</option>
              {bulkSubcategoryOptions.map(sub => (
                <option key={sub.id} value={`${bulkCategory}/${sub.slug}`}>
                  {sub.label}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={handleBulkApply}
            disabled={!bulkCategory || bulkApplying}
            style={{
              padding: '8px 16px',
              background: bulkCategory ? C.accent : C.surface,
              color: bulkCategory ? '#fff' : C.text3,
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.65rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontWeight: 600,
              border: 'none',
              borderRadius: 3,
              cursor: bulkCategory && !bulkApplying ? 'pointer' : 'not-allowed',
            }}
          >
            {bulkApplying ? 'Oppdaterer...' : 'Bruk på valgte'}
          </button>

          <button
            onClick={clearSelection}
            style={{
              padding: '8px 12px',
              background: 'transparent',
              color: C.text3,
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.65rem',
              border: `1px solid ${C.border}`,
              borderRadius: 3,
              cursor: 'pointer',
            }}
          >
            Avbryt
          </button>

          {bulkError && (
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: '#E07070' }}>
              {bulkError}
            </span>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
