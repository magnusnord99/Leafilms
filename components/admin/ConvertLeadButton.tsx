'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { LeadRecord } from '@/lib/actions/leads'
import { convertLeadToCustomer, type LeadCustomerInput } from '@/lib/actions/convert-lead'
import { getCustomersList } from '@/lib/actions/pipeline'
import { C } from '@/lib/admin-theme'

const buttonStyle: React.CSSProperties = {
  fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600,
  padding: '8px 13px', borderRadius: 6, border: `1px solid ${C.accent}`,
  background: C.accent, color: C.bg, cursor: 'pointer', textDecoration: 'none',
}
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 6, border: `1px solid ${C.border}`,
  background: C.surface2, color: C.text, fontSize: '1rem', boxSizing: 'border-box',
}

export function ConvertLeadButton({ lead, customerId, disabled = false }: { lead: LeadRecord; customerId?: string | null; disabled?: boolean }) {
  const router = useRouter()
  const dialog = useRef<HTMLDialogElement>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([])
  const [form, setForm] = useState<LeadCustomerInput>({ name: '', orgNumber: '', address: '', contactName: '', email: '', phone: '', existingCustomerId: '' })
  const linkedCustomerId = lead.customer_id || customerId

  function open() {
    setForm({
      name: lead.company || lead.name,
      orgNumber: '', address: '',
      contactName: lead.company && lead.name !== lead.company ? lead.name : '',
      email: lead.email || '', phone: lead.phone || '', existingCustomerId: '',
    })
    setError(null)
    dialog.current?.showModal()
    getCustomersList().then(setCustomers).catch(() => setCustomers([]))
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const result = await convertLeadToCustomer(lead.id, form)
      if ('error' in result) {
        setError(result.error)
        return
      }
      dialog.current?.close()
      router.push(`/admin/customers/${result.customerId}`)
      router.refresh()
    } catch {
      setError('Kunne ikke gjøre leaden til kunde. Prøv igjen.')
    } finally {
      setSaving(false)
    }
  }

  if (linkedCustomerId) {
    return <Link href={`/admin/customers/${linkedCustomerId}`} style={buttonStyle}>Se kunde →</Link>
  }

  const fields = [
    { key: 'name', label: 'Kundenavn / bedrift', required: true, type: 'text', autoComplete: 'organization' },
    { key: 'orgNumber', label: 'Organisasjonsnummer', type: 'text', autoComplete: 'off' },
    { key: 'address', label: 'Adresse', type: 'text', autoComplete: 'street-address' },
    { key: 'contactName', label: 'Kontaktperson', type: 'text', autoComplete: 'name' },
    { key: 'email', label: 'E-post', type: 'email', autoComplete: 'email' },
    { key: 'phone', label: 'Telefon', type: 'tel', autoComplete: 'tel' },
  ] as const

  return (
    <>
      <button type="button" onClick={open} disabled={disabled} style={{ ...buttonStyle, opacity: disabled ? 0.5 : 1 }}>Gjør til kunde</button>
      <dialog ref={dialog} aria-labelledby={`convert-lead-${lead.id}`} onCancel={event => { if (saving) event.preventDefault() }}
        style={{ margin: 'auto', width: 'min(560px, calc(100vw - 32px))', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', padding: 24, borderRadius: 12, border: `1px solid ${C.border}`, background: C.surface, color: C.text }}>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16, fontFamily: 'var(--font-dm-sans)' }}>
          <h2 id={`convert-lead-${lead.id}`} style={{ fontSize: '1.25rem', fontWeight: 600 }}>Gjør til kunde</h2>
          <p style={{ fontSize: '0.8rem', color: C.text2 }}>Kontroller opplysningene og fyll inn det som mangler. Kundenavn er påkrevd. Leadens historikk beholdes.</p>
          {customers.length > 0 && (
            <label style={{ fontSize: '0.75rem', display: 'grid', gap: 6 }}>
              Kunde
              <select value={form.existingCustomerId} disabled={saving} onChange={event => setForm(prev => ({ ...prev, existingCustomerId: event.target.value }))} style={inputStyle}>
                <option value="">Opprett ny kunde</option>
                {customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
              </select>
            </label>
          )}
          {form.existingCustomerId ? (
            <p style={{ fontSize: '0.8rem', color: C.text2 }}>Leaden kobles til den valgte kunden. Eksisterende kundeinformasjon beholdes.</p>
          ) : fields.map(field => (
            <label key={field.key} style={{ fontSize: '0.75rem', display: 'grid', gap: 6 }}>
              {field.label}{'required' in field && field.required ? ' *' : ''}
              <input value={form[field.key]} type={field.type} autoComplete={field.autoComplete}
                required={'required' in field && field.required} disabled={saving}
                pattern={field.key === 'orgNumber' ? '[0-9\\s]{9,}' : undefined}
                title={field.key === 'orgNumber' ? '9 siffer, eventuelt med mellomrom' : undefined}
                onChange={event => setForm(prev => ({ ...prev, [field.key]: event.target.value }))} style={inputStyle} />
            </label>
          ))}
          {error && <p role="alert" style={{ color: C.danger, fontSize: '0.8rem' }}>{error}</p>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button type="button" disabled={saving} onClick={() => dialog.current?.close()} style={{ ...buttonStyle, background: 'transparent', color: C.text2, borderColor: C.border }}>Avbryt</button>
            <button type="submit" disabled={saving} style={buttonStyle}>{saving ? 'Oppretter...' : 'Gjør til kunde'}</button>
          </div>
        </form>
      </dialog>
    </>
  )
}
