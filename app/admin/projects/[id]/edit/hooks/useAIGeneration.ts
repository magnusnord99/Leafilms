import { useState } from 'react'
import { Section } from '@/lib/types'

export function useAIGeneration(
  aiSettings: { projectType: string; medium: string; targetAudience: string },
  updateSectionContent: (sectionId: string, key: string, value: string | any) => void
) {
  const [generating, setGenerating] = useState<string | null>(null)

  const handleGenerateAI = async (sectionId: string, sectionType: string) => {
    if (!aiSettings.projectType || !aiSettings.medium || !aiSettings.targetAudience) {
      alert('⚠️ Vennligst velg prosjekttype, medium og målgruppe først')
      return
    }

    setGenerating(sectionId)
    try {
      const response = await fetch('/api/generate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectType: aiSettings.projectType,
          medium: aiSettings.medium,
          targetAudience: aiSettings.targetAudience,
          sectionType: sectionType
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate text')
      }
      
      const key = ['goal', 'concept', 'timeline', 'deliverables', 'contact'].includes(sectionType) ? 'text' : 'description'
      updateSectionContent(sectionId, key, data.text)

      // Tekst generert
    } catch (error) {
      console.error('Error generating text:', error)
      alert('❌ Kunne ikke generere tekst. Sjekk at OpenAI API-nøkkel er satt.')
    } finally {
      setGenerating(null)
    }
  }

  return {
    generating,
    handleGenerateAI
  }
}

