'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { C } from '@/lib/admin-theme'
import { getCompanyDirection, updateCompanyDirection } from '@/lib/actions/company-direction'
import RichNotesEditor from '@/components/admin/RichNotesEditor'

export default function RetningPage() {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    getCompanyDirection().then(({ contentHtml, updatedAt }) => {
      setContent(contentHtml)
      setUpdatedAt(updatedAt)
      setLoading(false)
    })
  }, [])

  function handleChange(html: string) {
    setContent(html)
    setSaving(true)
    setSaved(false)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await updateCompanyDirection(html)
      setUpdatedAt(new Date().toISOString())
      setSaving(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }, 800)
  }

  const formatDate = (ts: string) =>
    new Date(ts).toLocaleString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px 80px' }}>

        {/* Header */}
        <Link href="/admin" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, textDecoration: 'none' }}>
          ← Dashboard
        </Link>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginTop: 8, marginBottom: 6 }}>
          <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.5rem', fontWeight: 700, color: C.text, margin: 0, lineHeight: 1.2 }}>
            Vår retning
          </h1>
          <button
            onClick={() => setEditing(e => !e)}
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600,
              padding: '8px 16px', borderRadius: 7,
              background: editing ? C.accent : C.surface,
              color: editing ? '#fff' : C.text2,
              border: `1px solid ${editing ? C.accent : C.border}`,
              cursor: 'pointer',
            }}
          >
            {editing ? 'Ferdig' : 'Rediger'}
          </button>
        </div>

        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, marginBottom: 8, lineHeight: 1.6, maxWidth: 560 }}>
          Hvordan vi i Leafilms tenker om oss selv, kundene våre og hvor vi er på vei — ment som et
          referansepunkt, spesielt for salg. Redigerbar av alle interne.
        </p>

        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, marginBottom: 28, minHeight: 16 }}>
          {saving ? 'Lagrer...' : saved ? 'Lagret ✓' : updatedAt ? `Sist oppdatert ${formatDate(updatedAt)}` : ''}
        </p>

        {loading ? (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, textAlign: 'center', paddingTop: 48 }}>Laster...</p>
        ) : (
          <div className="retning-doc">
            <RichNotesEditor
              value={content}
              onChange={handleChange}
              readOnly={!editing}
              minHeight={editing ? 400 : 0}
              placeholder="Skriv inn tekst..."
            />
          </div>
        )}

        <div style={{ marginTop: 40, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, margin: 0 }}>
            Opprinnelig hentet fra internt brand guidelines-dokument (inkl. salgs-playbook og notater fra møte
            med Lea) og kickoff-møtet 16. januar 2026 — redigert i appen siden.
          </p>
        </div>
      </div>
    </div>
  )
}
