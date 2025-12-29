'use client'

import { useRouter } from 'next/navigation'
import { CaseStudy } from '@/lib/types'
import { Button, Card, Heading, Text } from '@/components/ui'

interface CasePickerModalProps {
  isOpen: boolean
  onClose: () => void
  allCases: CaseStudy[]
  selectedCaseIds: string[]
  onToggleSelection: (caseId: string) => void
  onSave: () => void
}

export function CasePickerModal({
  isOpen,
  onClose,
  allCases,
  selectedCaseIds,
  onToggleSelection,
  onSave,
}: CasePickerModalProps) {
  const router = useRouter()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-8 z-50">
      <Card className="max-w-5xl w-full max-h-[80vh] overflow-y-auto">
        <div className="mb-6">
          <Heading as="h2" size="md" className="mb-2">Velg Case Studies (maks 4)</Heading>
          <Text variant="muted">Klikk for å velge/fjerne. Vises i "Tidligere arbeid"-seksjonen.</Text>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          {allCases.map((caseStudy) => {
            const isSelected = selectedCaseIds.includes(caseStudy.id)
            return (
              <div
                key={caseStudy.id}
                onClick={() => onToggleSelection(caseStudy.id)}
                className={`cursor-pointer rounded-lg overflow-hidden transition ${
                  isSelected 
                    ? 'ring-2 ring-green-500' 
                    : 'hover:ring-2 hover:ring-zinc-600'
                }`}
              >
                {/* Thumbnail */}
                <div className="aspect-video bg-zinc-800 flex items-center justify-center relative">
                  {caseStudy.thumbnail_path ? (
                    <img
                      src={caseStudy.thumbnail_path}
                      alt={caseStudy.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Text variant="muted">🎬</Text>
                  )}
                  {isSelected && (
                    <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
                      ✓ Valgt
                    </div>
                  )}
                </div>
                
                {/* Info */}
                <div className="bg-zinc-900 p-3">
                  <Heading as="h4" size="sm" className="text-sm mb-1">
                    {caseStudy.title}
                  </Heading>
                  <Text variant="small" className="line-clamp-2 text-xs">
                    {caseStudy.description}
                  </Text>
                </div>
              </div>
            )
          })}
        </div>

        {allCases.length === 0 && (
          <div className="text-center py-12">
            <Text variant="body" className="mb-4">
              Ingen case studies i biblioteket ennå
            </Text>
            <Button
              type="button"
              variant="primary"
              onClick={() => router.push('/admin/cases/new')}
            >
              Opprett første case
            </Button>
          </div>
        )}

        <div className="flex gap-4 pt-6 border-t border-zinc-800">
          <Button
            type="button"
            onClick={onClose}
            variant="secondary"
            className="flex-1"
          >
            Avbryt
          </Button>
          <Button
            type="button"
            onClick={onSave}
            variant="primary"
            className="flex-1"
            disabled={selectedCaseIds.length === 0}
          >
            Bruk valgte ({selectedCaseIds.length})
          </Button>
        </div>
      </Card>
    </div>
  )
}

