'use client'

import { useEffect } from 'react'
import { Section, TeamMember, Image } from '@/lib/types'
import { Button, Text } from '@/components/ui'
import { TeamMemberCard } from './TeamMemberCard'
import { ImageGallery } from '@/components/project'

type TeamSectionProps = {
  section: Section
  editMode: boolean
  allTeamMembers: TeamMember[]
  selectedTeamMemberIds: string[]
  sectionImages: Record<string, Image[]>
  updateSectionContent: (sectionId: string, key: string, value: string | any) => void
  onTeamPickerOpen: () => void
  onGalleryImageClick: () => void
}

export function TeamSection({
  section,
  editMode,
  allTeamMembers,
  selectedTeamMemberIds,
  sectionImages,
  updateSectionContent,
  onTeamPickerOpen,
  onGalleryImageClick
}: TeamSectionProps) {
  const selectedTeamMembers = allTeamMembers.filter(m => selectedTeamMemberIds.includes(m.id))
  const galleryImages = sectionImages[section.id] || []

  useEffect(() => {
    // Debug log removed from production render
  }, [section.id, sectionImages, galleryImages])

  return (
    <div className="w-full" style={{ background: '#161410' }}>
      <div className="py-16 md:py-24 px-8 md:px-16">
        {/* Section header */}
        <div className="flex items-center gap-4 mb-8">
          <div style={{ width: 32, height: 1, background: '#C49434' }} />
          <span style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.6rem',
            letterSpacing: '0.16em',
            color: '#C49434',
            textTransform: 'uppercase',
            fontWeight: 500,
          }}>
            Team
          </span>
        </div>

        {/* Description */}
        <p
          className={`max-w-xl mb-12 ${editMode ? 'edit-outline px-3 py-2' : ''}`}
          style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: 'clamp(1.4rem, 2.5vw, 2rem)',
            fontWeight: 300,
            fontStyle: 'italic',
            color: '#E8E1D5',
            lineHeight: 1.4,
          }}
          contentEditable={editMode}
          suppressContentEditableWarning
          onBlur={(e) => {
            if (editMode) updateSectionContent(section.id, 'text', e.currentTarget.textContent || '')
          }}
        >
          {section.content.text || 'Leafilms har kompetansen til å gjennomføre prosjekter i alle størrelser.'}
        </p>

        {/* Edit button */}
        {editMode && (
          <div className="mb-8">
            <Button type="button" variant="secondary" onClick={onTeamPickerOpen} size="sm">
              {selectedTeamMemberIds.length > 0 ? `Endre team (${selectedTeamMemberIds.length})` : 'Velg team-medlemmer'}
            </Button>
          </div>
        )}

        {/* Team grid */}
        {selectedTeamMembers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {selectedTeamMembers.map((teamMember) => {
              const teamMemberRoles = section.content?.teamMemberRoles || {}
              const projectRole = teamMemberRoles[teamMember.id] || null
              const handleRoleChange = (role: string) => {
                const updatedRoles = { ...teamMemberRoles, [teamMember.id]: role }
                updateSectionContent(section.id, 'teamMemberRoles', updatedRoles)
              }
              return (
                <div key={teamMember.id} className="min-h-[280px]">
                  <TeamMemberCard
                    teamMember={teamMember}
                    editMode={editMode}
                    projectRole={projectRole}
                    onProjectRoleChange={handleRoleChange}
                  />
                </div>
              )
            })}
          </div>
        ) : (
          <div className="py-12 flex items-center gap-4">
            <div style={{ width: 40, height: 1, background: '#2A261F' }} />
            <Text variant="muted">
              {editMode ? 'Klikk "Velg team-medlemmer" for å legge til' : 'Ingen team-medlemmer valgt'}
            </Text>
          </div>
        )}

        {/* Gallery */}
        {(galleryImages.length > 0 || editMode) && (
          <div className="mt-14">
            <ImageGallery
              images={galleryImages}
              editMode={editMode}
              onImageClick={onGalleryImageClick}
            />
          </div>
        )}
      </div>
    </div>
  )
}
