'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button, Card, Heading, Text } from '@/components/ui'
import { AIExample } from '@/lib/types'

export default function AIExamplesPage() {
  const router = useRouter()
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
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Text variant="body">Laster...</Text>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <Button
            variant="ghost"
            onClick={() => router.push('/admin')}
            className="mb-4 -ml-2"
          >
            ← Tilbake til admin
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <Heading as="h1" size="lg" className="mb-2">AI Eksempler</Heading>
              <Text variant="muted">Administrer teksteksempler for AI-generering</Text>
            </div>
            <Link href="/admin/ai-examples/new">
              <Button variant="primary">+ Nytt Eksempel</Button>
            </Link>
          </div>
        </div>

        {/* Grouped Examples */}
        <div className="space-y-6">
          {Object.entries(grouped).map(([key, items]) => {
            const [sectionType, projectType] = key.split('-')
            return (
              <Card key={key}>
                <div className="mb-4">
                  <Heading as="h2" size="sm" className="mb-1">
                    {sectionLabels[sectionType] || sectionType} - {projectLabels[projectType] || projectType}
                  </Heading>
                  <Text variant="muted">{items.length} eksempler</Text>
                </div>
                <div className="space-y-3">
                  {items.map((example) => (
                    <div
                      key={example.id}
                      className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <Text variant="body" className="line-clamp-2 mb-2">
                            {example.example_text}
                          </Text>
                          <div className="flex items-center gap-4">
                            <Text variant="muted">
                              Kvalitet: {example.quality_score}/10
                            </Text>
                            <Text variant="muted">
                              Brukt: {example.usage_count} ganger
                            </Text>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Link href={`/admin/ai-examples/${example.id}/edit`}>
                            <Button variant="secondary" size="sm">Rediger</Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )
          })}

          {Object.keys(grouped).length === 0 && (
            <Card className="p-12 text-center">
              <Text variant="body" className="mb-4">Ingen eksempler ennå</Text>
              <Link href="/admin/ai-examples/new">
                <Button variant="primary">Legg til første eksempel</Button>
              </Link>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

