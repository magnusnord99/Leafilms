'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { createCustomerContact } from '@/lib/actions/schedule-people'
import { C } from '@/lib/admin-theme'

const fieldLabel = (text: string, required?: boolean) => (
  <label style={{
    display: 'block',
    fontFamily: 'var(--font-dm-sans)',
    fontSize: '0.6rem',
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    color: C.text2,
    fontWeight: 500,
    marginBottom: 6,
  }}>
    {text}{required && <span style={{ color: C.accent, marginLeft: 4 }}>*</span>}
  </label>
)

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 3,
  color: C.text,
  fontFamily: 'var(--font-dm-sans)',
  fontSize: '1rem',
  letterSpacing: '0.03em',
  outline: 'none',
}

export default function NewCustomer() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    org_nummer: '',
    address: '',
    notes: ''
  })
  // Primærkontakt — lagres i customer_contacts, ikke på customers-raden
  const [contactData, setContactData] = useState({
    contactName: '',
    email: '',
    phone: '',
    role: ''
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data, error } = await supabase
        .from('customers')
        .insert([formData])
        .select()
        .single()

      if (error) throw error

      // Opprett primærkontakt hvis noe kontaktinfo er fylt inn
      const hasContactInfo = contactData.contactName.trim() || contactData.email.trim() || contactData.phone.trim()
      if (hasContactInfo) {
        await createCustomerContact({
          customer_id: data.id,
          name: contactData.contactName.trim() || formData.name.trim(),
          email: contactData.email.trim() || null,
          phone: contactData.phone.trim() || null,
          role: contactData.role.trim() || null,
          is_primary: true,
        })
      }

      router.push(`/admin/customers/${data.id}`)
    } catch (err) {
      console.error('Error creating customer:', err)
      setError('Kunne ikke opprette kunde: ' + (err instanceof Error ? err.message : 'Ukjent feil'))
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen p-8 md:p-12" style={{ background: C.bg, color: C.text }}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <Link
            href="/admin/customers"
            className="flex items-center gap-2 mb-8 transition-colors"
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.6rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: C.text3,
              textDecoration: 'none',
            }}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
            Tilbake
          </Link>

          <div className="flex items-center gap-4 mb-4">
            <div style={{ width: 32, height: 1, background: C.accent }} />
            <span style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.6rem',
              letterSpacing: '0.16em',
              color: C.accent,
              textTransform: 'uppercase',
              fontWeight: 500,
            }}>
              Kunder
            </span>
          </div>
          <h1 style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: 'clamp(1.8rem, 3vw, 2.5rem)',
            fontWeight: 300,
            fontStyle: 'italic',
            color: C.text,
            lineHeight: 1.1,
          }}>
            Ny kunde
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, marginTop: 6, letterSpacing: '0.04em' }}>
            Legg til en ny kunde i systemet
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div
            className="flex items-start justify-between gap-3 mb-6 px-4 py-3"
            style={{ background: 'rgba(184,64,64,0.1)', border: '1px solid rgba(184,64,64,0.3)', borderRadius: 3 }}
          >
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: '#E07070', lineHeight: 1.5 }}>{error}</p>
            <button
              type="button"
              onClick={() => setError(null)}
              style={{ color: '#E07070', background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}
            >
              ×
            </button>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            {fieldLabel('Navn', true)}
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              placeholder="Kundens navn"
              style={inputStyle}
            />
          </div>

          <div>
            {fieldLabel('Org.nummer')}
            <input
              type="text"
              value={formData.org_nummer}
              onChange={(e) => setFormData({ ...formData, org_nummer: e.target.value })}
              placeholder="923 456 789"
              style={inputStyle}
            />
          </div>

          <div>
            {fieldLabel('Adresse')}
            <textarea
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="Gateadresse, postnummer, by"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          {/* Primærkontakt — lagres i customer_contacts, ikke direkte på kunden */}
          <div style={{ padding: '16px 20px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 3 }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: C.text3, marginBottom: 14 }}>
              Primærkontakt (valgfritt)
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                {fieldLabel('Kontaktnavn')}
                <input
                  type="text"
                  value={contactData.contactName}
                  onChange={(e) => setContactData({ ...contactData, contactName: e.target.value })}
                  placeholder="Fullt navn (blank = samme som kontonavn)"
                  style={inputStyle}
                />
              </div>
              <div>
                {fieldLabel('Rolle')}
                <input
                  type="text"
                  value={contactData.role}
                  onChange={(e) => setContactData({ ...contactData, role: e.target.value })}
                  placeholder="f.eks. Daglig leder"
                  style={inputStyle}
                />
              </div>
              <div>
                {fieldLabel('E-post')}
                <input
                  type="email"
                  value={contactData.email}
                  onChange={(e) => setContactData({ ...contactData, email: e.target.value })}
                  placeholder="kontakt@bedrift.no"
                  style={inputStyle}
                />
              </div>
              <div>
                {fieldLabel('Telefon')}
                <input
                  type="tel"
                  value={contactData.phone}
                  onChange={(e) => setContactData({ ...contactData, phone: e.target.value })}
                  placeholder="+47 123 45 678"
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          <div>
            {fieldLabel('Notater')}
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Interne notater om kunden..."
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading || !formData.name}
              style={{
                flex: 1,
                padding: '10px 20px',
                background: loading || !formData.name ? C.border : C.accent,
                color: loading || !formData.name ? C.text3 : C.bg,
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.65rem',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                fontWeight: 600,
                border: 'none',
                borderRadius: 3,
                cursor: loading || !formData.name ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {loading ? 'Oppretter...' : 'Opprett kunde'}
            </button>
            <Link href="/admin/customers">
              <button
                type="button"
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  color: C.text3,
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.65rem',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  border: `1px solid ${C.border}`,
                  borderRadius: 3,
                  cursor: 'pointer',
                }}
              >
                Avbryt
              </button>
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
