'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getRooms, createRoom, EquipmentRoom } from '@/lib/actions/equipment'

const C = {
  bg:       '#181920',
  surface:  '#21212D',
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text:     '#EEEEF2',
  text2:    '#B4B4CC',
  text3:    '#8484A0',
  accent:   '#7C5CFC',
  accentBg: 'rgba(124,92,252,0.08)',
  danger:   '#E05555',
}

function RoomCard({ room }: { room: EquipmentRoom }) {
  return (
    <Link href={`/admin/utstyr/${room.id}`} style={{ textDecoration: 'none' }}>
      <div
        style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '18px 20px', cursor: 'pointer', transition: 'border-color 0.12s' }}
        onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = '#3D3D4E'}
        onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = C.border}
      >
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.9rem', fontWeight: 600, color: C.text, marginBottom: 4 }}>
          {room.name}
        </p>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
          {room.unit_count} utstyrsenhet{room.unit_count !== 1 ? 'er' : ''}
        </p>
      </div>
    </Link>
  )
}

export default function UtstyrPage() {
  const router = useRouter()
  const [rooms, setRooms] = useState<EquipmentRoom[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getRooms().then(data => {
      setRooms(data)
      setLoading(false)
    })
  }, [])

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    setError(null)
    const result = await createRoom(newName.trim())
    setCreating(false)
    if (result.error) {
      setError(result.error)
      return
    }
    if (result.id) router.push(`/admin/utstyr/${result.id}`)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>Laster...</p>
      </div>
    )
  }

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '32px 32px 48px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.4rem', fontWeight: 600, color: C.text, marginBottom: 4 }}>
              Utstyr
            </h1>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>
              {rooms.length} rom
            </p>
          </div>
          <button
            onClick={() => setShowNew(v => !v)}
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600,
              padding: '8px 14px', borderRadius: 6, cursor: 'pointer',
              background: C.accentBg, color: C.accent, border: '1px solid rgba(124,92,252,0.25)',
            }}
          >
            + Nytt rom
          </button>
        </div>

        {showNew && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 18px', marginBottom: 20, display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="Navn på rom, f.eks. «Lager A» eller «Bil 1»"
              autoFocus
              style={{
                flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem',
                color: C.text, background: C.surface2, border: `1px solid ${C.border}`,
                borderRadius: 6, padding: '7px 10px', outline: 'none',
              }}
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600,
                padding: '7px 14px', borderRadius: 6, cursor: newName.trim() ? 'pointer' : 'not-allowed',
                background: newName.trim() ? C.accentBg : 'transparent',
                color: newName.trim() ? C.accent : C.text3,
                border: `1px solid ${newName.trim() ? 'rgba(124,92,252,0.25)' : C.border}`,
              }}
            >
              {creating ? 'Oppretter...' : 'Opprett'}
            </button>
          </div>
        )}

        {error && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.danger, marginBottom: 20 }}>
            {error}
          </p>
        )}

        {rooms.length === 0 ? (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '64px 24px', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.88rem', color: C.text3 }}>
              Ingen rom opprettet ennå
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
            {rooms.map(r => <RoomCard key={r.id} room={r} />)}
          </div>
        )}

      </div>
    </div>
  )
}
