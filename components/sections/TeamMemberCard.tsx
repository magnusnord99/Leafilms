'use client'

import { useState, useCallback } from 'react'
import { TeamMember } from '@/lib/types'
import { PROJECT_ROLES, ROLE_ACTIONS, ROLE_ACTIONS_EN } from '@/lib/constants'
import { supabase } from '@/lib/supabase'

type TeamMemberCardProps = {
  teamMember: TeamMember
  editMode: boolean
  language?: 'no' | 'en'
  projectRole?: string | null // Prosjekt-spesifikk rolle/beskrivelse
  projectRoleEn?: string | null
  translatedRole?: string | null
  translatedBio?: string | null
  onProjectRoleChange?: (role: string) => void // Callback for å oppdatere prosjekt-spesifikk rolle
}

/** Parser lagret prosjekt-rolle til valgte roller + eventuell egentekst */
function parseProjectRole(text: string | null | undefined): { selected: Set<string>; custom: string } {
  const str = typeof text === 'string' ? text : ''
  if (!str.trim()) return { selected: new Set(), custom: '' }
  const parts = str.split(/[,;/]/).map((p) => p.trim()).filter(Boolean)
  const selected = new Set<string>()
  const customParts: string[] = []
  for (const part of parts) {
    if ((PROJECT_ROLES as readonly string[]).includes(part)) {
      selected.add(part)
    } else {
      customParts.push(part)
    }
  }
  return { selected, custom: customParts.join(', ') }
}

/** Lager lagringsformat fra valgte roller og egentekst (kommaseparert, for parsing) */
function buildRoleText(selected: Set<string>, custom: string): string {
  const roleList = PROJECT_ROLES.filter((r) => selected.has(r))
  const parts: string[] = [...roleList]
  if (custom.trim()) parts.push(custom.trim())
  return parts.join(', ')
}

/** Lager beskrivende setning til visning (forteller hva personen skal gjøre) */
function buildRoleDescription(selected: Set<string>, custom: string, memberName: string, language: 'no' | 'en' = 'no'): string {
  const actionMap = language === 'en' ? ROLE_ACTIONS_EN : ROLE_ACTIONS
  const actions = PROJECT_ROLES
    .filter((r) => selected.has(r))
    .map((r) => actionMap[r] || r.toLowerCase())
  const customTrimmed = custom.trim()

  if (actions.length === 0 && !customTrimmed) return ''
  const firstName = memberName.split(' ')[0] || memberName

  if (actions.length === 0) {
    return customTrimmed
  }

  const actionsFormatted = language === 'en'
    ? actions.length === 1
      ? actions[0]
      : actions.length === 2
        ? `${actions[0]} and ${actions[1]}`
        : `${actions.slice(0, -1).join(', ')} and ${actions[actions.length - 1]}`
    : actions.length === 1
      ? actions[0]
      : actions.length === 2
        ? `${actions[0]} og ${actions[1]}`
        : `${actions.slice(0, -1).join(', ')} og ${actions[actions.length - 1]}`

  const base = language === 'en'
    ? `In this project, ${firstName} will handle ${actionsFormatted}.`
    : `I dette prosjektet vil ${firstName} stå for ${actionsFormatted}.`

  return customTrimmed ? `${base} ${customTrimmed}` : base
}

