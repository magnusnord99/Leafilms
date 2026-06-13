'use client'

import { Section, TeamMember, Image } from '@/lib/types'
import { Button, Text } from '@/components/ui'
import { TeamMemberCard } from './TeamMemberCard'
import { ImageGallery } from '@/components/project'

type TeamSectionProps = {
  section: Section
  editMode: boolean
  language?: 'no' | 'en'
  allTeamMembers: TeamMember[]
  selectedTeamMemberIds: string[]
  sectionImages: Record<string, Image[]>
  getSectionTitle?: (type: string) => string
  updateSectionContent: (sectionId: string, key: string, value: unknown) => void
  onTeamPickerOpen: () => void
  onGalleryImageClick: () => void
}

export function TeamSection({
  section,
  editMode,
  language = 'no',
  allTeamMembers,
  selectedTeamMemberIds,
  sectionImages,
  getSectionTitle,
  updateSectionContent,
  onTeamPickerOpen,
  onGalleryImageClick
}: TeamSectionProps) {
  const selectedTeamMembers = allTeamMembers.filter(m => selectedTeamMemberIds.includes(m.id))
  const galleryImages = sectionImages[section.id] || []
  const teamMemberCardTranslations = section.content?.teamMemberCardTranslations || {}
  const teamMemberRolesEn = section.content?.teamMemberRolesEn || {}

  return (
    <div className="w-full" style={{ background: '#161410' }}>
      <div className="max-w-7xl mx-auto py-16 md:py-24 px-8 md:px-16">
        {/* Section header */}
        <div className="flex items-center gap-4 mb-8">
          <div style={{ width: 32, height: 1, background: '#C49434' }} />
          <span
            className={editMode ? 'edit-outline px-2 py-1 cursor-text' : ''}
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.78rem',
              letterSpacing: '0.16em',
              color: '#C49434',
              textTransform: 'uppercase',
              fontWeight: 500,
            }}
            contentEditable={editMode}
            suppressContentEditableWarning
            onBlur={(e) => {
              if (editMode) updateSectionContent(section.id, 'sectionLabel', e.currentTarget.textContent || '')
            }}
          >
            {section.content.sectionLabel || (getSectionTitle ? getSectionTitle(section.type) : 'Team')}
          </span>
        </div>

        {/* Description */}
        <p
          className={`max-w-xl mb-12 ${editMode ? 'edit-outline px-3 py-2' : ''}`}
          style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: 'clamp(1.75rem, 2.8vw, 2.5rem)',
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
          <div
            className="flex flex-wrap justify-center xl:justify-start"
            style={{ columnGap: '2.5rem', rowGap: '2.5rem' }}
          >
            {selectedTeamMembers.map((teamMember) => {
              const teamMemberRoles = section.content?.teamMemberRoles || {}
              const projectRole = teamMemberRoles[teamMember.id] || null
              const translatedCardContent = language === 'en' ? teamMemberCardTranslations[teamMember.id] : null
              const translatedProjectRole = language === 'en' ? teamMemberRolesEn[teamMember.id] || null : null
              const handleRoleChange = (role: string) => {
                const updatedRoles = { ...teamMemberRoles, [teamMember.id]: role }
                updateSectionContent(section.id, 'teamMemberRoles', updatedRoles)
              }
              return (
                <div
                  key={teamMember.id}
                  className="flex-none"
                  style={{ width: 240, height: 480 }}
                >
                  <TeamMemberCard
                    teamMember={teamMember}
                    editMode={editMode}
                    language={language}
                    projectRole={projectRole}
                    projectRoleEn={translatedProjectRole}
                    translatedRole={translatedCardContent?.role}
                    translatedBio={translatedCardContent?.bio}
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
