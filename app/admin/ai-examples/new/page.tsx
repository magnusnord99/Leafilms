'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button, Input, Textarea, Card, Heading, Text } from '@/components/ui'

export default function NewAIExample() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    section_type: '',
    project_type: '',
    example_text: '',
    quality_score: 5
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { error } = await supabase
        .from('ai_examples')
        .insert({
          section_type: formData.section_type,
          project_type: formData.project_type,
          example_text: formData.example_text,
          quality_score: formData.quality_score
        })

      if (error) throw error

      // Eksempel opprettet
      router.push('/admin/ai-examples')
      router.refresh()
    } catch (error) {
      console.error('Error creating example:', error)
      alert('❌ Kunne ikke opprette eksempel')
    } finally {
      setLoading(false)
    }
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
          <Heading as="h1" size="lg" className="mb-2">Nytt AI-eksempel</Heading>
          <Text variant="muted">Legg til et teksteksempel for AI-generering</Text>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Section Type */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-300">
              Seksjon *
            </label>
            <select
              required
              value={formData.section_type}
              onChange={(e) => setFormData({ ...formData, section_type: e.target.value })}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-zinc-600"
            >
              <option value="">Velg seksjon...</option>
              <option value="goal">Mål</option>
              <option value="concept">Konsept</option>
            </select>
          </div>

          {/* Project Type */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-300">
              Prosjekttype *
            </label>
            <select
              required
              value={formData.project_type}
              onChange={(e) => setFormData({ ...formData, project_type: e.target.value })}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-zinc-600"
            >
              <option value="">Velg type...</option>
              <option value="event">Event</option>
              <option value="branding">Branding</option>
              <option value="documentary">Dokumentarisk</option>
            </select>
          </div>

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

          {/* Info */}
          <Card className="bg-blue-500/5 border-blue-500/20">
            <Text variant="small" className="text-blue-300">
              💡 Tips: Skriv eksempler som er representative for ønsket tone og stil. AI-en vil bruke disse som mal når den genererer ny tekst.
            </Text>
          </Card>

          {/* Submit */}
          <div className="flex gap-4">
            <Button
              type="submit"
              disabled={loading}
              variant="primary"
              className="flex-1"
            >
              {loading ? 'Oppretter...' : 'Opprett Eksempel'}
            </Button>
            <Button
              type="button"
              onClick={() => router.push('/admin/ai-examples')}
              variant="secondary"
            >
              Avbryt
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

