'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getContractTemplate, saveContractTemplate } from '@/lib/actions/contracts'

const C = {
  bg:       '#181920',
  surface:  '#21212D',
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text:     '#EEEEF2',
  text2:    '#B4B4CC',
  text3:    '#8484A0',
  accent:   '#7C5CFC',
  success:  '#4CAF7D',
  danger:   '#E05555',
}

export default function ContractTemplatePage() {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const template = await getContractTemplate()
        setContent(template)
      } catch {
        setError('Kunne ikke laste kontraktmalen.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      await saveContractTemplate(content)
      setSaved(true)
    } catch {
      setError('Lagring mislyktes. Prøv igjen.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 24px 48px' }}>

        {/* Tilbake-lenke */}
        <div style={{ marginBottom: 20 }}>
          <Link href="/admin/pipeline" style={{ textDecoration: 'none' }}>
            <span
              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}
              onMouseEnter={e => { (e.currentTarget as HTMLSpanElement).style.color = C.text2 }}
              onMouseLeave={e => { (e.currentTarget as HTMLSpanElement).style.color = C.text3 }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 2L4 6l3.5 4" />
              </svg>
              Pipeline
            </span>
          </Link>
        </div>

        {/* Overskrift */}
        <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: `1px solid ${C.border}` }}>
          <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.4rem', fontWeight: 600, color: C.text, lineHeight: 1.2, marginBottom: 4 }}>
            Global kontraktmal
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, lineHeight: 1.6 }}>
            Denne malen brukes som utgangspunkt for alle prosjektkontrakter. Variabler erstattes automatisk med prosjektdata ved publisering.
          </p>
        </div>

        {/* Hjelpetekst — variabler */}
        <div style={{ marginBottom: 20, padding: '14px 16px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8 }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.text3, marginBottom: 10 }}>
            Tilgjengelige variabler
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 500, color: C.text2, marginBottom: 4 }}>
                Auto-fylt fra prosjektdata:
              </p>
              <p style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: C.accent, lineHeight: 1.9 }}>
                {'{{bedrift}}'} · {'{{kunde_kontakt}}'} · {'{{oppstart_dato}}'} · {'{{opptak_datoer}}'}<br />
                {'{{leveranse}}'} · {'{{totalpris}}'} · {'{{signerings_dato}}'}
              </p>
            </div>
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 500, color: C.text2, marginBottom: 4 }}>
                Manuelt i kontrakteditor:
              </p>
              <p style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: C.text2, lineHeight: 1.9 }}>
                {'{{org_nummer}}'} · {'{{produksjons_periode}}'} · {'{{signerings_sted}}'}
              </p>
            </div>
          </div>
        </div>

        {/* Textarea */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.text3 }}>
              Kontraktmal
            </span>
            {loading && (
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3 }}>
                Laster...
              </span>
            )}
          </div>
          {loading ? (
            <div style={{ padding: '32px', textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>Laster mal...</p>
            </div>
          ) : (
            <textarea
              value={content}
              onChange={e => { setContent(e.target.value); setSaved(false) }}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                resize: 'vertical',
                minHeight: 600,
                fontFamily: 'monospace',
                fontSize: '0.78rem',
                color: C.text,
                background: C.surface2,
                border: 'none',
                borderRadius: 0,
                padding: '16px',
                outline: 'none',
                lineHeight: 1.7,
              }}
              placeholder="Skriv kontraktmalen her. Bruk variablene ovenfor for å fylle inn prosjektdata automatisk."
              onFocus={e => { e.currentTarget.style.boxShadow = `inset 0 0 0 1px ${C.accent}` }}
              onBlur={e => { e.currentTarget.style.boxShadow = 'none' }}
            />
          )}
        </div>

        {/* Handlingsrad */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.82rem',
              fontWeight: 600,
              padding: '10px 22px',
              borderRadius: 8,
              cursor: saving || loading ? 'not-allowed' : 'pointer',
              background: saving || loading ? C.surface2 : C.accent,
              color: saving || loading ? C.text3 : '#fff',
              border: 'none',
              transition: 'background 0.15s',
            }}
          >
            {saving ? 'Lagrer...' : 'Lagre mal'}
          </button>

          {saved && !saving && (
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.success }}>
              Lagret ✓
            </span>
          )}

          {error && (
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.danger }}>
              {error}
            </span>
          )}
        </div>

      </div>
    </div>
  )
}
