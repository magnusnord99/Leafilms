'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { C } from '@/lib/admin-theme'
import { IndustryLandingPage } from '@/lib/types'
import { listIndustryLandingPages, createIndustryLandingPage, deleteIndustryLandingPage } from '@/lib/actions/industry-landing-pages'
import { listSalesFlyers, createSalesFlyer, deleteSalesFlyer, updateSalesFlyer, SalesFlyerListItem } from '@/lib/actions/sales-flyers'

import { ShareFlyerButton } from '@/components/sales-flyer/ShareFlyerButton'

type Tab = 'bransjesider' | 'flyers'

const formatDate = (ts: string) =>
  new Date(ts).toLocaleString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function LandingPageRow<T extends { id: string; slug: string; published: boolean; updated_at: string }>({
  item, href, onDelete, extra, onTogglePublish, publishing = false, shareFlyer = false,
}: { item: T; href: string; onDelete: (e: React.MouseEvent) => void; extra?: string;
  onTogglePublish?: () => void; publishing?: boolean; shareFlyer?: boolean }) {
  const statusStyle = {
    fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600,
    padding: '6px 10px', borderRadius: 10, letterSpacing: '0.04em',
    background: item.published ? 'rgba(76,175,125,0.12)' : C.surface2,
    color: item.published ? C.success : C.text3,
    border: `1px solid ${item.published ? 'rgba(76,175,125,0.3)' : C.border}`,
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      padding: '14px 16px', marginBottom: 8, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8 }}>
      <Link href={href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', flex: 1, minWidth: 180 }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.9rem', fontWeight: 600, color: C.text, margin: 0, overflowWrap: 'anywhere' }}>{href}</p>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, margin: '2px 0 0' }}>
          Sist oppdatert {formatDate(item.updated_at)}{extra ? ` · ${extra}` : ''}
        </p>
      </Link>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {onTogglePublish ? (
          <button type="button" onClick={onTogglePublish} disabled={publishing} aria-pressed={item.published}
            title={item.published ? 'Klikk for å avpublisere' : 'Klikk for å publisere'}
            style={{ ...statusStyle, cursor: publishing ? 'wait' : 'pointer' }}>
            {publishing ? 'Lagrer…' : item.published ? '✓ Publisert' : 'Ikke publisert · Publiser'}
          </button>
        ) : <span style={statusStyle}>{item.published ? 'Publisert' : 'Kladd'}</span>}
        {shareFlyer && item.published && !publishing && <ShareFlyerButton slug={item.slug} />}
        {shareFlyer && <Link href={`/admin/statistikk/flyers/${item.id}`} className="text-xs hover:underline" style={{ color: C.accent }}>Statistikk</Link>}
        <button type="button" onClick={onDelete} aria-label={`Slett ${item.slug}`} disabled={publishing}
          style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.text3, cursor: 'pointer' }}>×</button>
      </div>
    </div>
  )
}

