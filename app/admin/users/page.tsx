'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-client'
import { useAuth } from '@/hooks/useAuth'
import { ROLE_LABELS, STAFF_ROLES, type StaffRole } from '@/lib/permissions'

const C = {
  bg:      '#181920',
  surface: '#21212D',
  surface2:'#2A2A38',
  border:  '#3C3C52',
  text:    '#EEEEF2',
  text2:   '#B4B4CC',
  text3:   '#8484A0',
  accent:  '#7C5CFC',
  success: '#4CAF7D',
  danger:  '#E05555',
}

interface UserProfile {
  id: string
  email: string
  name: string | null
  role: string
  created_at: string
}

export default function UsersPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [inviting, setInviting] = useState(false)
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<StaffRole>('sales')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [savingRoleFor, setSavingRoleFor] = useState<string | null>(null)

  useEffect(() => { fetchUsers() }, [])

  async function fetchUsers() {
    const supabase = createClient()
    const { data, error } = await supabase.from('profiles').select('*').in('role', STAFF_ROLES).order('created_at', { ascending: false })
    if (!error) setUsers((data || []) as UserProfile[])
    else setError('Kunne ikke hente brukere')
    setLoading(false)
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviting(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch('/api/auth/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, name: inviteName || null, role: inviteRole }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kunne ikke sende invitasjon')
      setSuccess(`Invitasjon sendt til ${inviteEmail}`)
      setInviteEmail('')
      setInviteName('')
      setInviteRole('sales')
      setShowInviteForm(false)
      fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke sende invitasjon')
    } finally {
      setInviting(false)
    }
  }

  async function handleRoleChange(userId: string, role: StaffRole) {
    setSavingRoleFor(userId)
    const supabase = createClient()
    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
    if (error) alert('Kunne ikke oppdatere rolle')
    else setUsers(prev => prev.map(u => (u.id === userId ? { ...u, role } : u)))
    setSavingRoleFor(null)
  }

  async function handleDelete(userId: string, userEmail: string) {
    if (!confirm(`Slett brukeren "${userEmail}"? Dette kan ikke angres.`)) return
    try {
      const res = await fetch(`/api/auth/delete-user?userId=${userId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Kunne ikke slette bruker')
      fetchUsers()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Kunne ikke slette bruker')
    }
  }

  const inputStyle: React.CSSProperties = {
    fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem',
    width: '100%', padding: '10px 14px', boxSizing: 'border-box',
    background: C.surface2, border: `1px solid ${C.border}`,
    borderRadius: 8, color: C.text, outline: 'none',
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>Laster...</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 28 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.4rem', fontWeight: 700, color: C.text, lineHeight: 1.2 }}>
              Brukere
            </h1>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, marginTop: 4 }}>
              {users.length} bruker{users.length !== 1 ? 'e' : ''} med tilgang
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/admin">
              <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', padding: '7px 14px', borderRadius: 7, cursor: 'pointer', background: C.surface2, color: C.text2, border: `1px solid ${C.border}` }}>
                ← Dashboard
              </button>
            </Link>
            <button
              onClick={() => setShowInviteForm(v => !v)}
              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, padding: '7px 16px', borderRadius: 7, cursor: 'pointer', background: showInviteForm ? C.surface2 : C.accent, color: showInviteForm ? C.text2 : '#fff', border: showInviteForm ? `1px solid ${C.border}` : 'none' }}
            >
              {showInviteForm ? 'Avbryt' : '+ Ny bruker'}
            </button>
          </div>
        </div>

        {/* Inviteringsform */}
        {showInviteForm && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '20px 24px', marginBottom: 24 }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.88rem', fontWeight: 600, color: C.text, marginBottom: 16 }}>Send invitasjon</p>
            {error && (
              <div style={{ padding: '10px 14px', marginBottom: 12, background: 'rgba(224,85,85,0.08)', border: `1px solid rgba(224,85,85,0.25)`, borderRadius: 7 }}>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.danger }}>{error}</p>
              </div>
            )}
            <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input type="email" placeholder="E-post" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required disabled={inviting} style={inputStyle} />
              <input type="text" placeholder="Navn (valgfritt)" value={inviteName} onChange={e => setInviteName(e.target.value)} disabled={inviting} style={inputStyle} />
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value as StaffRole)} disabled={inviting} style={inputStyle}>
                {STAFF_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
              <button
                type="submit"
                disabled={inviting}
                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600, padding: '10px', borderRadius: 8, cursor: inviting ? 'default' : 'pointer', background: C.accent, color: '#fff', border: 'none', opacity: inviting ? 0.6 : 1 }}
              >
                {inviting ? 'Sender invitasjon...' : 'Send invitasjon'}
              </button>
            </form>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginTop: 10 }}>
              Brukeren mottar en e-post med lenke for å sette passord.
            </p>
          </div>
        )}

        {/* Suksessmelding */}
        {success && (
          <div style={{ padding: '10px 16px', marginBottom: 16, background: 'rgba(76,175,125,0.08)', border: `1px solid rgba(76,175,125,0.25)`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.success }}>{success}</p>
            <button onClick={() => setSuccess(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3 }}>✕</button>
          </div>
        )}

        {/* Brukerliste */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {users.length === 0 ? (
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '40px 24px', textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text3 }}>Ingen admin-brukere funnet</p>
            </div>
          ) : (
            users.map(user => (
              <div key={user.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 20px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.text, marginBottom: 2 }}>
                    {user.name || user.email}
                  </p>
                  {user.name && (
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>{user.email}</p>
                  )}
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, marginTop: 2 }}>
                    Opprettet {new Date(user.created_at).toLocaleDateString('nb-NO')}
                  </p>
                </div>
                <select
                  value={user.role}
                  onChange={e => handleRoleChange(user.id, e.target.value as StaffRole)}
                  disabled={savingRoleFor === user.id || user.id === currentUser?.id}
                  title={user.id === currentUser?.id ? 'Kan ikke endre egen rolle' : undefined}
                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', padding: '6px 10px', borderRadius: 7, background: C.surface2, color: C.text2, border: `1px solid ${C.border}`, flexShrink: 0 }}
                >
                  {STAFF_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
                <button
                  onClick={() => handleDelete(user.id, user.email)}
                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500, padding: '6px 14px', borderRadius: 7, cursor: 'pointer', background: 'rgba(224,85,85,0.1)', color: C.danger, border: `1px solid rgba(224,85,85,0.25)`, flexShrink: 0 }}
                >
                  Slett
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
