'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-client'
import { TeamMember } from '@/lib/types'

const C = {
  bg:      '#181920',
  surface: '#21212D',
  surface2:'#2A2A38',
  border:  '#3C3C52',
  text:    '#EEEEF2',
  text2:   '#B4B4CC',
  text3:   '#8484A0',
  accent:  '#7C5CFC',
  danger:  '#E05555',
}

export default function TeamPage() {
  const [loading, setLoading] = useState(true)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function fetchTeamMembers() {
    const supabase = createClient()
    const { data, error } = await supabase.from('team_members').select('*').order('order_index', { ascending: true })
    if (!error) setTeamMembers((data || []) as TeamMember[])
    setLoading(false)
  }

  useEffect(() => { fetchTeamMembers() }, [])

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Slett "${name}"? Dette kan ikke angres.`)) return
    setDeletingId(id)
    setDeleteError(null)
    const supabase = createClient()
    const { error } = await supabase.from('team_members').delete().eq('id', id)
    if (error) {
      setDeleteError('Kunne ikke slette team-medlem.')
    } else {
      fetchTeamMembers()
    }
    setDeletingId(null)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>Laster...</p>
      </div>
    )
  }

  // Hent public URL for profilbilde
  function getImageUrl(path: string | null | undefined): string | null {
    if (!path) return null
    const supabase = createClient()
    return supabase.storage.from('assets').getPublicUrl(path).data.publicUrl
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 28 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.4rem', fontWeight: 700, color: C.text, lineHeight: 1.2 }}>
              Team
            </h1>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, marginTop: 4 }}>
              {teamMembers.length} team-medlem{teamMembers.length !== 1 ? 'mer' : ''} · gjenbrukes i prosjekter
            </p>
          </div>
          <Link href="/admin/team/new">
            <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, padding: '8px 16px', borderRadius: 8, cursor: 'pointer', background: C.accent, color: '#fff', border: 'none' }}>
              + Nytt medlem
            </button>
          </Link>
        </div>

        {/* Feilmelding */}
        {deleteError && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', marginBottom: 16, background: 'rgba(224,85,85,0.08)', border: `1px solid rgba(224,85,85,0.25)`, borderRadius: 8 }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.danger }}>{deleteError}</p>
            <button onClick={() => setDeleteError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3 }}>✕</button>
          </div>
        )}

        {/* Grid */}
        {teamMembers.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
            {teamMembers.map(member => {
              const imgUrl = getImageUrl(member.profile_image_path)
              return (
                <div key={member.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
                  {/* Profilbilde */}
                  <div style={{ aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.surface2 }}>
                    {imgUrl ? (
                      <img src={imgUrl} alt={member.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <svg width="52" height="52" viewBox="0 0 52 52" fill="none" stroke={C.border} strokeWidth="1.2">
                        <circle cx="26" cy="20" r="10" />
                        <path d="M6 46c0-11 9-18 20-18s20 7 20 18" />
                      </svg>
                    )}
                  </div>

                  {/* Innhold */}
                  <div style={{ padding: '16px 18px' }}>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.88rem', fontWeight: 600, color: C.text, marginBottom: 2 }}>
                      {member.name}
                    </p>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.accent, marginBottom: 10 }}>
                      {member.role}
                    </p>

                    {member.bio && (
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text2, lineHeight: 1.5, marginBottom: 10, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {member.bio}
                      </p>
                    )}

                    {(member.email || member.phone) && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 12 }}>
                        {member.email && <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>{member.email}</span>}
                        {member.phone && <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>{member.phone}</span>}
                      </div>
                    )}

                    {member.tags && member.tags.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 14 }}>
                        {member.tags.map(tag => (
                          <span key={tag} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3, background: C.surface2, border: `1px solid ${C.border}`, padding: '2px 8px', borderRadius: 4 }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8 }}>
                      <Link href={`/admin/team/${member.id}/edit`} style={{ flex: 1 }}>
                        <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, padding: '7px 0', width: '100%', borderRadius: 7, cursor: 'pointer', background: C.accent, color: '#fff', border: 'none' }}>
                          Rediger
                        </button>
                      </Link>
                      <button
                        onClick={() => handleDelete(member.id, member.name)}
                        disabled={deletingId === member.id}
                        style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500, padding: '7px 14px', borderRadius: 7, cursor: deletingId === member.id ? 'default' : 'pointer', background: 'transparent', color: C.danger, border: `1px solid rgba(224,85,85,0.25)`, opacity: deletingId === member.id ? 0.5 : 1 }}
                      >
                        {deletingId === member.id ? '...' : 'Slett'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '56px 24px', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: C.text3, marginBottom: 6 }}>Ingen team-medlemmer ennå</p>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, marginBottom: 20 }}>Legg til team-medlemmer for å gjenbruke dem på tvers av prosjekter.</p>
            <Link href="/admin/team/new">
              <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, padding: '9px 20px', borderRadius: 8, cursor: 'pointer', background: C.accent, color: '#fff', border: 'none' }}>
                Legg til første team-medlem
              </button>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
