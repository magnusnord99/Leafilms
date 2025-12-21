'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button, Card, Heading, Text } from '@/components/ui'
import { CaseStudy } from '@/lib/types'

export default function CasesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [cases, setCases] = useState<CaseStudy[]>([])

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

    try {
      const { error } = await supabase
        .from('case_studies')
        .delete()
        .eq('id', caseId)

      if (error) throw error

      // Case slettet
      fetchCases()
    } catch (error) {
      console.error('Error deleting case:', error)
      alert('❌ Kunne ikke slette case')
    }
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
              <Heading as="h1" size="lg" className="mb-2">Case Studies</Heading>
              <Text variant="muted">Administrer tidligere arbeid for gjenbruk i prosjekter</Text>
            </div>
            <Link href="/admin/cases/new">
              <Button variant="primary">+ Nytt Case</Button>
            </Link>
          </div>
        </div>

        {/* Cases Grid */}
        {cases && cases.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cases.map((caseStudy) => (
              <Card key={caseStudy.id} className="overflow-hidden p-0">
                {/* Thumbnail */}
                <div className="aspect-video bg-zinc-800 flex items-center justify-center">
                  {caseStudy.thumbnail_path ? (
                    <img
                      src={caseStudy.thumbnail_path}
                      alt={caseStudy.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Text variant="muted">🎬 Ingen thumbnail</Text>
                  )}
                </div>

                {/* Content */}
                <div className="p-6">
                  <Heading as="h3" size="sm" className="mb-2">{caseStudy.title}</Heading>
                  <Text variant="body" className="mb-4 line-clamp-2">
                    {caseStudy.description}
                  </Text>
                  
                  {/* Tags */}
                  {caseStudy.tags && caseStudy.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {caseStudy.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs px-2 py-1 bg-zinc-800 rounded text-gray-400"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Link href={`/admin/cases/${caseStudy.id}/edit`} className="flex-1">
                      <Button variant="secondary" size="sm" className="w-full">
                        Rediger
                      </Button>
                    </Link>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDelete(caseStudy.id, caseStudy.title)}
                    >
                      🗑️
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <Text variant="body" className="mb-4">Ingen case studies ennå</Text>
            <Link href="/admin/cases/new">
              <Button variant="primary">Legg til første case</Button>
            </Link>
          </Card>
        )}
      </div>
    </div>
  )
}

