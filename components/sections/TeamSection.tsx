'use client'

import { useEffect } from 'react'
import { Section, TeamMember, Image } from '@/lib/types'
import { Button, Heading, Text } from '@/components/ui'
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
  
  // Log for debugging
  useEffect(() => {
    console.log(`[TeamSection] Section ${section.id} (${section.type}):`, {
      sectionImagesCount: Object.keys(sectionImages).length,
      hasSectionImages: !!sectionImages[section.id],
      galleryImagesCount: galleryImages.length,
      galleryImageIds: galleryImages.map(img => img.id).join(', ')
    })
  }, [section.id, sectionImages, galleryImages])

  return (
    <div className="w-full">
      {/* Lys blå-grå bakgrunn */}
      <div className="bg-background-widget py-6 px-4 md:px-8">
        {/* TEAM tittel */}
        <Heading 
            as="h2" 
            size="2xl" 
            className="text-center mb-4 text-dark font-bold"
          >
            TEAM
          </Heading>
          <Text 
            variant="lead" 
            className="text-center text-dark max-w-2xl mx-auto mb-6"
          >
            {section.content.text || 'Leafilms har kompetansen til å gjennomføre prosjekter i alle størrelser. Med teknologi, kunnskap og lidenskap skaper vi engasjerende øyeblikk.'}
          </Text>
        {/* Mørkere blå-grå rektangel i midten */}
        <div className="max-w-3xl mx-auto p-4 md:p-6 ">

          {/* Edit button */}
          {editMode && (
            <div className="mb-6 text-center">
              <Button
                type="button"
                variant="secondary"
                onClick={onTeamPickerOpen}
                size="sm"
              >
                {selectedTeamMemberIds.length > 0 ? `Endre team (${selectedTeamMemberIds.length})` : 'Velg team-medlemmer'}
              </Button>
            </div>
          )}

          {/* 2x2 Grid med team-medlemmer */}
          {selectedTeamMembers.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {selectedTeamMembers.map((teamMember) => {
                  // Hent prosjekt-spesifikk rolle fra section.content
                  const teamMemberRoles = section.content?.teamMemberRoles || {}
                  const projectRole = teamMemberRoles[teamMember.id] || null
                  
                  return (
                    <div key={teamMember.id} className="min-h-[300px]">
                      <TeamMemberCard
                        teamMember={teamMember}
                        editMode={editMode}
                        projectRole={projectRole}
                      />
                    </div>
                  )
                })}
            </div>
          ) : (
            <div className="text-center py-12">
              <Text variant="body" className="text-dark/70">
                {editMode ? 'Klikk på "Velg team-medlemmer" for å legge til team-medlemmer' : 'Ingen team-medlemmer valgt'}
              </Text>
            </div>
          )}

          
        </div>
        {/* Bildegalleri */}
        <div className="max-w-6xl mx-auto mb-12 mt-8">
          <ImageGallery 
              images={galleryImages}
              editMode={editMode}
              onImageClick={onGalleryImageClick}
          />
        </div>
    </div>
  </div>
)
}