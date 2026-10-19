'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { C } from '@/lib/admin-theme'
import { AVATAR_COLORS, getAvatarColor } from '@/lib/avatar-colors'
import { updateProfileName, updateProfilePhone, updateProfileJobTitle, updateProfileColor, getTakenColors, type ProfileColorOwner } from '@/lib/actions/profile'
import { getEmailFooterTemplate, updateEmailFooterTemplate } from '@/lib/actions/email-footer'
import { renderEmailFooter, EMAIL_FOOTER_PLACEHOLDERS } from '@/lib/email-footer'

export default function ProfilePage() {
  const { user, profile, loading } = useAuth()
  const router = useRouter()

  const [name, setName] = useState('')
  const [nameSaving, setNameSaving] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)

  const [phone, setPhone] = useState('')
  const [phoneSaving, setPhoneSaving] = useState(false)
  const [phoneSaved, setPhoneSaved] = useState(false)
  const [phoneError, setPhoneError] = useState<string | null>(null)

  const [jobTitle, setJobTitle] = useState('')
  const [jobTitleSaving, setJobTitleSaving] = useState(false)
  const [jobTitleSaved, setJobTitleSaved] = useState(false)
  const [jobTitleError, setJobTitleError] = useState<string | null>(null)

  const [takenColors, setTakenColors] = useState<ProfileColorOwner[]>([])
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [colorSavingHex, setColorSavingHex] = useState<string | null>(null)
  const [colorError, setColorError] = useState<string | null>(null)

  const [footerTemplate, setFooterTemplate] = useState('')
  const [footerLoading, setFooterLoading] = useState(true)
  const [footerUpdatedAt, setFooterUpdatedAt] = useState<string | null>(null)
  const [footerSaving, setFooterSaving] = useState(false)
  const [footerSaved, setFooterSaved] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [loading, user, router])

  useEffect(() => {
    if (profile) {
      setName(profile.name ?? '')
      setPhone(profile.phone ?? '')
      setJobTitle(profile.job_title ?? '')
      setSelectedColor(profile.color ?? null)
    }
  }, [profile])

  useEffect(() => {
    getTakenColors().then(setTakenColors)
  }, [])

  useEffect(() => {
    getEmailFooterTemplate().then(({ template, updatedAt }) => {
      setFooterTemplate(template)
      setFooterUpdatedAt(updatedAt)
      setFooterLoading(false)
    })
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

  async function handleSavePhone() {
    setPhoneSaving(true)
    setPhoneError(null)
    setPhoneSaved(false)
    const result = await updateProfilePhone(phone)
    if (result.error) {
      setPhoneError(result.error)
    } else {
      setPhoneSaved(true)
      setTimeout(() => setPhoneSaved(false), 2000)
    }
    setPhoneSaving(false)
  }

  async function handleSaveJobTitle() {
    setJobTitleSaving(true)
    setJobTitleError(null)
    setJobTitleSaved(false)
    const result = await updateProfileJobTitle(jobTitle)
    if (result.error) {
      setJobTitleError(result.error)
    } else {
      setJobTitleSaved(true)
      setTimeout(() => setJobTitleSaved(false), 2000)
    }
    setJobTitleSaving(false)
  }

  async function handleSaveFooterTemplate() {
    setFooterSaving(true)
    setFooterSaved(false)
    await updateEmailFooterTemplate(footerTemplate)
    setFooterUpdatedAt(new Date().toISOString())
    setFooterSaving(false)
    setFooterSaved(true)
    setTimeout(() => setFooterSaved(false), 2000)
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
                flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', color: C.text,
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

        <section style={{ marginBottom: 32 }}>
          <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 10 }}>
            Telefon
          </label>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, marginBottom: 10 }}>
            Vises til kunden når du er satt som Leafilms-kontakt på et delt board.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+47 900 00 000"
              style={{
                flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', color: C.text,
                background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px',
              }}
            />
            <button
              onClick={handleSavePhone}
              disabled={phoneSaving}
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', fontWeight: 600,
                padding: '9px 16px', borderRadius: 8, cursor: phoneSaving ? 'wait' : 'pointer',
                background: C.accent, color: '#fff', border: 'none',
                opacity: phoneSaving ? 0.6 : 1,
              }}
            >
              Lagre
            </button>
          </div>
          {phoneError && <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: '#E05555', marginTop: 8 }}>{phoneError}</p>}
          {phoneSaved && <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: '#4CAF7D', marginTop: 8 }}>Lagret.</p>}
        </section>

        <section style={{ marginBottom: 32 }}>
          <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 10 }}>
            Stilling
          </label>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, marginBottom: 10 }}>
            Vises i footeren på e-postene dine, f.eks. &quot;Daglig leder&quot; eller &quot;Filmskaper&quot;.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={jobTitle}
              onChange={e => setJobTitle(e.target.value)}
              placeholder="Filmskaper"
              style={{
                flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: C.text,
                background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px',
              }}
            />
            <button
              onClick={handleSaveJobTitle}
              disabled={jobTitleSaving}
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', fontWeight: 600,
                padding: '9px 16px', borderRadius: 8, cursor: jobTitleSaving ? 'wait' : 'pointer',
                background: C.accent, color: '#fff', border: 'none',
                opacity: jobTitleSaving ? 0.6 : 1,
              }}
            >
              Lagre
            </button>
          </div>
          {jobTitleError && <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: '#E05555', marginTop: 8 }}>{jobTitleError}</p>}
          {jobTitleSaved && <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: '#4CAF7D', marginTop: 8 }}>Lagret.</p>}
        </section>

        <section style={{ marginBottom: 32 }}>
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

        <section style={{ marginTop: 32, paddingTop: 28, borderTop: `1px solid ${C.border}` }}>
          <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 10 }}>
            E-post-footer-mal <span style={{ color: C.accent }}>— delt for alle</span>
          </label>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, marginBottom: 10 }}>
            Denne malen brukes nederst i alle ansattes utgående e-poster — alle kan redigere den her.
            Plassholdere: {EMAIL_FOOTER_PLACEHOLDERS.map(p => `{{${p}}}`).join(', ')} (hentes fra avsenderens egen profil).
            Lenker skrives som [tekst](url). Sett valgfrie felt (som stilling) på egen linje — linjen forsvinner automatisk hvis feltet er tomt for avsenderen.
          </p>
          {footerLoading ? (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>Laster...</p>
          ) : (
            <>
              <textarea
                value={footerTemplate}
                onChange={e => setFooterTemplate(e.target.value)}
                rows={7}
                style={{
                  width: '100%', fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text,
                  background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '10px 12px',
                  boxSizing: 'border-box', resize: 'vertical',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                <button
                  onClick={handleSaveFooterTemplate}
                  disabled={footerSaving}
                  style={{
                    fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', fontWeight: 600,
                    padding: '9px 16px', borderRadius: 8, cursor: footerSaving ? 'wait' : 'pointer',
                    background: C.accent, color: '#fff', border: 'none',
                    opacity: footerSaving ? 0.6 : 1,
                  }}
                >
                  Lagre
                </button>
                {footerSaved && <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: '#4CAF7D' }}>Lagret — gjelder nå for alle.</p>}
                {!footerSaved && footerUpdatedAt && (
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
                    Sist oppdatert {new Date(footerUpdatedAt).toLocaleDateString('nb-NO', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>

              <div style={{ marginTop: 16 }}>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.text3, marginBottom: 6 }}>
                  Forhåndsvisning — slik ser den ut i dine egne e-poster
                </p>
                <pre style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text2,
                  background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8,
                  padding: '10px 12px', whiteSpace: 'pre-wrap', margin: 0,
                }}>
                  {renderEmailFooter(footerTemplate, { name, job_title: jobTitle, phone, email: profile.email }) || '(tom)'}
                </pre>
              </div>
            </>
          )}
        </section>

      </div>
    </div>
  )
}
