'use client'

import { useEffect } from 'react'
import { Section, TeamMember, Image } from '@/lib/types'
import { Button, Heading, Text } from '@/components/ui'
import { TeamMemberCard } from './TeamMemberCard'
import { ImageGallery } from './ImageGallery'

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
      <div className="bg-background-widget py-8 px-4 mb-20md:px-8">
        {/* TEAM tittel */}
        <Heading 
            as="h2" 
            size="2xl" 
            className="text-center mb-6 text-dark font-bold"
          >
            TEAM
          </Heading>
          <Text 
            variant="lead" 
            className="text-center text-dark max-w-2xl mx-auto"
          >
            {section.content.text || 'Leafilms har kompetansen til å gjennomføre prosjekter i alle størrelser. Med teknologi, kunnskap og lidenskap skaper vi engasjerende øyeblikk.'}
          </Text>
        {/* Mørkere blå-grå rektangel i midten */}
        <div className="max-w-6xl mx-auto mt-8 mb-34 bg-background-widget-medium p-12 md:p-16 shadow-lg">

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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-0">
              {selectedTeamMembers.map((teamMember) => (
                <TeamMemberCard
                  key={teamMember.id}
                  teamMember={teamMember}
                  editMode={editMode}
                />
              ))}
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
        <div className="max-w-6xl mx-auto mb-24 mt-12">
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