'use client'

import { useState } from 'react'
import { TeamMember } from '@/lib/types'
import { Heading, Text } from '@/components/ui'
import { supabase } from '@/lib/supabase'

type TeamMemberCardProps = {
  teamMember: TeamMember
  editMode: boolean
}

export function TeamMemberCard({ teamMember, editMode }: TeamMemberCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  const profileImageUrl = teamMember.profile_image_path
    ? supabase.storage.from('assets').getPublicUrl(teamMember.profile_image_path).data.publicUrl
    : null

  return (
    <div
      onClick={() => {
        if (!editMode) {
          setIsExpanded(!isExpanded)
        }
      }}
      className={`
        bg-background-widget-dark
        rounded-lg
        transition-all duration-700 ease-in-out
        ${isExpanded ? 'p-4 max-w-[200px] md:max-w-[350px] mx-auto' : 'p-4 max-w-[200px] mx-auto'}
        ${editMode ? 'cursor-default' : 'cursor-pointer hover:bg-[#4a4949] hover:scale-105'}
        overflow-hidden
        shadow-lg
        ${!editMode ? 'hover:shadow-xl' : ''}
      `}
    >
      <div className="transition-opacity duration-500">
        {isExpanded ? (
          // Ekspandert layout: Profilbilde + navn til venstre, bio til høyre
          <div className="flex flex-col md:flex-row items-start gap-4">
          {/* Venstre side: Profilbilde + Navn */}
          <div className="flex-shrink-0 w-full md:w-auto">
            {/* Profile Image - Hvit firkant med grå silhuett */}
            <div className="mb-4">
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
            <Heading as="h4" size="md" className="text-white font-bold">
              {teamMember.name}
            </Heading>
            {/* Role - Mindre, vanlig hvit tekst */}
            <Text variant="small" className="text-white/90">
              {teamMember.role}
            </Text>
          </div>

          {/* Høyre side: Bio tekst */}
          <div className="flex-1 w-full md:w-auto">
            {teamMember.bio && (
              <Text
                variant="body"
                className="text-white/90 whitespace-pre-wrap"
              >
                {teamMember.bio}
              </Text>
            )}
            {/* Contact info */}
            {(teamMember.email || teamMember.phone) && (
              <div className="mt-4 pt-4 space-y-1">
                {teamMember.email && (
                  <Text variant="small" className="text-white/70">
                    {teamMember.email}
                  </Text>
                )}
                {teamMember.phone && (
                  <Text variant="small" className="text-white/70">
                    {teamMember.phone}
                  </Text>
                )}
              </div>
            )}
          </div>
        </div>
        ) : (
          // Komprimert layout: Sentrert profilbilde, navn og rolle
          <div className="flex flex-col items-left text-left min-w-[200px]">
          {/* Profile Image - Hvit firkant med grå silhuett */}
          <div className="mb-4">
            <div className="w-40 h-40 bg-white rounded-lg overflow-hidden flex items-center justify-center">
              {profileImageUrl ? (
                <img
                  src={profileImageUrl}
                  alt={teamMember.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gray-300 flex items-center justify-center">
                  <svg className="w-10 h-10 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>
          </div>

          {/* Name - Stor, fet hvit tekst */}
          <Heading as="h4" size="sm" className="mb-0 text-white font-bold">
            {teamMember.name}
          </Heading>

          {/* Role - Mindre, vanlig hvit tekst */}
          <Text variant="small" className="text-white/90">
            {teamMember.role}
          </Text>
          
          {/* Expand icon - vis kun på mobil og når ikke i edit mode */}
          {!editMode && (
            <div className="mt-4 flex justify-center items-center md:hidden">
              <svg 
                className={`w-6 h-6 text-white/70 transition-transform duration-300 mx-auto ${isExpanded ? 'rotate-180' : ''}`}
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  )
}