export function TeamMemberCard({
  teamMember,
  editMode,
  language = 'no',
  projectRole,
  projectRoleEn,
  translatedRole,
  translatedBio,
  onProjectRoleChange,
}: TeamMemberCardProps) {
  const [isFlipped, setIsFlipped] = useState(false)
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(
    () => parseProjectRole(projectRole || '').selected
  )
  const [customRole, setCustomRole] = useState(
    () => parseProjectRole(projectRole || '').custom
  )

  // Synk state når projectRole endres utenfra (state-justering under render, jf. react.dev)
  const [prevProjectRole, setPrevProjectRole] = useState(projectRole || '')
  if (prevProjectRole !== (projectRole || '')) {
    setPrevProjectRole(projectRole || '')
    const { selected, custom } = parseProjectRole(projectRole || '')
    setSelectedRoles(selected)
    setCustomRole(custom)
  }

  const syncRoleToParent = useCallback(
    (selected: Set<string>, custom: string) => {
      const text = buildRoleText(selected, custom)
      onProjectRoleChange?.(text)
    },
    [onProjectRoleChange]
  )

  const toggleRole = (role: string) => {
    const next = new Set(selectedRoles)
    if (next.has(role)) next.delete(role)
    else next.add(role)
    setSelectedRoles(next)
    syncRoleToParent(next, customRole)
  }

  const handleCustomChange = (value: string) => {
    setCustomRole(value)
    syncRoleToParent(selectedRoles, value)
  }
  
  const profileImageUrl = teamMember.profile_image_path
    ? supabase.storage.from('assets').getPublicUrl(teamMember.profile_image_path).data.publicUrl
    : null
  const displayRole = language === 'en' && translatedRole ? translatedRole : teamMember.role
  const displayBio = language === 'en' && translatedBio ? translatedBio : teamMember.bio

  return (
    <div
      className="group relative w-full h-full"
      style={{ perspective: '1200px' }}
    >
      <div
        onClick={() => {
          if (!editMode) {
            setIsFlipped(!isFlipped)
          }
        }}
        className={`
          relative w-full h-full transition-all duration-700
          ${editMode ? 'cursor-default' : 'cursor-pointer'}
        `}
        style={{
          transformStyle: 'preserve-3d',
          transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
        }}
      >
        {/* Front side */}
        <div
          className={`absolute inset-0 w-full h-full overflow-hidden backface-hidden transition-all duration-300 ${
            !editMode ? 'group-hover:border-[#38332A]' : ''
          }`}
          style={{
            backfaceVisibility: 'hidden',
            background: '#161410',
            border: '1px solid #2A261F',
          }}
        >
          {/* Profile image — prioritize portrait framing */}
          <div className="w-full overflow-hidden" style={{ height: '60%', background: '#0C0B09' }}>
            {profileImageUrl ? (
              <img
                src={profileImageUrl}
                alt={teamMember.name}
                className="w-full h-full object-cover object-top"
                style={{ filter: 'brightness(0.92) saturate(0.85)' }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center" style={{ background: '#1A1713' }}>
                <svg className="w-16 h-16" style={{ color: '#38332A' }} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </div>

          {/* Info — bottom section */}
          <div className="px-4 py-3 flex flex-col justify-start overflow-hidden" style={{ height: '40%' }}>
            <div>
              <p style={{
                fontFamily: 'var(--font-cormorant)',
                fontSize: 'clamp(1.1rem, 1.4vw, 1.3rem)',
                fontWeight: 400,
                fontStyle: 'italic',
                color: '#E8E1D5',
                lineHeight: 1.2,
                marginBottom: '0.25rem',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {teamMember.name}
              </p>
              <p style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.72rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: '#C49434',
                fontWeight: 500,
              }}>
                {displayRole}
              </p>
            </div>
            {displayBio && (
              <p style={{
                marginTop: '0.75rem',
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.78rem',
                color: '#9E9287',
                lineHeight: 1.5,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
              } as React.CSSProperties}>
                {displayBio}
              </p>
            )}
          </div>

          {/* Flip hint */}
          {!editMode && (
            <div
              className="absolute bottom-3 right-4"
              style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.6rem',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#38332A',
              }}
            >
              {language === 'en' ? 'Tap' : 'Trykk'}
            </div>
          )}
        </div>

        {/* Back side */}
        <div
          className="absolute inset-0 w-full h-full overflow-hidden backface-hidden"
          style={{
            backfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            background: '#201D18',
            border: '1px solid #38332A',
            borderTop: '2px solid #C49434',
          }}
        >
          <div className="flex flex-col h-full px-5 py-6 overflow-hidden">
            <div className="mb-4">
              <p style={{
                fontFamily: 'var(--font-cormorant)',
                fontSize: 'clamp(1.1rem, 1.4vw, 1.3rem)',
                fontWeight: 400,
                fontStyle: 'italic',
                color: '#E8E1D5',
                lineHeight: 1.2,
                marginBottom: '0.25rem',
              }}>
                {teamMember.name}
              </p>
              <p style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.7rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: '#C49434',
                fontWeight: 500,
              }}>
                {displayRole}
              </p>
            </div>

            <div style={{ flex: 1, overflow: 'hidden' }}>
              {/* Prosjekt-spesifikk rolle: checkbokser + valgfri egentekst */}
              {editMode ? (
                <div
                  className="w-full overflow-y-auto max-h-full space-y-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#62594E', marginBottom: 8 }}>
                    Velg roller for dette prosjektet:
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {PROJECT_ROLES.map((role) => (
                      <label
                        key={role}
                        className="flex items-center gap-2 cursor-pointer"
                        style={{ color: '#9E9287' }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedRoles.has(role)}
                          onChange={() => toggleRole(role)}
                          className="w-3 h-3"
                          style={{ accentColor: '#C49434' }}
                        />
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem' }}>
                          {role}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="pt-2">
                    <input
                      type="text"
                      value={customRole}
                      onChange={(e) => handleCustomChange(e.target.value)}
                      placeholder="Annet (valgfritt)"
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        fontFamily: 'var(--font-dm-sans)',
                        fontSize: '0.78rem',
                        color: '#E8E1D5',
                        background: '#161410',
                        border: '1px solid #38332A',
                        borderRadius: 2,
                        outline: 'none',
                      }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  {(() => {
                    if (language === 'en' && projectRoleEn?.trim()) {
                      return (
                        <p style={{
                          fontFamily: 'var(--font-dm-sans)',
                          fontSize: '0.82rem',
                          color: '#9E9287',
                          lineHeight: 1.65,
                          wordBreak: 'break-word',
                          overflowWrap: 'break-word',
                        }}>
                          {projectRoleEn}
                        </p>
                      )
                    }
                    const { selected, custom } = parseProjectRole(projectRole)
                    const description = buildRoleDescription(selected, custom, teamMember.name, language)
                    return description ? (
                      <p style={{
                        fontFamily: 'var(--font-dm-sans)',
                        fontSize: '0.82rem',
                        color: '#9E9287',
                        lineHeight: 1.65,
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word',
                      }}>
                        {description}
                      </p>
                    ) : (
                      <p style={{
                        fontFamily: 'var(--font-dm-sans)',
                        fontSize: '0.78rem',
                        color: '#38332A',
                        fontStyle: 'italic',
                      }}>
                        {language === 'en' ? 'No project-specific role defined' : 'Ingen prosjekt-spesifikk rolle definert'}
                      </p>
                    )
                  })()}
                </>
              )}
            </div>

            {/* Contact info at bottom */}
            {(teamMember.email || teamMember.phone) && (
              <div style={{ borderTop: '1px solid #2A261F', paddingTop: '0.75rem', marginTop: '0.75rem' }}>
                {teamMember.email && (
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: '#62594E', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {teamMember.email}
                  </p>
                )}
                {teamMember.phone && (
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: '#62594E' }}>
                    {teamMember.phone}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