export default function LandingssiderPage() {
  const [publishingFlyerId, setPublishingFlyerId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('bransjesider')

  const [pages, setPages] = useState<IndustryLandingPage[]>([])
  const [loading, setLoading] = useState(true)
  const [newSlug, setNewSlug] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [flyers, setFlyers] = useState<SalesFlyerListItem[]>([])
  const [flyersLoading, setFlyersLoading] = useState(true)
  const [newFlyerSlug, setNewFlyerSlug] = useState('')
  const [creatingFlyer, setCreatingFlyer] = useState(false)
  const [flyerError, setFlyerError] = useState<string | null>(null)

  async function fetchPages() {
    const result = await listIndustryLandingPages()
    setPages(result)
    setLoading(false)
  }

  async function fetchFlyers() {
    const result = await listSalesFlyers()
    setFlyers(result)
    setFlyersLoading(false)
  }

  useEffect(() => {
    fetchPages()
    fetchFlyers()
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

  async function handleCreateFlyer() {
    const slug = newFlyerSlug.trim().toLowerCase()
    if (!slug || creatingFlyer) return
    setCreatingFlyer(true)
    setFlyerError(null)
    const result = await createSalesFlyer(slug)
    setCreatingFlyer(false)
    if ('error' in result) {
      setFlyerError(result.error)
      return
    }
    setNewFlyerSlug('')
    await fetchFlyers()
    window.open(`/flyer/${slug}`, '_blank', 'noopener,noreferrer')
  }

  async function toggleFlyerPublished(flyer: SalesFlyerListItem) {
    if (publishingFlyerId) return
    setPublishingFlyerId(flyer.id)
    setFlyerError(null)
    try {
      const result = await updateSalesFlyer(flyer.id, { published: !flyer.published })
      if ('error' in result) { setFlyerError(result.error); return }
      setFlyers(current => current.map(item => item.id === flyer.id
        ? { ...item, published: !flyer.published, updated_at: new Date().toISOString() } : item))
    } catch { setFlyerError('Kunne ikke endre publisering. Prøv igjen.') }
    finally { setPublishingFlyerId(null) }
  }

  async function handleDeleteFlyer(e: React.MouseEvent, id: string, slug: string) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(`Slette "/flyer/${slug}" for godt? Dette kan ikke angres.`)) return
    await deleteSalesFlyer(id)
    fetchFlyers()
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px 80px' }}>
        <Link href="/admin" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, textDecoration: 'none' }}>
          ← Dashboard
        </Link>

        <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.5rem', fontWeight: 700, color: C.text, margin: '8px 0 6px' }}>
          Landingssider
        </h1>

        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `1px solid ${C.border}` }}>
          {(['bransjesider', 'flyers'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600,
                padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
                color: tab === t ? C.text : C.text3,
                borderBottom: tab === t ? `2px solid ${C.accent}` : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {t === 'bransjesider' ? 'Bransjesider' : 'Flyers'}
            </button>
          ))}
        </div>

        {tab === 'bransjesider' ? (
          <>
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
                  <LandingPageRow
                    key={page.id}
                    item={page}
                    href={`/${page.slug}`}
                    onDelete={e => handleDelete(e, page.id, page.slug)}
                  />
                ))
              )}
            </div>
          </>
        ) : (
          <>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, marginBottom: 28, lineHeight: 1.6, maxWidth: 560 }}>
              Digitale flyers som sendes til enkeltkunder, f.eks. /flyer/bryllup-2026 — samme mal, eget innhold per
              flyer. Opprett en ny for å gjøre den live på /flyer/&lt;slug&gt; umiddelbart. Innholdet redigeres direkte
              på siden selv — klikk en rad under for å åpne den.
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                type="text"
                value={newFlyerSlug}
                onChange={e => setNewFlyerSlug(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateFlyer() }}
                placeholder="ny-slug, f.eks. bryllup-2026"
                style={{
                  flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem',
                  color: C.text, background: C.surface2,
                  border: `1px solid ${C.border}`, borderRadius: 7,
                  padding: '9px 12px', outline: 'none',
                }}
              />
              <button
                onClick={handleCreateFlyer}
                disabled={!newFlyerSlug.trim() || creatingFlyer}
                style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', fontWeight: 600,
                  padding: '9px 18px', borderRadius: 7, cursor: !newFlyerSlug.trim() || creatingFlyer ? 'default' : 'pointer',
                  background: C.accent, color: '#fff', border: 'none',
                  opacity: !newFlyerSlug.trim() || creatingFlyer ? 0.6 : 1,
                }}
              >
                {creatingFlyer ? 'Oppretter...' : '+ Ny flyer'}
              </button>
            </div>
            {flyerError && (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.danger, marginBottom: 16 }}>{flyerError}</p>
            )}

            <div style={{ marginTop: 24 }}>
              {flyersLoading ? (
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, textAlign: 'center', paddingTop: 48 }}>Laster...</p>
              ) : flyers.length === 0 ? (
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, textAlign: 'center', paddingTop: 24 }}>Ingen flyers ennå.</p>
              ) : (
                flyers.map(flyer => (
                  <LandingPageRow
                    key={flyer.id}
                    item={flyer}
                    href={`/flyer/${flyer.slug}`}
                    onDelete={e => handleDeleteFlyer(e, flyer.id, flyer.slug)}
                    shareFlyer
                    onTogglePublish={() => toggleFlyerPublished(flyer)}
                    publishing={publishingFlyerId === flyer.id}
                    extra={`${flyer.view_count} ${flyer.view_count === 1 ? 'visning' : 'visninger'}`}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
