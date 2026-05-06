'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui'
import { TeamMember } from '@/lib/types'

const sectionLabel = (text: string) => (
  <span style={{
    fontFamily: 'var(--font-dm-sans)',
    fontSize: '0.6rem',
    letterSpacing: '0.16em',
    color: '#C49434',
    textTransform: 'uppercase' as const,
    fontWeight: 500,
  }}>
    {text}
  </span>
)

export default function TeamPage() {
  const [loading, setLoading] = useState(true)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    fetchTeamMembers()
  }, [])

  async function fetchTeamMembers() {
    const { data, error } = await supabase
      .from('team_members')
      .select('*')
      .order('order_index', { ascending: true })

    if (error) {
      console.error('Error fetching team members:', error)
    } else {
      setTeamMembers((data || []) as TeamMember[])
    }
    setLoading(false)
  }

  async function handleDelete(teamMemberId: string, teamMemberName: string) {
    if (!confirm(`Er du sikker på at du vil slette "${teamMemberName}"?\n\nDette kan ikke angres.`)) {
      return
    }
    setDeletingId(teamMemberId)
    setDeleteError(null)
    try {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('id', teamMemberId)

      if (error) throw error
      fetchTeamMembers()
    } catch (error) {
      console.error('Error deleting team member:', error)
      setDeleteError('Kunne ikke slette team-medlem. Prøv igjen.')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0C0B09' }}>
        <div className="flex items-center gap-3">
          <div style={{ width: 1, height: 24, background: '#C49434', opacity: 0.5 }} />
          <p style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.6rem',
            letterSpacing: '0.16em',
            color: '#62594E',
            textTransform: 'uppercase',
          }}>
            Laster...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8 md:p-12" style={{ background: '#0C0B09', color: '#E8E1D5' }}>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-6 mb-14">
          <div>
            <div className="flex items-center gap-4 mb-4">
              <div style={{ width: 32, height: 1, background: '#C49434' }} />
              {sectionLabel('Bibliotek')}
            </div>
            <h1 style={{
              fontFamily: 'var(--font-cormorant)',
              fontSize: 'clamp(2rem, 4vw, 3rem)',
              fontWeight: 300,
              fontStyle: 'italic',
              color: '#E8E1D5',
              lineHeight: 1,
            }}>
              Team
            </h1>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: '#62594E', marginTop: 8, letterSpacing: '0.06em' }}>
              {teamMembers.length} team-medlem{teamMembers.length !== 1 ? 'mer' : ''} · gjenbrukes i prosjekter
            </p>
          </div>
          <Link href="/admin/team/new">
            <Button variant="primary" size="sm">+ Nytt Medlem</Button>
          </Link>
        </div>

        {/* Error */}
        {deleteError && (
          <div
            className="mb-6 px-5 py-3 flex items-center justify-between"
            style={{ background: 'rgba(184,64,64,0.12)', border: '1px solid rgba(184,64,64,0.3)', borderRadius: 3 }}
          >
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: '#E07070' }}>{deleteError}</p>
            <button onClick={() => setDeleteError(null)} style={{ color: '#62594E', lineHeight: 0 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" d="M2 2l10 10M12 2L2 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Team Members Grid */}
        {teamMembers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {teamMembers.map((teamMember) => {
              const profileImageUrl = teamMember.profile_image_path
                ? supabase.storage.from('assets').getPublicUrl(teamMember.profile_image_path).data.publicUrl
                : null

              return (
                <div
                  key={teamMember.id}
                  style={{ background: '#161410', border: '1px solid #2A261F', borderRadius: 3, overflow: 'hidden' }}
                >
                  {/* Profile Image */}
                  <div className="aspect-square flex items-center justify-center" style={{ background: '#0E0D0B' }}>
                    {profileImageUrl ? (
                      <img
                        src={profileImageUrl}
                        alt={teamMember.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#38332A" strokeWidth="1">
                        <circle cx="24" cy="18" r="10" />
                        <path d="M4 44c0-11 9-18 20-18s20 7 20 18" />
                      </svg>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-5">
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', fontWeight: 500, color: '#E8E1D5', marginBottom: 2 }}>
                      {teamMember.name}
                    </p>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: '#C49434', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                      {teamMember.role}
                    </p>

                    {teamMember.bio && (
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: '#62594E', lineHeight: 1.5, marginBottom: 10, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {teamMember.bio}
                      </p>
                    )}

                    {/* Contact Info */}
                    {(teamMember.email || teamMember.phone) && (
                      <div className="mb-4 space-y-1">
                        {teamMember.email && (
                          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: '#62594E' }}>
                            {teamMember.email}
                          </p>
                        )}
                        {teamMember.phone && (
                          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: '#62594E' }}>
                            {teamMember.phone}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Tags */}
                    {teamMember.tags && teamMember.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {teamMember.tags.map((tag) => (
                          <span
                            key={tag}
                            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: '#62594E', letterSpacing: '0.06em', background: '#0E0D0B', padding: '2px 6px', borderRadius: 2 }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Link href={`/admin/team/${teamMember.id}/edit`} className="flex-1">
                        <Button variant="primary" size="sm" className="w-full">
                          Rediger
                        </Button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(teamMember.id, teamMember.name)}
                        disabled={deletingId === teamMember.id}
                        style={{ color: '#B84040' }}
                      >
                        {deletingId === teamMember.id ? '...' : 'Slett'}
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div
            className="p-12 text-center"
            style={{ background: '#161410', border: '1px solid #2A261F', borderRadius: 3 }}
          >
            <p style={{ color: '#62594E', fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', marginBottom: 8 }}>
              Ingen team-medlemmer ennå
            </p>
            <p style={{ color: '#38332A', fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', marginBottom: 20 }}>
              Legg til team-medlemmer her for å gjenbruke dem på tvers av prosjekter.
            </p>
            <Link href="/admin/team/new">
              <Button variant="primary">Legg til første team-medlem</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

