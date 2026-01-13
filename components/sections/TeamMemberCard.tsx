'use client'

import { useState, useEffect } from 'react'
import { TeamMember } from '@/lib/types'
import { Heading, Text, Textarea } from '@/components/ui'
import { supabase } from '@/lib/supabase'

type TeamMemberCardProps = {
  teamMember: TeamMember
  editMode: boolean
  projectRole?: string | null // Prosjekt-spesifikk rolle/beskrivelse
  onProjectRoleChange?: (role: string) => void // Callback for å oppdatere prosjekt-spesifikk rolle
}

export function TeamMemberCard({ teamMember, editMode, projectRole, onProjectRoleChange }: TeamMemberCardProps) {
  const [isFlipped, setIsFlipped] = useState(false)
  const [editedRole, setEditedRole] = useState(projectRole || '')

  // Oppdater editedRole når projectRole endres
  useEffect(() => {
    setEditedRole(projectRole || '')
  }, [projectRole])
  
  const profileImageUrl = teamMember.profile_image_path
    ? supabase.storage.from('assets').getPublicUrl(teamMember.profile_image_path).data.publicUrl
    : null

  return (
    <div
      className="relative w-full h-full min-h-[200px]"
      style={{ perspective: '1000px' }}
    >
      <div
        onClick={() => {
          if (!editMode) {
            setIsFlipped(!isFlipped)
          }
        }}
        className={`
          relative w-full h-full transition-all duration-700
          ${editMode ? 'cursor-default' : 'cursor-pointer hover:scale-105'}
        `}
        style={{
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
        }}
      >
        {/* Front side */}
        <div
          className={`absolute inset-0 w-full h-full bg-background-widget-red rounded-lg p-4 md:p-6 shadow-lg backface-hidden transition-shadow duration-300 overflow-hidden ${
            !editMode ? 'hover:shadow-xl' : ''
          }`}
          style={{ backfaceVisibility: 'hidden' }}
        >
          {/* 
            Grid layout: 2 rader x 2 kolonner
            - Øverste rad (2fr): Profilbilde (venstre) + Bio tekst (høyre)
            - Nederste rad (1fr): Navn/rolle (venstre) + E-post/telefon (høyre)
          */}
          <div 
            className="grid grid-cols-2 gap-4 h-full overflow-hidden"
            style={{ gridTemplateRows: '2fr 1fr' }}
          >
            {/* Celle 1: Øverste rad, venstre - Profilbilde */}
            <div className="flex items-center justify-center">
              <div className="w-full h-full max-w-[160px] max-h-[160px] bg-white rounded-lg overflow-hidden flex items-center justify-center">
                {profileImageUrl ? (
                  <img
                    src={profileImageUrl}
                    alt={teamMember.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-300 flex items-center justify-center">
                    <svg className="w-16 h-16 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
            </div>

            {/* Celle 2: Øverste rad, høyre - Bio tekst */}
            <div className="flex items-start overflow-hidden">
              {teamMember.bio && (
                <Text
                  variant="small"
                  className="text-dark break-words"
                  style={{ 
                    fontSize: '0.8rem', // 10px - mindre enn small (12px)
                    wordBreak: 'break-word',
                    overflowWrap: 'break-word'
                  }}
                >
                  {teamMember.bio}
                </Text>
              )}
            </div>

            {/* Celle 3: Nederste rad, venstre - Navn og rolle */}
            <div className="flex flex-col justify-start overflow-hidden">
              <Heading as="h1" size="sm" className="text-dark font-bold break-words">
                {teamMember.name}
              </Heading>
              <Text variant="small" className="text-dark break-words">
                {teamMember.role}
              </Text>
            </div>

            {/* Celle 4: Nederste rad, høyre - E-post og telefonnummer */}
            <div className="flex flex-col justify-start space-y-2 overflow-hidden">
              {teamMember.email && (
                <Text variant="small" className="text-dark break-all">
                  {teamMember.email}
                </Text>
              )}
              {teamMember.phone && (
                <Text variant="small" className="text-dark break-all">
                  {teamMember.phone}
                </Text>
              )}
            </div>
          </div>
        </div>

        {/* Back side */}
        <div
          className={`absolute inset-0 w-full h-full bg-background-widget-red-hover rounded-lg p-4 md:p-6 shadow-lg backface-hidden transition-shadow duration-300 overflow-hidden ${
            !editMode ? 'hover:shadow-xl' : ''
          }`}
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)'
          }}
        >
          <div className="flex flex-col items-center justify-center h-full text-center px-4 overflow-hidden">
            <Heading as="h4" className="text-dark font-bold mb-3 break-words">
              {teamMember.name}
            </Heading>
            <Text variant="small" className="text-dark mb-6 break-words">
              {teamMember.role}
            </Text>
            
            {/* Prosjekt-spesifikk rolle/beskrivelse */}
            {editMode ? (
              <Textarea
                value={editedRole}
                onChange={(e) => {
                  setEditedRole(e.target.value)
                  if (onProjectRoleChange) {
                    onProjectRoleChange(e.target.value)
                  }
                }}
                placeholder="Beskriv hva medlemmet skal gjøre i dette prosjektet..."
                className="w-full min-h-[120px] text-dark bg-white/50 border-dark/30 focus:bg-white focus:border-dark"
                rows={4}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <>
                {projectRole ? (
                  <Text
                    variant="small"
                    className="text-dark break-words"
                    style={{ 
                      wordBreak: 'break-word',
                      overflowWrap: 'break-word'
                    }}
                  >
                    {projectRole}
                  </Text>
                ) : (
                  <Text variant="small" className="text-dark/70 italic">
                    Ingen prosjekt-spesifikk rolle definert
                  </Text>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
