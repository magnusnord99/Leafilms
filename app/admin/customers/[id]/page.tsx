'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-client'
import { C } from '@/lib/admin-theme'
import { Customer, CustomerContact, Project, Quote, Contract, QuoteBuilderData } from '@/lib/types'
import { getCustomerContacts } from '@/lib/actions/schedule-people'
import { updateCustomerInvoiceInfo } from '@/lib/actions/customers'
import { getQuoteAmountExclVat } from '@/lib/quote-builder-utils'

type QuoteWithAmount = Quote & { quote_data: QuoteBuilderData | null; selected_addon_ids: string[] | null }
type ProjectWithDetails = Project & { quotes: QuoteWithAmount[]; contracts: Contract[] }

const statusLabel: Record<string, string> = {
  published: 'Publisert',
  archived:  'Arkivert',
  draft:     'Utkast',
}

const statusColors: Record<string, { bg: string; color: string; border: string }> = {
  published: { bg: 'rgba(80,200,120,0.1)',  color: '#50C878', border: 'rgba(80,200,120,0.25)' },
  archived:  { bg: 'rgba(132,132,160,0.1)', color: C.text3,   border: C.border },
  draft:     { bg: 'rgba(124,92,252,0.1)',  color: C.accent,  border: 'rgba(124,92,252,0.25)' },
}

const quoteStatusLabel: Record<string, string> = {
  accepted: 'Godtatt',
  sent:     'Sendt',
  rejected: 'Avslått',
  draft:    'Utkast',
}

function Badge({ status, label }: { status: string; label: string }) {
  const s = statusColors[status] ?? statusColors.draft
  return (
    <span style={{
      fontFamily: 'var(--font-dm-sans)',
      fontSize: '0.6rem',
      fontWeight: 600,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      padding: '2px 8px',
      borderRadius: 3,
      background: s.bg,
      color: s.color,
      border: `1px solid ${s.border}`,
    }}>
      {label}
    </span>
  )
}

function formatNok(amount: number): string {
  return new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(amount)
}

// Samme logikk som /admin/okonomi: et signert/akseptert tilbud vinner alltid (selv over en
// nyere is_current-kladd — f.eks. et tilleggstilbud for ekstraarbeid på et allerede signert
// prosjekt), ellers is_current, ellers nyeste tilbud med data.
function pickBestQuote(quotes: QuoteWithAmount[]): QuoteWithAmount | null {
  const withData = quotes.filter(q => q.quote_data)
  if (!withData.length) return null
  const byRecency = (a: QuoteWithAmount, b: QuoteWithAmount) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  const accepted = withData.filter(q => q.status === 'accepted').sort(byRecency)
  if (accepted.length) return accepted[0]
  const current = withData.find(q => q.is_current)
  if (current) return current
  return withData.sort(byRecency)[0]
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 20px', flex: 1, minWidth: 140 }}>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3, marginBottom: 6 }}>
        {label}
      </p>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.2rem', fontWeight: 600, color: C.text }}>
        {value}
      </p>
      {sub && (
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, marginTop: 2 }}>{sub}</p>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: C.text3, marginBottom: 4 }}>
        {label}
      </p>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text, whiteSpace: 'pre-wrap' }}>
        {value}
      </p>
    </div>
  )
}

type InvoiceInfoForm = {
  company: string
  org_nummer: string
  address: string
  invoice_email: string
  invoice_reference: string
  invoice_info_skipped: boolean
}

