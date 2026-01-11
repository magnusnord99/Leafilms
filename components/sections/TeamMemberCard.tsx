'use client'

import { useState } from 'react'
import { TeamMember } from '@/lib/types'
import { Heading, Text } from '@/components/ui'
import { supabase } from '@/lib/supabase'

type TeamMemberCardProps = {
  teamMember: TeamMember
  editMode: boolean
  projectRole?: string | null // Prosjekt-spesifikk rolle/beskrivelse
}

export function TeamMemberCard({ teamMember, editMode, projectRole }: TeamMemberCardProps) {
  const [isFlipped, setIsFlipped] = useState(false)
  
  const profileImageUrl = teamMember.profile_image_path
    ? supabase.storage.from('assets').getPublicUrl(teamMember.profile_image_path).data.publicUrl
    : null

  return (
    <div
      className="relative w-full h-full"
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
          className={`absolute inset-0 w-full h-full bg-background-widget-red rounded-lg p-4 md:p-6 shadow-lg backface-hidden transition-shadow duration-300 ${
            !editMode ? 'hover:shadow-xl' : ''
          }`}
          style={{ backfaceVisibility: 'hidden' }}
        >
          {/* Ekspandert layout: Profilbilde + navn til venstre, bio til høyre */}
          <div className="flex flex-col md:flex-row items-start gap-4">
            {/* Venstre side: Profilbilde + Navn */}
            <div className="flex-shrink-0 w-full md:w-auto">
              {/* Profile Image - Hvit firkant med grå silhuett */}
              <div className="mb-3">
                <div className="w-40 h-40 bg-white rounded-lg overflow-hidden flex items-center justify-center mx-auto md:mx-0">
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
              {/* Name - Stor, fet hvit tekst */}
              <Heading as="h4" size="md" className="text-dark font-bold">
                {teamMember.name}
              </Heading>
              {/* Role - Mindre, vanlig hvit tekst */}
              <Text variant="small" className="text-dark">
                {teamMember.role}
              </Text>
            </div>

            {/* Høyre side: Bio tekst og kontaktinfo */}
            <div className="flex-1 w-full md:w-auto">
              {teamMember.bio && (
                <Text
                  variant="small"
                  className="text-dark whitespace-pre-wrap mb-3"
                >
                  {teamMember.bio}
                </Text>
              )}
              {/* Contact info på forsiden */}
              {(teamMember.email || teamMember.phone) && (
                <div className="space-y-2">
                  {teamMember.email && (
                    <Text variant="small" className="text-dark">
                      {teamMember.email}
                    </Text>
                  )}
                  {teamMember.phone && (
                    <Text variant="small" className="text-dark">
                      {teamMember.phone}
                    </Text>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Back side */}
        <div
          className={`absolute inset-0 w-full h-full bg-background-widget-red-hover rounded-lg p-4 md:p-6 shadow-lg backface-hidden transition-shadow duration-300 ${
            !editMode ? 'hover:shadow-xl' : ''
          }`}
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)'
          }}
        >
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <Heading as="h4" size="md" className="text-dark font-bold mb-3">
              {teamMember.name}
            </Heading>
            <Text variant="small" className="text-dark mb-6">
              {teamMember.role}
            </Text>
            
            {/* Prosjekt-spesifikk rolle/beskrivelse */}
            {projectRole ? (
              <Text
                variant="small"
                className="text-dark whitespace-pre-wrap"
              >
                {projectRole}
              </Text>
            ) : (
              <Text variant="small" className="text-dark/70 italic">
                Ingen prosjekt-spesifikk rolle definert
              </Text>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
