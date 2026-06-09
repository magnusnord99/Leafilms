'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui'
import { AIExample } from '@/lib/types'
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

export default function AIExamplesPage() {
  const [loading, setLoading] = useState(true)
  const [examples, setExamples] = useState<AIExample[]>([])

  useEffect(() => {
    async function fetchExamples() {
      const { data } = await supabase
        .from('ai_examples')
        .select('*')
        .order('section_type', { ascending: true })
        .order('project_type', { ascending: true })
        .order('quality_score', { ascending: false })

      setExamples((data || []) as AIExample[])
      setLoading(false)
    }

    fetchExamples()
  }, [])

  // Grupper eksempler
  const grouped = examples.reduce((acc, example) => {
    const key = `${example.section_type}-${example.project_type}`
    if (!acc[key]) {
      acc[key] = []
    }
    acc[key].push(example)
    return acc
  }, {} as Record<string, AIExample[]>)

  const sectionLabels: Record<string, string> = {
    goal: 'Mål',
    concept: 'Konsept'
  }

  const projectLabels: Record<string, string> = {
    event: 'Event',
    branding: 'Branding',
    documentary: 'Dokumentarisk'
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
    <div className="min-h-screen p-8 md:p-12" style={{ background: C.bg, color: C.text }}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-6 mb-14">
          <div>
            <div className="flex items-center gap-4 mb-4">
              <div style={{ width: 32, height: 1, background: C.accent }} />
              {sectionLabel('Konfigurasjon')}
            </div>
            <h1 style={{
              fontFamily: 'var(--font-cormorant)',
              fontSize: 'clamp(2rem, 4vw, 3rem)',
              fontWeight: 300,
              fontStyle: 'italic',
              color: C.text,
              lineHeight: 1,
            }}>
              AI Eksempler
            </h1>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, marginTop: 8, letterSpacing: '0.06em' }}>
              {examples.length} eksempel{examples.length !== 1 ? 'r' : ''} · brukes som treningsdata for AI-tekstgenerering
            </p>
          </div>
          <Link href="/admin/ai-examples/new">
            <Button variant="primary" size="sm">+ Nytt Eksempel</Button>
          </Link>
        </div>

        {/* Grouped Examples */}
        <div className="flex flex-col gap-6">
          {Object.entries(grouped).map(([key, items]) => {
            const [sectionType, projectType] = key.split('-')
            return (
              <div
                key={key}
                style={{ border: `1px solid ${C.border}`, borderRadius: 3, overflow: 'hidden' }}
              >
                {/* Group header */}
                <div
                  className="flex items-center justify-between px-5 py-3"
                  style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}
                >
                  <div>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', fontWeight: 500, color: C.text, letterSpacing: '0.03em' }}>
                      {sectionLabels[sectionType] || sectionType}
                      <span style={{ color: C.text3, margin: '0 8px' }}>·</span>
                      {projectLabels[projectType] || projectType}
                    </p>
                  </div>
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3 }}>
                    {items.length} eksempler
                  </span>
                </div>

                {/* Examples */}
                {items.map((example, i) => (
                  <div
                    key={example.id}
                    className="flex items-start justify-between gap-4 px-5 py-4"
                    style={{
                      background: C.sidebar,
                      borderBottom: i < items.length - 1 ? `1px solid ${C.border}` : 'none',
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text, lineHeight: 1.6, marginBottom: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {example.example_text}
                      </p>
                      <div className="flex items-center gap-4">
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, letterSpacing: '0.06em' }}>
                          Kvalitet: {example.quality_score}/10
                        </span>
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, letterSpacing: '0.06em' }}>
                          Brukt {example.usage_count} ganger
                        </span>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <Link href={`/admin/ai-examples/${example.id}/edit`}>
                        <Button variant="secondary" size="sm">Rediger</Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}

          {Object.keys(grouped).length === 0 && (
            <div
              className="p-12 text-center"
              style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 3 }}
            >
              <p style={{ color: C.text3, fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', marginBottom: 8 }}>
                Ingen eksempler ennå
              </p>
              <p style={{ color: C.text3, fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', marginBottom: 20 }}>
                Legg til teksteksempler som AI bruker som referanse ved generering av mål og konsepter.
              </p>
              <Link href="/admin/ai-examples/new">
                <Button variant="primary">Legg til første eksempel</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

