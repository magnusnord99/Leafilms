'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { C } from '@/lib/admin-theme'
import { AVATAR_COLORS, getAvatarColor } from '@/lib/avatar-colors'
import { updateProfileName, updateProfileColor, getTakenColors, type ProfileColorOwner } from '@/lib/actions/profile'

export default function ProfilePage() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()

  const [name, setName] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  const [takenColors, setTakenColors] = useState<ProfileColorOwner[]>([])
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [colorSavingHex, setColorSavingHex] = useState<string | null>(null)
  const [colorError, setColorError] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [loading, user, router])

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? '')
      setSelectedColor(profile.color ?? null)
    }
  }, [profile])

  useEffect(() => {
    getTakenColors().then(setTakenColors)
  }, [])

  async function handleSaveName() {
    setNameSaving(true)
    setNameError(null)
    setNameSaved(false)
    const result = await updateProfileName(name)
    if (result.error) {
      setNameError(result.error)
    } else {
      setNameSaved(true)
      setTimeout(() => setNameSaved(false), 2000)
    }
    setNameSaving(false)
  }

  async function handleSelectColor(color: string) {
    if (colorSavingHex || !profile) return
    const previous = selectedColor
    setSelectedColor(color)
    setColorSavingHex(color)
    setColorError(null)
    const result = await updateProfileColor(color)
    if (result.error) {
      setSelectedColor(previous)
      setColorError(result.error)
      getTakenColors().then(setTakenColors)
    } else {
      setTakenColors(prev => [
        ...prev.filter(p => p.id !== profile.id),
        { id: profile.id, name: profile.name, color },
      ])
    }
    setColorSavingHex(null)
  }

  if (loading || !profile) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>Laster...</p>
      </div>
    )
  }

  const previewColor = getAvatarColor({ id: profile.id, color: selectedColor })
  const initials = (name || profile.email)[0]?.toUpperCase() ?? '?'

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '32px 24px' }}>

        <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.4rem', fontWeight: 700, color: C.text, marginBottom: 4 }}>
          Min profil
        </h1>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, marginBottom: 28 }}>
          {profile.email}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
            background: `${previewColor}22`,
            border: `2px solid ${previewColor}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-dm-sans)', fontSize: '1.3rem', fontWeight: 700,
            color: previewColor,
          }}>
            {initials}
          </div>
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: C.text2 }}>
            Slik ser ikonet ditt ut andre steder i appen
          </span>
        </div>

        <section style={{ marginBottom: 32 }}>
          <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 10 }}>
            Navn
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              style={{
                flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: C.text,
                background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px',
              }}
            />
            <button
              onClick={handleSaveName}
              disabled={nameSaving || !name.trim()}
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', fontWeight: 600,
                padding: '9px 16px', borderRadius: 8, cursor: nameSaving ? 'wait' : 'pointer',
                background: C.accent, color: '#fff', border: 'none',
                opacity: nameSaving || !name.trim() ? 0.6 : 1,
              }}
            >
              Lagre
            </button>
          </div>
          {nameError && <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: '#E05555', marginTop: 8 }}>{nameError}</p>}
          {nameSaved && <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: '#4CAF7D', marginTop: 8 }}>Lagret.</p>}
        </section>

        <section>
          <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 10 }}>
            Farge
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, maxWidth: 260 }}>
            {AVATAR_COLORS.map(hex => {
              const owner = takenColors.find(p => p.color === hex && p.id !== profile.id)
              const isMine = selectedColor === hex
              const isTaken = !!owner
              return (
                <button
                  key={hex}
                  disabled={isTaken || colorSavingHex !== null}
                  onClick={() => handleSelectColor(hex)}
                  title={isTaken ? `Opptatt av ${owner!.name ?? 'en annen bruker'}` : undefined}
                  style={{
                    width: 40, height: 40, borderRadius: '50%', cursor: isTaken ? 'not-allowed' : 'pointer',
                    background: hex, border: isMine ? `3px solid ${C.text}` : '3px solid transparent',
                    opacity: isTaken ? 0.25 : colorSavingHex && colorSavingHex !== hex ? 0.5 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'opacity 0.15s',
                  }}
                >
                  {isMine && (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8.5L6.5 12L13 4.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
          {colorError && <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: '#E05555', marginTop: 12 }}>{colorError}</p>}
        </section>

      </div>
    </div>
  )
}
