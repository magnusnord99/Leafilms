'use client'

import { useEffect, useRef, useState, use } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Project, TeamMember, Customer, QuoteBuilderData, CrewMember, PriceCatalogItem, DiscountFactor } from '@/lib/types'
import { QuoteBuilder, createEmptyBuilderData } from '@/components/quote/QuoteBuilder'
import QuoteChat from '@/components/quote/QuoteChat'
import { convertBuilderDataToQuoteData } from '@/lib/quote-builder-utils'
import { C } from '@/lib/admin-theme'

type Props = {
  params: Promise<{ id: string }>
}

export default function ProjectQuotePage({ params }: Props) {
  const { id: projectId } = use(params)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generatingPDF, setGeneratingPDF] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const [project, setProject] = useState<Project | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [priceCatalog, setPriceCatalog] = useState<PriceCatalogItem[]>([])
  const [discountFactors, setDiscountFactors] = useState<DiscountFactor[]>([])
  const [builderData, setBuilderData] = useState<QuoteBuilderData | null>(null)
  const [existingQuoteId, setExistingQuoteId] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<{ id: string; name: string | null }[]>([])
  // Hindrer at samtidige "Lagre tilbud" + "Generer PDF"-kall begge tror det ikke finnes
  // en rad ennå og oppretter to quotes-rader for samme prosjekt (én av dem tom).
  const savingRef = useRef(false)

  useEffect(() => {
    loadAll()
  }, [projectId])

  async function loadAll() {
    setLoading(true)
    try {
      const [projectRes, teamRes, customersRes, quoteRes, sectionsRes, catalogRes, discountFactorsRes, profilesRes] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase.from('team_members').select('*').order('order_index'),
        supabase.from('customers').select('*').order('name'),
        supabase.from('quotes').select('*').eq('project_id', projectId)
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('sections').select('id, type').eq('project_id', projectId)
          .eq('type', 'team').maybeSingle(),
        supabase.from('price_catalog').select('*').order('category').order('name'),
        supabase.from('discount_factors').select('*').order('shoot_day'),
        supabase.from('profiles').select('id, name').returns<{ id: string; name: string | null }[]>(),
      ])

      const proj = projectRes.data as Project | null
      const members = (teamRes.data || []) as TeamMember[]
      const custs = (customersRes.data || []) as Customer[]
      const existingQuote = quoteRes.data

      setProject(proj)
      setTeamMembers(members)
      setCustomers(custs)
      setPriceCatalog((catalogRes.data || []) as PriceCatalogItem[])
      setDiscountFactors((discountFactorsRes.data || []) as DiscountFactor[])
      setProfiles((profilesRes.data ?? []) as { id: string; name: string | null }[])

      if (existingQuote?.quote_data && existingQuote.quote_data.crew !== undefined) {
        // Existing quote — backfill deliveryDescription from project if missing
        const qd = existingQuote.quote_data as QuoteBuilderData
        if (!qd.deliveryDescription && proj?.delivery_description) {
          qd.deliveryDescription = proj.delivery_description
        }
        setBuilderData(qd)
        setExistingQuoteId(existingQuote.id)
      } else {
        // No existing quote — create initial data pre-populated from project team section
        const initial = createEmptyBuilderData(proj?.title || '')
        if (proj?.delivery_description) {
          initial.deliveryDescription = proj.delivery_description
        }

        // Pre-populate customer if project has one
        if (proj?.customer_id) {
          const customer = custs.find(c => c.id === proj.customer_id)
          if (customer) {
            initial.clientContact = customer.name
            initial.customerNumber = String(customer.customer_number)
          }
        }

        // Pre-populate crew from project's team section
        if (sectionsRes.data?.id) {
          const { data: sectionMembers } = await supabase
            .from('section_team_members')
            .select('team_member_id')
            .eq('section_id', sectionsRes.data.id)
            .order('order_index')

          if (sectionMembers && sectionMembers.length > 0) {
            const memberIds = sectionMembers.map((r: { team_member_id: string }) => r.team_member_id)
            const crew: CrewMember[] = memberIds
              .map((mid: string) => members.find(m => m.id === mid))
              .filter((m): m is TeamMember => m !== undefined)
              .map((m) => ({
                id: crypto.randomUUID(),
                role: m.role,
                name: m.name,
                dailyRate: m.daily_rate ?? 0,
                days: 1,
              }))
            initial.crew = crew
          }
        }

        const profiles = (profilesRes.data ?? []) as { id: string; name: string | null }[]
        const projAny = proj as typeof proj & {
          shoot_end?: string | null
          project_lead_id?: string | null
          quote_assignee_id?: string | null
        }

        // ourContact: project_lead → quote_assignee → fallback
        if (!initial.ourContact || initial.ourContact === 'Bea Valand') {
          const leadId = projAny.project_lead_id ?? projAny.quote_assignee_id
          const lead = leadId ? profiles.find(p => p.id === leadId) : null
          if (lead?.name) initial.ourContact = lead.name
        }

        // deliveryDate: shoot_end
        if (!initial.deliveryDate && projAny.shoot_end) {
          initial.deliveryDate = projAny.shoot_end
        }

        // language
        if (proj?.language === 'en') initial.language = 'EN'
        else initial.language = 'NO'

        // reference
        const typeMap: Record<string, string> = {
          video: 'Video produksjon',
          photo: 'Fotoproduksjon',
          mixed: 'Video og fotoproduksjon',
        }
        if (proj?.project_type && typeMap[proj.project_type]) {
          initial.reference = typeMap[proj.project_type]
        }

        setBuilderData(initial)
      }
    } catch (err) {
      console.error('Error loading quote page:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave(data: QuoteBuilderData) {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setSaveMessage(null)
    try {
      const converted = convertBuilderDataToQuoteData(data)
      const record = {
        project_id: projectId,
        sheet_url: '',
        version: data.version || 'V1',
        status: 'draft' as const,
        quote_data: data, // Store raw builder data for future editing
      }

      if (existingQuoteId) {
        await supabase.from('quotes').update({ ...record, quote_data: data }).eq('id', existingQuoteId)
      } else {
        const { data: newQuote } = await supabase.from('quotes').insert(record).select('id').single()
        if (newQuote) setExistingQuoteId(newQuote.id)
      }

      // Synkroniser leveransebeskrivelse til prosjektet
      if (data.deliveryDescription?.trim()) {
        await supabase.from('projects')
          .update({ delivery_description: data.deliveryDescription.trim() })
          .eq('id', projectId)
      }

      // Keep a converted copy in quote_data so the public QuoteSection can display it
      // (overwrite with merged object: raw builder data IS quote_data, used for both edit and display)
      setSaveMessage('Lagret!')
      setTimeout(() => setSaveMessage(null), 3000)
    } catch (err) {
      console.error('Save error:', err)
      setSaveMessage('Feil ved lagring')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  async function handleGeneratePDF(data: QuoteBuilderData) {
    setGeneratingPDF(true)
    try {
      await handleSave(data)
      const converted = convertBuilderDataToQuoteData(data)

      const response = await fetch('/api/generate-quote-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          builderData: data,
          projectId,
          language: data.language,
          mva: data.includeVat ? 'y' : 'n',
          saveToStorage: true,
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Kunne ikke generere PDF')
      }

      const storagePath = response.headers.get('X-Storage-Path')
      if (storagePath && existingQuoteId) {
        await supabase.from('quotes').update({ pdf_path: storagePath }).eq('id', existingQuoteId)
      }

      const blob = await response.blob()
      const contentDisposition = response.headers.get('Content-Disposition')
      const xFilename = response.headers.get('X-Filename')
      let filename = `Pristilbud_${project?.title || 'Prosjekt'}_${new Date().toISOString().split('T')[0]}.pdf`
      if (contentDisposition) {
        const m = contentDisposition.match(/filename="(.+)"/)
        if (m) filename = m[1]
      } else if (xFilename) {
        filename = xFilename
      }

      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Kunne ikke generere PDF')
    } finally {
      setGeneratingPDF(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          Laster...
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-6 md:p-10" style={{ background: C.bg, color: C.text }}>
      <div className="max-w-4xl mx-auto">
        {/* Top bar */}
        <div
          className="flex items-center justify-between mb-8 pb-4"
          style={{ borderBottom: `1px solid ${C.border}` }}
        >
          <div className="flex items-center gap-4">
            <Link
              href={`/admin/projects/${projectId}`}
              className="flex items-center gap-1.5 transition-colors"
              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: C.text3 }}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
              </svg>
              Tilbake
            </Link>
            <div style={{ width: 1, height: 16, background: C.border }} />
            <div>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, color: C.text }}>
                Pristilbud
              </p>
              {project?.title && (
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, letterSpacing: '0.08em', marginTop: 1 }}>
                  {project.title}
                </p>
              )}
            </div>
          </div>

          {saveMessage && (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: saveMessage.startsWith('Feil') ? '#B84040' : C.accent, letterSpacing: '0.1em' }}>
              {saveMessage}
            </p>
          )}
        </div>

        {/* Builder */}
        {builderData && (
          <QuoteBuilder
            initialData={builderData}
            teamMembers={teamMembers}
            customers={customers}
            priceCatalog={priceCatalog}
            discountFactors={discountFactors}
            onSave={handleSave}
            onGeneratePDF={handleGeneratePDF}
            saving={saving}
            generatingPDF={generatingPDF}
          />
        )}

        {/* Chat — kun synlig etter tilbudet er lagret første gang */}
        {existingQuoteId && (
          <QuoteChat
            quoteId={existingQuoteId}
            projectId={projectId}
            profiles={profiles}
          />
        )}
      </div>
    </div>
  )
}
