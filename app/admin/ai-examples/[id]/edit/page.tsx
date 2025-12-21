'use client'

import { use, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button, Textarea, Card, Heading, Text } from '@/components/ui'
import { AIExample } from '@/lib/types'

type Props = {
  params: Promise<{ id: string }>
}

export default function EditAIExample({ params }: Props) {
  const router = useRouter()
  const { id } = use(params)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [example, setExample] = useState<AIExample | null>(null)
  const [formData, setFormData] = useState({
    example_text: '',
    quality_score: 5
  })

  useEffect(() => {
    async function fetchExample() {
      try {
        const { data, error } = await supabase
          .from('ai_examples')
          .select('*')
          .eq('id', id)
          .single()

        if (error) throw error
        
        const exampleData = data as AIExample
        setExample(exampleData)
        setFormData({
          example_text: exampleData.example_text,
          quality_score: exampleData.quality_score
        })
      } catch (error) {
        console.error('Error fetching example:', error)
        alert('Kunne ikke hente eksempel')
      } finally {
        setLoading(false)
      }
    }

    fetchExample()
  }, [id])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const { error } = await supabase
        .from('ai_examples')
        .update({
          example_text: formData.example_text,
          quality_score: formData.quality_score,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)

      if (error) throw error

      // Eksempel oppdatert
      router.push('/admin/ai-examples')
      router.refresh()
    } catch (error) {
      console.error('Error updating example:', error)
      alert('❌ Kunne ikke oppdatere eksempel')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Er du sikker på at du vil slette dette eksemplet?')) return

    setDeleting(true)
    try {
      const { error } = await supabase
        .from('ai_examples')
        .delete()
        .eq('id', id)

      if (error) throw error

      // Eksempel slettet
      router.push('/admin/ai-examples')
      router.refresh()
    } catch (error) {
      console.error('Error deleting example:', error)
      alert('❌ Kunne ikke slette eksempel')
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Text variant="body">Laster...</Text>
      </div>
    )
  }

  if (!example) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <Text variant="body" className="mb-4">Eksempel ikke funnet</Text>
          <Button onClick={() => router.push('/admin/ai-examples')}>
            Tilbake
          </Button>
        </div>
      </div>
    )
  }

  const sectionLabels: Record<string, string> = {
    goal: 'Mål',
    concept: 'Konsept'
  }

  const projectLabels: Record<string, string> = {
    event: 'Event',
    branding: 'Branding',
    documentary: 'Dokumentarisk'
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <Button
            variant="ghost"
            onClick={() => router.push('/admin/ai-examples')}
            className="mb-4 -ml-2"
          >
            ← Tilbake
          </Button>
          <Heading as="h1" size="lg" className="mb-2">Rediger Eksempel</Heading>
          <Text variant="muted">
            {sectionLabels[example.section_type]} - {projectLabels[example.project_type]}
          </Text>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="space-y-6">
          {/* Example Text */}
          <Textarea
            label="Eksempeltekst *"
            required
            value={formData.example_text}
            onChange={(e) => setFormData({ ...formData, example_text: e.target.value })}
            placeholder="Skriv et godt eksempel på tekst for denne seksjonen..."
            rows={8}
          />

          {/* Quality Score */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-300">
              Kvalitet (1-10)
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={formData.quality_score}
              onChange={(e) => setFormData({ ...formData, quality_score: parseInt(e.target.value) })}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-zinc-600"
            />
            <Text variant="muted" className="mt-2">
              Høyere poengsum = mer sannsynlig å bli valgt av AI
            </Text>
          </div>

          {/* Stats */}
          <Card className="bg-zinc-800/50">
            <Text variant="small" className="mb-1">Statistikk:</Text>
            <Text variant="muted">
              Brukt {example.usage_count} ganger • Opprettet {new Date(example.created_at).toLocaleDateString('nb-NO')}
            </Text>
          </Card>

          {/* Submit */}
          <div className="flex gap-4">
            <Button
              type="submit"
              disabled={saving}
              variant="primary"
              className="flex-1"
            >
              {saving ? 'Lagrer...' : 'Lagre endringer'}
            </Button>
            <Button
              type="button"
              onClick={() => router.push('/admin/ai-examples')}
              variant="secondary"
            >
              Avbryt
            </Button>
          </div>

          {/* Delete */}
          <div className="pt-6 border-t border-zinc-800">
            <Button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              variant="danger"
              className="w-full"
            >
              {deleting ? 'Sletter...' : '🗑️ Slett eksempel'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

