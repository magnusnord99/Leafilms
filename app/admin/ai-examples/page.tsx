'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui'
import { AIExample } from '@/lib/types'

const sectionLabel = (text: string) => (
  <span style={{
    fontFamily: 'var(--font-dm-sans)',
    fontSize: '0.6rem',
    letterSpacing: '0.16em',
    color: '#C49434',
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0C0B09' }}>
        <div className="flex items-center gap-3">
          <div style={{ width: 1, height: 24, background: '#C49434', opacity: 0.5 }} />
          <p style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.6rem',
            letterSpacing: '0.16em',
            color: '#62594E',
            textTransform: 'uppercase',
          }}>
            Laster...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8 md:p-12" style={{ background: '#0C0B09', color: '#E8E1D5' }}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-6 mb-14">
          <div>
            <div className="flex items-center gap-4 mb-4">
              <div style={{ width: 32, height: 1, background: '#C49434' }} />
              {sectionLabel('Konfigurasjon')}
            </div>
            <h1 style={{
              fontFamily: 'var(--font-cormorant)',
              fontSize: 'clamp(2rem, 4vw, 3rem)',
              fontWeight: 300,
              fontStyle: 'italic',
              color: '#E8E1D5',
              lineHeight: 1,
            }}>
              AI Eksempler
            </h1>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: '#62594E', marginTop: 8, letterSpacing: '0.06em' }}>
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
                style={{ border: '1px solid #2A261F', borderRadius: 3, overflow: 'hidden' }}
              >
                {/* Group header */}
                <div
                  className="flex items-center justify-between px-5 py-3"
                  style={{ background: '#161410', borderBottom: '1px solid #2A261F' }}
                >
                  <div>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', fontWeight: 500, color: '#E8E1D5', letterSpacing: '0.03em' }}>
                      {sectionLabels[sectionType] || sectionType}
                      <span style={{ color: '#38332A', margin: '0 8px' }}>·</span>
                      {projectLabels[projectType] || projectType}
                    </p>
                  </div>
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#38332A' }}>
                    {items.length} eksempler
                  </span>
                </div>

                {/* Examples */}
                {items.map((example, i) => (
                  <div
                    key={example.id}
                    className="flex items-start justify-between gap-4 px-5 py-4"
                    style={{
                      background: '#0E0D0B',
                      borderBottom: i < items.length - 1 ? '1px solid #2A261F' : 'none',
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: '#E8E1D5', lineHeight: 1.6, marginBottom: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {example.example_text}
                      </p>
                      <div className="flex items-center gap-4">
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: '#62594E', letterSpacing: '0.06em' }}>
                          Kvalitet: {example.quality_score}/10
                        </span>
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: '#38332A', letterSpacing: '0.06em' }}>
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
              style={{ background: '#161410', border: '1px solid #2A261F', borderRadius: 3 }}
            >
              <p style={{ color: '#62594E', fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', marginBottom: 8 }}>
                Ingen eksempler ennå
              </p>
              <p style={{ color: '#38332A', fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', marginBottom: 20 }}>
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

