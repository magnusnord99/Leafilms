'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-client'
import { C } from '@/lib/admin-theme'
import { Customer, Project, Quote, Contract } from '@/lib/types'

type ProjectWithDetails = Project & { quotes: Quote[]; contracts: Contract[] }

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

export default function CustomerProjectsPage() {
  const params = useParams()
  const customerId = params.id as string

  const [loading, setLoading] = useState(true)
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [projects, setProjects] = useState<ProjectWithDetails[]>([])

  async function fetchData() {
    const supabase = createClient()

    const { data: customerData, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .single()

    if (customerError) {
      console.error('Error fetching customer:', customerError)
      setLoading(false)
      return
    }

    setCustomer(customerData as Customer)

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
            .select('id, project_id, version, status, pdf_path, accepted_at, accepted_by, quote_data, created_at, updated_at')
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

    const quotesByProject = new Map<string, Quote[]>()
    ;(quotesResult.data || []).forEach((q) => {
      const list = quotesByProject.get(q.project_id) ?? []
      list.push(q as Quote)
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

  async function handleDeleteQuote(quote: Quote) {
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
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 32 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
              <div style={{ width: 28, height: 1, background: C.accent }} />
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.16em', color: C.accent, textTransform: 'uppercase', fontWeight: 500 }}>
                Kunde
              </span>
            </div>
            <h1 style={{ fontFamily: 'var(--font-cormorant)', fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 300, fontStyle: 'italic', color: C.text, lineHeight: 1.1, marginBottom: 6 }}>
              {customer.name}
            </h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 16px' }}>
              {customer.company && (
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text2 }}>{customer.company}</span>
              )}
              {customer.email && (
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>{customer.email}</span>
              )}
              {customer.phone && (
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>{customer.phone}</span>
              )}
            </div>
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
                    <Link href={`/admin/projects/${project.id}?from=/admin/customers/${customerId}/projects`}>
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
