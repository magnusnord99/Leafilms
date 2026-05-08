'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Customer } from '@/lib/types'

const fieldLabel = (text: string, required?: boolean) => (
  <label style={{
    display: 'block',
    fontFamily: 'var(--font-dm-sans)',
    fontSize: '0.6rem',
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    color: '#9E9287',
    fontWeight: 500,
    marginBottom: 6,
  }}>
    {text}{required && <span style={{ color: '#C49434', marginLeft: 4 }}>*</span>}
  </label>
)

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: '#161410',
  border: '1px solid #2A261F',
  borderRadius: 3,
  color: '#E8E1D5',
  fontFamily: 'var(--font-dm-sans)',
  fontSize: '0.75rem',
  letterSpacing: '0.03em',
  outline: 'none',
}

export default function EditCustomer() {
  const router = useRouter()
  const params = useParams()
  const customerId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    address: '',
    notes: ''
  })
  const initialDataRef = useRef<typeof formData | null>(null)

  useEffect(() => {
    if (customerId) {
      fetchCustomer()
    }
  }, [customerId])

  useEffect(() => {
    if (!initialDataRef.current) return
    const changed = JSON.stringify(formData) !== JSON.stringify(initialDataRef.current)
    setIsDirty(changed)
  }, [formData])

  async function fetchCustomer() {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .single()

      if (error) throw error

      setCustomer(data as Customer)
      const loaded = {
        name: data.name || '',
        email: data.email || '',
        company: data.company || '',
        phone: data.phone || '',
        address: data.address || '',
        notes: data.notes || ''
      }
      setFormData(loaded)
      initialDataRef.current = loaded
    } catch (err: any) {
      console.error('Error fetching customer:', err)
      setError('Kunne ikke hente kundeinformasjon: ' + (err.message || 'Ukjent feil'))
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaveSuccess(false)

    try {
      const { error } = await supabase
        .from('customers')
        .update({
          ...formData,
          updated_at: new Date().toISOString()
        })
        .eq('id', customerId)

      if (error) throw error

      initialDataRef.current = { ...formData }
      setIsDirty(false)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err: any) {
      console.error('Error updating customer:', err)
      setError('Kunne ikke oppdatere kunde: ' + (err.message || 'Ukjent feil'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0C0B09' }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: '#62594E', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          Laster...
        </p>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0C0B09' }}>
        <div className="text-center">
          <p style={{ fontFamily: 'var(--font-dm-sans)', color: '#9E9287', marginBottom: 16 }}>Kunde ikke funnet</p>
          <Link href="/admin/customers">
            <button
              style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.6rem',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#C49434',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Tilbake til kunder
            </button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-8 md:p-12" style={{ background: '#0C0B09', color: '#E8E1D5' }}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <Link
            href={`/admin/customers/${customerId}/projects`}
            className="flex items-center gap-2 mb-8 transition-colors"
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.6rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#62594E',
              textDecoration: 'none',
            }}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
            Tilbake
          </Link>

          <div className="flex items-center gap-4 mb-4">
            <div style={{ width: 32, height: 1, background: '#C49434' }} />
            <span style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.6rem',
              letterSpacing: '0.16em',
              color: '#C49434',
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
            color: '#E8E1D5',
            lineHeight: 1.1,
          }}>
            Rediger kunde
          </h1>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: '#62594E', marginTop: 6, letterSpacing: '0.04em' }}>
            {customer.name}
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

        {/* Success banner */}
        {saveSuccess && (
          <div
            className="flex items-center gap-3 mb-6 px-4 py-3"
            style={{ background: 'rgba(196,148,52,0.08)', border: '1px solid rgba(196,148,52,0.25)', borderRadius: 3 }}
          >
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: '#C49434', letterSpacing: '0.06em' }}>
              Endringer lagret
            </p>
          </div>
        )}

        {/* Unsaved changes indicator */}
        {isDirty && !saveSuccess && (
          <div
            className="flex items-center gap-3 mb-6 px-4 py-2"
            style={{ background: 'rgba(98,89,78,0.15)', border: '1px solid #38332A', borderRadius: 3 }}
          >
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#C49434', flexShrink: 0 }} />
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: '#62594E', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Ulagrede endringer
            </p>
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
            {fieldLabel('E-post')}
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="kunde@example.com"
              style={inputStyle}
            />
          </div>

          <div>
            {fieldLabel('Firma')}
            <input
              type="text"
              value={formData.company}
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              placeholder="Firmanavn"
              style={inputStyle}
            />
          </div>

          <div>
            {fieldLabel('Telefon')}
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+47 123 45 678"
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
              disabled={saving || !formData.name}
              style={{
                flex: 1,
                padding: '10px 20px',
                background: saving || !formData.name ? '#38332A' : '#C49434',
                color: saving || !formData.name ? '#62594E' : '#0C0B09',
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.65rem',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                fontWeight: 600,
                border: 'none',
                borderRadius: 3,
                cursor: saving || !formData.name ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {saving ? 'Lagrer...' : 'Lagre endringer'}
            </button>
            <Link href={`/admin/customers/${customerId}/projects`}>
              <button
                type="button"
                style={{
                  padding: '10px 20px',
                  background: 'transparent',
                  color: '#62594E',
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.65rem',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  border: '1px solid #2A261F',
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
