'use client'

import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { TeamMember } from '@/lib/types'
import { Button, Card, Heading, Text } from '@/components/ui'

interface TeamPickerModalProps {
  isOpen: boolean
  onClose: () => void
  allTeamMembers: TeamMember[]
  selectedTeamMemberIds: string[]
  onToggleSelection: (teamMemberId: string) => void
  onSave: () => void
}

export function TeamPickerModal({
  isOpen,
  onClose,
  allTeamMembers,
  selectedTeamMemberIds,
  onToggleSelection,
  onSave,
}: TeamPickerModalProps) {
  const router = useRouter()

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-2 sm:p-6 md:p-8 z-50">
      <Card className="max-w-5xl w-full max-h-[95vh] sm:max-h-[80vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <Heading as="h2" size="md" className="mb-2">Velg Team-medlemmer</Heading>
            <Text variant="muted">Klikk for å velge/fjerne. Vises i "Team"-seksjonen.</Text>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk"
            style={{ color: '#62594E', lineHeight: 0, flexShrink: 0, marginLeft: 16 }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" d="M2 2l12 12M14 2L2 14" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {allTeamMembers.map((teamMember) => {
            const isSelected = selectedTeamMemberIds.includes(teamMember.id)
            const profileImageUrl = teamMember.profile_image_path
              ? supabase.storage.from('assets').getPublicUrl(teamMember.profile_image_path).data.publicUrl
              : null
            
            return (
              <div
                key={teamMember.id}
                onClick={() => onToggleSelection(teamMember.id)}
                className={`cursor-pointer rounded-lg overflow-hidden transition ${
                  isSelected 
                    ? 'ring-2 ring-green-500' 
                    : 'hover:ring-2 hover:ring-zinc-600'
                }`}
              >
                <div className="bg-zinc-900 p-4 flex items-center gap-4">
                  {/* Profile Image */}
                  <div className="flex-shrink-0">
                    <div className="w-16 h-16 rounded-full bg-zinc-800 overflow-hidden flex items-center justify-center">
                      {profileImageUrl ? (
                        <img
                          src={profileImageUrl}
                          alt={teamMember.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Text variant="muted" className="text-2xl">👤</Text>
                      )}
                    </div>
                  </div>
                  
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <Heading as="h4" size="sm" className="mb-1">
                      {teamMember.name}
                    </Heading>
                    <Text variant="small" className="text-gray-400">
                      {teamMember.role}
                    </Text>
                    {teamMember.bio && (
                      <Text variant="small" className="line-clamp-2 text-xs mt-1 text-gray-500">
                        {teamMember.bio}
                      </Text>
                    )}
                  </div>

                  {isSelected && (
                    <div className="flex-shrink-0 bg-green-500 text-white text-xs px-2 py-1 rounded">
                      ✓
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {allTeamMembers.length === 0 && (
          <div className="text-center py-12">
            <Text variant="body" className="mb-4">
              Ingen team-medlemmer i biblioteket ennå
            </Text>
            <Button
              type="button"
              variant="primary"
              onClick={() => router.push('/admin/team/new')}
            >
              Opprett første team-medlem
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
            disabled={selectedTeamMemberIds.length === 0}
          >
            Bruk valgte ({selectedTeamMemberIds.length})
          </Button>
        </div>
      </Card>
    </div>
  )
}

