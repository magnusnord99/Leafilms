'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui'
import { CaseStudy } from '@/lib/types'
import { C } from '@/lib/admin-theme'

const sectionLabel = (text: string) => (
  <span style={{
    fontFamily: 'var(--font-dm-sans)',
    fontSize: '0.6rem',
    letterSpacing: '0.16em',
    color: C.accent,
    textTransform: 'uppercase' as const,
    fontWeight: 500,
  }}>
    {text}
  </span>
)

export default function CasesPage() {
  const [loading, setLoading] = useState(true)
  const [cases, setCases] = useState<CaseStudy[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    fetchCases()
  }, [])

  async function fetchCases() {
    const { data, error } = await supabase
      .from('case_studies')
      .select('*')
      .order('order_index', { ascending: true })

    if (error) {
      console.error('Error fetching cases:', error)
    } else {
      setCases((data || []) as CaseStudy[])
    }
    setLoading(false)
  }

  async function handleDelete(caseId: string, caseTitle: string) {
    if (!confirm(`Er du sikker på at du vil slette "${caseTitle}"?\n\nDette kan ikke angres.`)) {
      return
    }
    setDeletingId(caseId)
    setDeleteError(null)
    try {
      const { error } = await supabase
        .from('case_studies')
        .delete()
        .eq('id', caseId)

      if (error) throw error
      fetchCases()
    } catch (error) {
      console.error('Error deleting case:', error)
      setDeleteError('Kunne ikke slette case. Prøv igjen.')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg }}>
        <div className="flex items-center gap-3">
          <div style={{ width: 1, height: 24, background: C.accent, opacity: 0.5 }} />
          <p style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.6rem',
            letterSpacing: '0.16em',
            color: C.text3,
            textTransform: 'uppercase',
          }}>
            Laster...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 sm:p-8 md:p-12" style={{ background: C.bg, color: C.text }}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-6 mb-14">
          <div>
            <div className="flex items-center gap-4 mb-4">
              <div style={{ width: 32, height: 1, background: C.accent }} />
              {sectionLabel('Bibliotek')}
            </div>
            <h1 style={{
              fontFamily: 'var(--font-cormorant)',
              fontSize: 'clamp(2rem, 4vw, 3rem)',
              fontWeight: 300,
              fontStyle: 'italic',
              color: C.text,
              lineHeight: 1,
            }}>
              Cases
            </h1>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, marginTop: 8, letterSpacing: '0.06em' }}>
              {cases.length} case{cases.length !== 1 ? 's' : ''} · gjenbrukes i prosjekter
            </p>
          </div>
          <Link href="/admin/cases/new">
            <Button variant="primary" size="sm">+ Nytt Case</Button>
          </Link>
        </div>

        {/* Error */}
        {deleteError && (
          <div
            className="mb-6 px-5 py-3 flex items-center justify-between"
            style={{ background: 'rgba(184,64,64,0.12)', border: '1px solid rgba(184,64,64,0.3)', borderRadius: 3 }}
          >
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: '#E07070' }}>{deleteError}</p>
            <button onClick={() => setDeleteError(null)} style={{ color: C.text3, lineHeight: 0 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" d="M2 2l10 10M12 2L2 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Cases Grid */}
        {cases.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cases.map((caseStudy) => (
              <div
                key={caseStudy.id}
                style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 3, overflow: 'hidden' }}
              >
                {/* Thumbnail */}
                <div className="aspect-video flex items-center justify-center" style={{ background: C.sidebar }}>
                  {caseStudy.thumbnail_path ? (
                    <img
                      src={caseStudy.thumbnail_path}
                      alt={caseStudy.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke={C.border} strokeWidth="1">
                      <rect x="2" y="6" width="28" height="20" rx="2" />
                      <path d="M12 11l10 5-10 5V11z" />
                    </svg>
                  )}
                </div>

                {/* Content */}
                <div className="p-5">
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', fontWeight: 500, color: C.text, marginBottom: 6 }}>
                    {caseStudy.title}
                  </p>
                  {caseStudy.description && (
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, lineHeight: 1.5, marginBottom: 10, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {caseStudy.description}
                    </p>
                  )}

                  {/* Tags */}
                  {caseStudy.tags && caseStudy.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-4">
                      {caseStudy.tags.map((tag) => (
                        <span
                          key={tag}
                          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, letterSpacing: '0.06em', background: C.sidebar, padding: '2px 6px', borderRadius: 2 }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Link href={`/admin/cases/${caseStudy.id}/edit`} className="flex-1">
                      <Button variant="primary" size="sm" className="w-full">
                        Rediger
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(caseStudy.id, caseStudy.title)}
                      disabled={deletingId === caseStudy.id}
                      style={{ color: '#B84040' }}
                    >
                      {deletingId === caseStudy.id ? '...' : 'Slett'}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            className="p-12 text-center"
            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 3 }}
          >
            <p style={{ color: C.text3, fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', marginBottom: 8 }}>
              Ingen case studies ennå
            </p>
            <p style={{ color: C.text3, fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', marginBottom: 20 }}>
              Legg til tidligere arbeid her for å gjenbruke dem i prosjektpresentasjoner.
            </p>
            <Link href="/admin/cases/new">
              <Button variant="primary">Legg til første case</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

