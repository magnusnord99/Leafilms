'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button, Card, Heading, Text, Input } from '@/components/ui'

interface UserProfile {
  id: string
  email: string
  name: string | null
  role: string
  created_at: string
}

export default function UsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [inviting, setInviting] = useState(false)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    fetchUsers()
  }, [])

  async function fetchUsers() {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'admin')
        .order('created_at', { ascending: false })

      if (error) throw error
      setUsers((data || []) as UserProfile[])
    } catch (err: any) {
      console.error('Error fetching users:', err)
      setError('Kunne ikke hente brukere')
    } finally {
      setLoading(false)
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviting(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/auth/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: inviteEmail,
          name: inviteName || null,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Kunne ikke sende invitasjon')
      }

      setSuccess(`Invitasjon sendt til ${inviteEmail}`)
      setInviteEmail('')
      setInviteName('')
      setShowInviteForm(false)
      fetchUsers() // Refresh list
    } catch (err: any) {
      setError(err.message || 'Kunne ikke sende invitasjon')
    } finally {
      setInviting(false)
    }
  }

  async function handleDelete(userId: string, userEmail: string) {
    if (
      !confirm(
        `Er du sikker på at du vil slette brukeren "${userEmail}"?\n\nDette kan ikke angres.`
      )
    ) {
      return
    }

    try {
      const response = await fetch(`/api/auth/delete-user?userId=${userId}`, {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Kunne ikke slette bruker')
      }

      fetchUsers() // Refresh list
    } catch (err: any) {
      console.error('Error deleting user:', err)
      alert(err.message || 'Kunne ikke slette bruker')
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
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <Heading as="h1" size="2xl">Admin-brukere</Heading>
          <div className="flex gap-4">
            <Link href="/admin">
              <Button variant="secondary">Tilbake</Button>
            </Link>
            <Button
              variant="primary"
              onClick={() => setShowInviteForm(!showInviteForm)}
            >
              {showInviteForm ? 'Avbryt' : '+ Ny admin-bruker'}
            </Button>
          </div>
        </div>

        {showInviteForm && (
          <Card className="mb-8 p-6">
            <Heading as="h2" size="xl" className="mb-4">
              Send invitasjon
            </Heading>
            {error && (
              <div className="mb-4 p-4 bg-red-900/20 border border-red-500/50 rounded-lg">
                <Text variant="body" className="text-red-400">
                  {error}
                </Text>
              </div>
            )}
            {success && (
              <div className="mb-4 p-4 bg-green-900/20 border border-green-500/50 rounded-lg">
                <Text variant="body" className="text-green-400">
                  {success}
                </Text>
              </div>
            )}
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <Input
                  type="email"
                  placeholder="Email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  disabled={inviting}
                />
              </div>
              <div>
                <Input
                  type="text"
                  placeholder="Navn (valgfritt)"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  disabled={inviting}
                />
              </div>
              <Button
                type="submit"
                variant="primary"
                disabled={inviting}
                className="w-full"
              >
                {inviting ? 'Sender invitasjon...' : 'Send invitasjon'}
              </Button>
            </form>
            <Text variant="body" className="text-gray-400 mt-4 text-sm">
              Brukeren vil motta en email med link for å sette passord.
            </Text>
          </Card>
        )}

        <div className="space-y-4">
          {users.length === 0 ? (
            <Card className="p-8 text-center">
              <Text variant="body" className="text-gray-400">
                Ingen admin-brukere funnet
              </Text>
            </Card>
          ) : (
            users.map((user) => (
              <Card key={user.id} className="p-6">
                <div className="flex justify-between items-center">
                  <div>
                    <Text variant="body" className="font-semibold">
                      {user.name || user.email}
                    </Text>
                    {user.name && (
                      <Text variant="body" className="text-gray-400 text-sm">
                        {user.email}
                      </Text>
                    )}
                    <Text variant="body" className="text-gray-500 text-xs mt-1">
                      Opprettet: {new Date(user.created_at).toLocaleDateString('no-NO')}
                    </Text>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(user.id, user.email)}
                  >
                    Slett
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

