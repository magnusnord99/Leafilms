'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { C } from '@/lib/admin-theme'
import { IndustryLandingPage } from '@/lib/types'
import { listIndustryLandingPages, createIndustryLandingPage, deleteIndustryLandingPage } from '@/lib/actions/industry-landing-pages'

export default function LandingssiderPage() {
  const [pages, setPages] = useState<IndustryLandingPage[]>([])
  const [loading, setLoading] = useState(true)
  const [newSlug, setNewSlug] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function fetchPages() {
    const result = await listIndustryLandingPages()
    setPages(result)
    setLoading(false)
  }

  useEffect(() => {
    fetchPages()
  }, [])

  async function handleCreate() {
    const slug = newSlug.trim().toLowerCase()
    if (!slug || creating) return
    setCreating(true)
    setError(null)
    const result = await createIndustryLandingPage(slug)
    setCreating(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setNewSlug('')
    await fetchPages()
    window.open(`/${slug}`, '_blank', 'noopener,noreferrer')
  }

  async function handleDelete(e: React.MouseEvent, id: string, slug: string) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(`Slette "/${slug}" for godt? Dette kan ikke angres.`)) return
    await deleteIndustryLandingPage(id)
    fetchPages()
  }

  const formatDate = (ts: string) =>
    new Date(ts).toLocaleString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px 80px' }}>
        <Link href="/admin" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, textDecoration: 'none' }}>
          ← Dashboard
        </Link>

        <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.5rem', fontWeight: 700, color: C.text, margin: '8px 0 6px' }}>
          Landingssider
        </h1>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, marginBottom: 28, lineHeight: 1.6, maxWidth: 560 }}>
          Bransje-oppsøkende sider som /energi — samme mal, eget innhold per side. Opprett en ny for å gjøre den
          live på /&lt;slug&gt; umiddelbart. Innholdet redigeres direkte på siden selv (trykk &quot;Rediger&quot; øverst til
          høyre der) — klikk en rad under for å åpne den.
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            type="text"
            value={newSlug}
            onChange={e => setNewSlug(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
            placeholder="ny-slug, f.eks. bryllup"
            style={{
              flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem',
              color: C.text, background: C.surface2,
              border: `1px solid ${C.border}`, borderRadius: 7,
              padding: '9px 12px', outline: 'none',
            }}
          />
          <button
            onClick={handleCreate}
            disabled={!newSlug.trim() || creating}
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', fontWeight: 600,
              padding: '9px 18px', borderRadius: 7, cursor: !newSlug.trim() || creating ? 'default' : 'pointer',
              background: C.accent, color: '#fff', border: 'none',
              opacity: !newSlug.trim() || creating ? 0.6 : 1,
            }}
          >
            {creating ? 'Oppretter...' : '+ Ny side'}
          </button>
        </div>
        {error && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.danger, marginBottom: 16 }}>{error}</p>
        )}

        <div style={{ marginTop: 24 }}>
          {loading ? (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, textAlign: 'center', paddingTop: 48 }}>Laster...</p>
          ) : pages.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, textAlign: 'center', paddingTop: 24 }}>Ingen sider ennå.</p>
          ) : (
            pages.map(page => (
              <Link
                key={page.id}
                href={`/${page.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: 'none', display: 'block' }}
              >
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  padding: '14px 16px', marginBottom: 8,
                  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8,
                }}>
                  <div>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.9rem', fontWeight: 600, color: C.text, margin: 0 }}>
                      /{page.slug}
                    </p>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, margin: '2px 0 0' }}>
                      Sist oppdatert {formatDate(page.updated_at)}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600,
                      padding: '3px 10px', borderRadius: 10, textTransform: 'uppercase', letterSpacing: '0.04em',
                      background: page.published ? 'rgba(76,175,125,0.12)' : C.surface2,
                      color: page.published ? C.success : C.text3,
                      border: `1px solid ${page.published ? 'rgba(76,175,125,0.3)' : C.border}`,
                    }}>
                      {page.published ? 'Publisert' : 'Kladd'}
                    </span>
                    <button
                      onClick={e => handleDelete(e, page.id, page.slug)}
                      style={{
                        width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.text3, cursor: 'pointer',
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