export default function CustomerDetailPage() {
  const params = useParams()
  const customerId = params.id as string

  const [loading, setLoading] = useState(true)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [contacts, setContacts] = useState<CustomerContact[]>([])
  const [projects, setProjects] = useState<ProjectWithDetails[]>([])

  const [invoiceEdit, setInvoiceEdit] = useState(false)
  const [invoiceForm, setInvoiceForm] = useState<InvoiceInfoForm>({ company: '', org_nummer: '', address: '', invoice_email: '', invoice_reference: '', invoice_info_skipped: false })
  const [savingInvoice, setSavingInvoice] = useState(false)

  async function fetchData() {
    const supabase = createClient()

    const [{ data: customerData, error: customerError }, contactsData] = await Promise.all([
      supabase.from('customers').select('*').eq('id', customerId).single(),
      getCustomerContacts(customerId),
    ])

    if (customerError) {
      console.error('Error fetching customer:', customerError)
      setLoading(false)
      return
    }

    setCustomer(customerData as Customer)
    setContacts(contactsData)

    const { data: projectsData, error: projectsError } = await supabase
      .from('projects')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })

    if (projectsError) {
      console.error('Error fetching projects:', projectsError)
      setLoading(false)
      return
    }

    const projectIds = (projectsData || []).map((p) => p.id)

    const [quotesResult, contractsResult] = await Promise.all([
      projectIds.length > 0
        ? supabase
            .from('quotes')
            .select('id, project_id, version, status, pdf_path, accepted_at, accepted_by, quote_data, selected_addon_ids, created_at, updated_at, is_current')
            .in('project_id', projectIds)
            .order('created_at', { ascending: false })
        : { data: [], error: null },
      projectIds.length > 0
        ? supabase
            .from('contracts')
            .select('id, project_id, status, signed_at, created_at, updated_at')
            .in('project_id', projectIds)
            .order('created_at', { ascending: false })
        : { data: [], error: null },
    ])

    const quotesByProject = new Map<string, QuoteWithAmount[]>()
    ;(quotesResult.data || []).forEach((q) => {
      const list = quotesByProject.get(q.project_id) ?? []
      list.push(q as QuoteWithAmount)
      quotesByProject.set(q.project_id, list)
    })

    const contractsByProject = new Map<string, Contract[]>()
    ;(contractsResult.data || []).forEach((c) => {
      const list = contractsByProject.get(c.project_id) ?? []
      list.push(c as Contract)
      contractsByProject.set(c.project_id, list)
    })

    setProjects(
      (projectsData || []).map((project) => ({
        ...project,
        quotes: quotesByProject.get(project.id) ?? [],
        contracts: contractsByProject.get(project.id) ?? [],
      }))
    )
    setLoading(false)
  }

  async function handleDeleteProject(project: ProjectWithDetails) {
    const extra = project.quotes.length > 0 || project.contracts.length > 0
      ? ` (inkl. ${project.quotes.length} tilbud og ${project.contracts.length} kontrakt${project.contracts.length === 1 ? '' : 'er'})`
      : ''
    if (!confirm(`Slett prosjektet "${project.title}"${extra}? Dette kan ikke angres.`)) return
    const supabase = createClient()
    const { error } = await supabase.from('projects').delete().eq('id', project.id)
    if (error) { alert('Kunne ikke slette prosjektet.'); return }
    setProjects(prev => prev.filter(p => p.id !== project.id))
  }

  function handleOpenInvoiceEdit() {
    setInvoiceForm({
      company: customer?.company ?? '',
      org_nummer: customer?.org_nummer ?? '',
      address: customer?.address ?? '',
      invoice_email: customer?.invoice_email ?? '',
      invoice_reference: customer?.invoice_reference ?? '',
      invoice_info_skipped: !!customer?.invoice_info_skipped,
    })
    setInvoiceEdit(true)
  }

  async function handleSaveInvoiceInfo() {
    if (!customer) return
    setSavingInvoice(true)
    const patch = {
      company: invoiceForm.company.trim() || null,
      org_nummer: invoiceForm.org_nummer.trim() || null,
      address: invoiceForm.address.trim() || null,
      invoice_email: invoiceForm.invoice_email.trim() || null,
      invoice_reference: invoiceForm.invoice_reference.trim() || null,
      invoice_info_skipped: invoiceForm.invoice_info_skipped,
    }
    const result = await updateCustomerInvoiceInfo(customer.id, patch)
    setSavingInvoice(false)
    if (result.ok) {
      setCustomer(prev => prev ? { ...prev, ...patch } : prev)
      setInvoiceEdit(false)
    }
  }

  async function handleDeleteQuote(quote: QuoteWithAmount) {
    if (!confirm('Slett dette tilbudet? Dette kan ikke angres.')) return
    const supabase = createClient()

    if (quote.pdf_path) {
      await supabase.storage.from('assets').remove([quote.pdf_path])
    }

    const { error } = await supabase.from('quotes').delete().eq('id', quote.id)
    if (error) { alert('Kunne ikke slette tilbud.'); return }
    fetchData()
  }

  useEffect(() => {
    if (customerId) fetchData()
  }, [customerId])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          Laster...
        </p>
      </div>
    )
  }

  if (!customer) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', color: C.text2, marginBottom: 16 }}>Kunde ikke funnet</p>
          <Link href="/admin/customers" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: C.accent, textDecoration: 'none' }}>
            Tilbake til kunder
          </Link>
        </div>
      </div>
    )
  }

  const amounts = projects
    .map(p => pickBestQuote(p.quotes))
    .filter((q): q is QuoteWithAmount => q !== null)
    .map(q => getQuoteAmountExclVat(q.quote_data!, q.selected_addon_ids ?? []))
    .filter((a): a is number => typeof a === 'number' && !Number.isNaN(a))

  const avgAmount = amounts.length > 0 ? amounts.reduce((sum, a) => sum + a, 0) / amounts.length : null
  const totalAmount = amounts.length > 0 ? amounts.reduce((sum, a) => sum + a, 0) : null

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>

        {/* Back */}
        <Link
          href="/admin/customers"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: C.text3, textDecoration: 'none', marginBottom: 28 }}
        >
          <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
          </svg>
          Kunder
        </Link>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <div style={{ width: 28, height: 1, background: C.accent }} />
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.16em', color: C.accent, textTransform: 'uppercase', fontWeight: 500 }}>
                Kunde
              </span>
              {customer.customer_number && (
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600, color: C.accent, background: C.accentBg, border: '1px solid rgba(124,92,252,0.2)', padding: '1px 7px', borderRadius: 4 }}>
                  #{customer.customer_number}
                </span>
              )}
            </div>
            <h1 style={{ fontFamily: 'var(--font-cormorant)', fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 300, fontStyle: 'italic', color: C.text, lineHeight: 1.1, marginBottom: 6 }}>
              {customer.name}
            </h1>
            {customer.company && (
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text2 }}>{customer.company}</span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, flexShrink: 0, marginTop: 4 }}>
            <Link href={`/admin/customers/${customer.id}/edit`}>
              <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '8px 16px', borderRadius: 3, cursor: 'pointer', background: 'transparent', color: C.text2, border: `1px solid ${C.border}` }}>
                Rediger
              </button>
            </Link>
            <Link href={`/admin/projects/new?customer_id=${customer.id}`}>
              <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '8px 16px', borderRadius: 3, cursor: 'pointer', background: C.accent, color: '#fff', border: 'none' }}>
                + Nytt prosjekt
              </button>
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <StatCard label="Prosjekter" value={String(projects.length)} />
          <StatCard
            label="Snittpris per prosjekt"
            value={avgAmount !== null ? formatNok(avgAmount) : '–'}
            sub={avgAmount !== null ? `eks. MVA · basert på ${amounts.length} prosjekt${amounts.length !== 1 ? 'er' : ''}` : 'Ingen tilbud med pris ennå'}
          />
          <StatCard
            label="Total omsetning"
            value={totalAmount !== null ? formatNok(totalAmount) : '–'}
            sub="eks. MVA"
          />
          <StatCard
            label="Kunde siden"
            value={new Date(customer.created_at).toLocaleDateString('nb-NO', { year: 'numeric', month: 'short', day: 'numeric' })}
          />
        </div>

        {/* Kontaktinfo + Kontaktpersoner */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '20px 22px', flex: 1, minWidth: 260 }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: C.text3, marginBottom: 14 }}>
              Kontaktinfo
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <InfoRow label="E-post" value={customer.email || '–'} />
              <InfoRow label="Telefon" value={customer.phone || '–'} />
              <InfoRow label="Adresse" value={customer.address || '–'} />
              <InfoRow label="Org.nummer" value={customer.org_nummer || '–'} />
            </div>
          </div>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '20px 22px', flex: 1, minWidth: 260 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: C.text3 }}>
                Kontaktpersoner
              </p>
              <Link href={`/admin/customers/${customer.id}/edit`} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.accent, textDecoration: 'none' }}>
                + Administrer
              </Link>
            </div>
            {contacts.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {contacts.map(c => (
                  <div key={c.id}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, color: C.text }}>{c.name}</p>
                      {c.role && (
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3 }}>{c.role}</span>
                      )}
                      {c.is_primary && (
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.58rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.accent, background: C.accentBg, padding: '1px 6px', borderRadius: 3 }}>
                          Primær
                        </span>
                      )}
                    </div>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginTop: 2 }}>
                      {c.email || 'Ingen e-post'} · {c.phone || 'Ingen telefon'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
                Ingen kontaktpersoner lagt til ennå.
              </p>
            )}
          </div>
        </div>

        {/* Fakturainformasjon — samme felt som samles inn ved signering (app/api/contracts/sign),
            vises også skrivebeskyttet på faktura-siden i Økonomi og redigerbart i Kontrakt-fanen. */}
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '20px 22px', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: invoiceEdit ? 14 : 10 }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: C.text3, margin: 0 }}>
              Fakturainformasjon
            </p>
            {!invoiceEdit && (
              <button
                onClick={handleOpenInvoiceEdit}
                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.accent, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                Rediger
              </button>
            )}
          </div>

          {invoiceEdit ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {([
                  ['company', 'Firma'],
                  ['org_nummer', 'Org.nummer'],
                  ['address', 'Fakturaadresse'],
                  ['invoice_email', 'Faktura-e-post'],
                  ['invoice_reference', 'Merking / referanse'],
                ] as const).map(([key, label]) => (
                  <div key={key} style={{ flex: '1 1 220px', minWidth: 200 }}>
                    <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 4 }}>{label}</label>
                    <input
                      value={invoiceForm[key]}
                      onChange={e => setInvoiceForm(f => ({ ...f, [key]: e.target.value }))}
                      style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 10px', outline: 'none' }}
                    />
                  </div>
                ))}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={invoiceForm.invoice_info_skipped}
                  onChange={e => setInvoiceForm(f => ({ ...f, invoice_info_skipped: e.target.checked }))}
                  style={{ accentColor: C.accent, width: 15, height: 15 }}
                />
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text2 }}>
                  Marker som «ikke klart» (må følges opp manuelt før fakturering)
                </span>
              </label>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  onClick={handleSaveInvoiceInfo}
                  disabled={savingInvoice}
                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600, padding: '7px 14px', borderRadius: 6, background: C.accent, color: '#fff', border: 'none', cursor: 'pointer', opacity: savingInvoice ? 0.6 : 1 }}
                >
                  {savingInvoice ? 'Lagrer...' : 'Lagre'}
                </button>
                <button
                  onClick={() => setInvoiceEdit(false)}
                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, background: 'none', border: `1px solid ${C.border}`, padding: '7px 12px', borderRadius: 6, cursor: 'pointer' }}
                >
                  Avbryt
                </button>
              </div>
            </div>
          ) : customer.company || customer.org_nummer || customer.address || customer.invoice_email || customer.invoice_reference ? (
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {customer.company && <InfoRow label="Firma" value={customer.company} />}
              {customer.org_nummer && <InfoRow label="Org.nummer" value={customer.org_nummer} />}
              {customer.address && <InfoRow label="Fakturaadresse" value={customer.address} />}
              {customer.invoice_email && <InfoRow label="Faktura-e-post" value={customer.invoice_email} />}
              {customer.invoice_reference && <InfoRow label="Merking / referanse" value={customer.invoice_reference} />}
            </div>
          ) : customer.invoice_info_skipped ? (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.danger, margin: 0 }}>
              ⚠ Kunden hoppet over fakturainformasjon ved signering — følg opp manuelt før fakturering.
            </p>
          ) : (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, fontStyle: 'italic', margin: 0 }}>
              Ikke oppgitt ennå.
            </p>
          )}
        </div>

        {/* Notater */}
        {customer.notes && (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '20px 22px', marginBottom: 24 }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: C.text3, marginBottom: 10 }}>
              Notater
            </p>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text2, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {customer.notes}
            </p>
          </div>
        )}

        {/* Section label */}
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: C.text3, marginBottom: 12 }}>
          {projects.length} prosjekt{projects.length !== 1 ? 'er' : ''}
        </p>

        {/* Projects */}
        {projects.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {projects.map((project) => (
              <div
                key={project.id}
                style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '18px 20px' }}
              >
                {/* Project header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: project.quotes.length > 0 || project.contracts.length > 0 ? 14 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.text }}>
                      {project.title}
                    </p>
                    <Badge status={project.status} label={statusLabel[project.status] ?? project.status} />
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3 }}>
                      {new Date(project.created_at).toLocaleDateString('nb-NO', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <Link href={`/admin/projects/${project.id}?from=/admin/customers/${customerId}`}>
                      <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '6px 12px', borderRadius: 3, cursor: 'pointer', background: C.accent, color: '#fff', border: 'none' }}>
                        Åpne
                      </button>
                    </Link>
                    <button
                      onClick={() => handleDeleteProject(project)}
                      title="Slett prosjekt"
                      style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '6px 12px', borderRadius: 3, cursor: 'pointer', background: 'rgba(224,85,85,0.1)', color: C.danger, border: '1px solid rgba(224,85,85,0.25)' }}
                    >
                      Slett
                    </button>
                  </div>
                </div>

                {/* Quotes */}
                {project.quotes.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: C.text3, marginBottom: 6 }}>
                      Tilbud
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {project.quotes.map((quote) => {
                        const supabase = createClient()
                        const pdfUrl = quote.pdf_path
                          ? supabase.storage.from('assets').getPublicUrl(quote.pdf_path).data.publicUrl
                          : null
                        return (
                          <div
                            key={quote.id}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 4 }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600, color: C.text }}>
                                {quote.version || 'V1'}
                              </span>
                              <Badge
                                status={quote.status === 'accepted' ? 'published' : 'draft'}
                                label={quoteStatusLabel[quote.status] ?? quote.status}
                              />
                              {pdfUrl && (
                                <a
                                  href={pdfUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.accent, textDecoration: 'underline' }}
                                >
                                  Se PDF
                                </a>
                              )}
                              {quote.accepted_at && (
                                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3 }}>
                                  Akseptert {new Date(quote.accepted_at).toLocaleDateString('nb-NO')}
                                </span>
                              )}
                              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3 }}>
                                {new Date(quote.created_at).toLocaleDateString('nb-NO', { year: 'numeric', month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                            <button
                              onClick={() => handleDeleteQuote(quote)}
                              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 500, padding: '4px 10px', borderRadius: 3, cursor: 'pointer', background: 'rgba(224,85,85,0.1)', color: C.danger, border: '1px solid rgba(224,85,85,0.25)', flexShrink: 0 }}
                            >
                              Slett
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Contracts */}
                {project.contracts.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: C.text3, marginBottom: 6 }}>
                      Kontrakter
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {project.contracts.map((contract) => (
                        <div
                          key={contract.id}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 4 }}
                        >
                          <Badge
                            status={contract.status === 'signed' ? 'published' : 'draft'}
                            label={contract.status === 'signed' ? 'Signert' : contract.status === 'sent' ? 'Sendt' : 'Ventende'}
                          />
                          {contract.signed_at && (
                            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3 }}>
                              Signert {new Date(contract.signed_at).toLocaleDateString('nb-NO')}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '48px 24px', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text3, marginBottom: 16 }}>
              Ingen prosjekter for denne kunden ennå
            </p>
            <Link href={`/admin/projects/new?customer_id=${customer.id}`}>
              <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', padding: '9px 20px', borderRadius: 3, cursor: 'pointer', background: C.accent, color: '#fff', border: 'none' }}>
                Opprett første prosjekt
              </button>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
