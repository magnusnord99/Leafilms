'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button, Card, Heading, Text } from '@/components/ui'
import { TeamMember } from '@/lib/types'

export default function TeamPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])

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

    try {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('id', teamMemberId)

      if (error) throw error

      // Team-medlem slettet
      fetchTeamMembers()
    } catch (error) {
      console.error('Error deleting team member:', error)
      alert('❌ Kunne ikke slette team-medlem')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Text variant="body">Laster...</Text>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <Button
            variant="ghost"
            onClick={() => router.push('/admin')}
            className="mb-4 -ml-2"
          >
            ← Tilbake til admin
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <Heading as="h1" size="lg" className="mb-2">Team-medlemmer</Heading>
              <Text variant="muted">Administrer team-medlemmer for gjenbruk i prosjekter</Text>
            </div>
            <Link href="/admin/team/new">
              <Button variant="primary">+ Nytt Team-medlem</Button>
            </Link>
          </div>
        </div>

        {/* Team Members Grid */}
        {teamMembers && teamMembers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teamMembers.map((teamMember) => {
              const profileImageUrl = teamMember.profile_image_path
                ? supabase.storage.from('assets').getPublicUrl(teamMember.profile_image_path).data.publicUrl
                : null

              return (
                <Card key={teamMember.id} className="overflow-hidden p-0">
                  {/* Profile Image */}
                  <div className="aspect-square bg-zinc-800 flex items-center justify-center">
                    {profileImageUrl ? (
                      <img
                        src={profileImageUrl}
                        alt={teamMember.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Text variant="muted" className="text-6xl">👤</Text>
                    )}
                  </div>

                  {/* Content */}
                  <div className="p-6">
                    <Heading as="h3" size="sm" className="mb-1">{teamMember.name}</Heading>
                    <Text variant="body" className="mb-4 text-gray-400">
                      {teamMember.role}
                    </Text>
                    {teamMember.bio && (
                      <Text variant="body" className="mb-4 line-clamp-3 text-sm">
                        {teamMember.bio}
                      </Text>
                    )}
                    
                    {/* Contact Info */}
                    {(teamMember.email || teamMember.phone) && (
                      <div className="mb-4 space-y-1">
                        {teamMember.email && (
                          <Text variant="small" className="text-gray-500">
                            📧 {teamMember.email}
                          </Text>
                        )}
                        {teamMember.phone && (
                          <Text variant="small" className="text-gray-500">
                            📞 {teamMember.phone}
                          </Text>
                        )}
                      </div>
                    )}

                    {/* Tags */}
                    {teamMember.tags && teamMember.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {teamMember.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-xs px-2 py-1 bg-zinc-800 rounded text-gray-400"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      <Link href={`/admin/team/${teamMember.id}/edit`} className="flex-1">
                        <Button variant="secondary" size="sm" className="w-full">
                          Rediger
                        </Button>
                      </Link>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDelete(teamMember.id, teamMember.name)}
                      >
                        🗑️
                      </Button>
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        ) : (
          <Card className="p-12 text-center">
            <Text variant="body" className="mb-4">Ingen team-medlemmer ennå</Text>
            <Link href="/admin/team/new">
              <Button variant="primary">Legg til første team-medlem</Button>
            </Link>
          </Card>
        )}
      </div>
    </div>
  )
}

