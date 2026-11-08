'use client'

import { useEffect, useRef, useState, use } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Project, TeamMember, Customer, QuoteBuilderData, CrewMember, PriceCatalogItem, DiscountFactor, Quote, EquipmentGroupWithItems, SalesFlyerPackageCategory } from '@/lib/types'
import { QuoteBuilder, createEmptyBuilderData } from '@/components/quote/QuoteBuilder'
import QuoteChat from '@/components/quote/QuoteChat'
import { convertBuilderDataToQuoteData, pickBestQuote, addonTotalPrice } from '@/lib/quote-builder-utils'
import { C } from '@/lib/admin-theme'
import { usePublishing } from '@/hooks/project/usePublishing'
import { PipelineProgress } from '@/components/admin/PipelineProgress'
import { markQuoteAsPackage, checkQuoteUsedOnPublishedFlyers, unmarkQuoteAsPackage, duplicatePackageAsNewProject } from '@/lib/actions/quote-packages'

// Samme kategori-tekster som Pakkemaler-fanen i /admin/quotes.
const PACKAGE_CATEGORY_LABEL: Record<SalesFlyerPackageCategory, string> = {
  foto: 'Bilder',
  film: 'Film',
  foto_film: 'Bilder og film',
}

type Props = {
  params: Promise<{ id: string }>
}

export default function ProjectQuotePage({ params }: Props) {
  const { id: projectId } = use(params)
  const searchParams = useSearchParams()
  const router = useRouter()
  const forceOpenChat = searchParams?.get('chat') === '1'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generatingPDF, setGeneratingPDF] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const [project, setProject] = useState<Project | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [priceCatalog, setPriceCatalog] = useState<PriceCatalogItem[]>([])
  const [equipmentGroups, setEquipmentGroups] = useState<EquipmentGroupWithItems[]>([])
  const [discountFactors, setDiscountFactors] = useState<DiscountFactor[]>([])
  const [builderData, setBuilderData] = useState<QuoteBuilderData | null>(null)
  const [existingQuoteId, setExistingQuoteId] = useState<string | null>(null)
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [profiles, setProfiles] = useState<{ id: string; name: string | null; email: string }[]>([])
  const [shareLink, setShareLink] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  // Kun for å vise en forklarende tekst ved publisering — se hasAnySections-sjekken under.
  const [hasAnySections, setHasAnySections] = useState(true)
  const { publishing, togglePublish } = usePublishing(project, setProject, shareLink, setShareLink, projectId)
  // Hindrer at samtidige "Lagre tilbud" + "Generer PDF"-kall begge tror det ikke finnes
  // en rad ennå og oppretter to quotes-rader for samme prosjekt (én av dem tom).
  const savingRef = useRef(false)

  // Pakke-merking — se Task 4 (lib/actions/quote-packages.ts) og Task 6 (Pakkemaler-fanen
  // i /admin/quotes som lenker hit med ?quote=<id>).
  const [pkgLabel, setPkgLabel] = useState('')
  const [pkgCategory, setPkgCategory] = useState<SalesFlyerPackageCategory>('foto')
  const [pkgSaving, setPkgSaving] = useState(false)
  const [pkgError, setPkgError] = useState<string | null>(null)
  const [unmarking, setUnmarking] = useState(false)
  // Non-null => bekreftelsesdialogen vises, med listen over flyer-slugs som bruker den.
  const [unmarkConfirmSlugs, setUnmarkConfirmSlugs] = useState<string[] | null>(null)
  const [showDuplicate, setShowDuplicate] = useState(false)
  // '' = "ny kunde" valgt i selecten (se duplicateNewName under)
  const [duplicateCustomerId, setDuplicateCustomerId] = useState('')
  const [duplicateNewName, setDuplicateNewName] = useState('')
  const [duplicating, setDuplicating] = useState(false)
  const [duplicateError, setDuplicateError] = useState<string | null>(null)

  useEffect(() => {
    loadAll()
  }, [projectId])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null))
  }, [])

  async function loadAll() {
    setLoading(true)
    // Nullstill tilbuds-tilstand fra forrige prosjekt — ellers kan existingQuoteId
    // henge igjen fra et annet prosjekt hvis det nye prosjektet ikke har noe tilbud ennå,
    // og handleSave/QuoteChat ville da operert på feil prosjekts tilbud.
    setExistingQuoteId(null)
    setBuilderData(null)
    try {
      const [projectRes, teamRes, customersRes, quoteRes, sectionsRes, catalogRes, equipmentGroupsRes, discountFactorsRes, profilesRes, shareRes, sectionCountRes] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase.from('team_members').select('*').order('order_index'),
        supabase.from('customers').select('*').order('name'),
        supabase.from('quotes').select('*').eq('project_id', projectId)
          .order('created_at', { ascending: true }),
        supabase.from('sections').select('id, type').eq('project_id', projectId)
          .eq('type', 'team').maybeSingle(),
        supabase.from('price_catalog').select('*').order('category').order('name'),
        supabase.from('equipment_groups').select('*, items:equipment_group_items(*, catalog_item:price_catalog(*))').order('name'),
        supabase.from('discount_factors').select('*').order('shoot_day'),
        supabase.from('profiles').select('id, name, email').returns<{ id: string; name: string | null; email: string }[]>(),
        supabase.from('project_shares').select('token').eq('project_id', projectId).maybeSingle(),
        supabase.from('sections').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
      ])
      setHasAnySections((sectionCountRes.count ?? 0) > 0)

      const proj = projectRes.data as Project | null
      const members = (teamRes.data || []) as TeamMember[]
      const custs = (customersRes.data || []) as Customer[]
      const allQuotes = (quoteRes.data || []) as Quote[]
      // En ?quote=<id>-param (fra pakke-malenes liste i /admin/quotes, se Task 6 i
      // sales-flyers-planen) velger et spesifikt tilbud eksplisitt — nødvendig fordi
      // flere pakke-maler kan dele samme skjulte prosjekt, og da er de alle is_current,
      // så pickBestQuote alene ikke kunne skille dem fra hverandre. Faller tilbake til
      // vanlig oppslag når parameteren er borte eller ikke treffer noe tilbud på dette
      // prosjektet — ingen endring i oppførsel for alle andre prosjektsider.
      const requestedQuoteId = searchParams?.get('quote')
      const requestedQuote = requestedQuoteId ? allQuotes.find(q => q.id === requestedQuoteId) : undefined
      // Et akseptert/signert tilbud vinner alltid over "gjeldende versjon" —
      // ellers åpnes plutselig et nyere, usignert tilleggstilbud som om DET var
      // det kunden hadde akseptert (feedback 08a0235b).
      const existingQuote = requestedQuote ?? pickBestQuote(allQuotes)

      const shareToken = (shareRes.data as { token: string } | null)?.token
      setShareLink(shareToken ? `${window.location.origin}/p/${shareToken}` : null)

      setProject(proj)
      setQuotes(allQuotes)
      setTeamMembers(members)
      setCustomers(custs)
      setPriceCatalog((catalogRes.data || []) as PriceCatalogItem[])
      setEquipmentGroups((equipmentGroupsRes.data || []) as EquipmentGroupWithItems[])
      setDiscountFactors((discountFactorsRes.data || []) as DiscountFactor[])
      setProfiles((profilesRes.data ?? []) as { id: string; name: string | null; email: string }[])

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
        // Prefyll fra pitchens leveranseliste hvis den allerede er satt (samme felt som
        // postprod/pitch-siden leser — se docs/superpowers/specs/2026-09-07-unified-deliverables-list-design.md §5).
        if (proj?.deliverables && proj.deliverables.length > 0) {
          initial.deliverables = proj.deliverables
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

        const profiles = (profilesRes.data ?? []) as { id: string; name: string | null; email: string }[]
        const projAny = proj as typeof proj & {
          shoot_end?: string | null
          project_lead_id?: string | null
          quote_assignee_id?: string | null
        }

        // ourContact: project_lead → quote_assignee → fallback
        if (!initial.ourContact) {
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
        quote_data: data, // Store raw builder data for future editing
      }

      if (existingQuoteId) {
        // Et allerede akseptert/avslått tilbud er kundens faktiske svar — å lagre en
        // redigering (eller generere PDF på nytt, se handleGeneratePDF som alltid
        // kaller handleSave først) skal ALDRI stille det tilbake til kladd under dem.
        // Kun kladd/sendte tilbud settes til 'draft' igjen ved lagring (feedback 08a0235b).
        const currentStatus = quotes.find(q => q.id === existingQuoteId)?.status
        const preserveStatus = currentStatus === 'accepted' || currentStatus === 'rejected'
        const updatePayload = preserveStatus ? record : { ...record, status: 'draft' as const }
        const { error: updateError } = await supabase.from('quotes').update(updatePayload).eq('id', existingQuoteId)
        if (updateError) throw updateError
        setQuotes(prev => prev.map(q => q.id === existingQuoteId ? { ...q, version: record.version, quote_data: data } : q))
      } else {
        // Første tilbud for prosjektet — blir automatisk gjeldende versjon
        const { data: newQuote, error: insertError } = await supabase.from('quotes').insert({ ...record, status: 'draft' as const, is_current: true, created_by: currentUserId }).select('*').single()
        if (insertError) throw insertError
        setExistingQuoteId(newQuote.id)
        setQuotes(prev => [...prev, newQuote as Quote])
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

  function handleSwitchVersion(quoteId: string) {
    if (quoteId === existingQuoteId) return
    const target = quotes.find(q => q.id === quoteId)
    if (!target?.quote_data) return
    setExistingQuoteId(quoteId)
    setBuilderData(target.quote_data as unknown as QuoteBuilderData)
    setSaveMessage(null)
  }

  async function handleDuplicateVersion() {
    if (!builderData) return
    setSaving(true)
    try {
      const newVersion = `V${quotes.length + 1}`
      const newData: QuoteBuilderData = { ...builderData, version: newVersion }

      await supabase.from('quotes').update({ is_current: false }).eq('project_id', projectId)
      const { data: newQuote, error } = await supabase.from('quotes').insert({
        project_id: projectId,
        sheet_url: '',
        version: newVersion,
        status: 'draft' as const,
        quote_data: newData,
        is_current: true,
        created_by: currentUserId,
      }).select('*').single()

      if (error || !newQuote) {
        console.error('Duplicate version error:', error)
        setSaveMessage('Feil ved oppretting av ny versjon')
        return
      }

      setQuotes(prev => [...prev.map(q => ({ ...q, is_current: false })), newQuote as Quote])
      setExistingQuoteId(newQuote.id)
      setBuilderData(newData)
    } finally {
      setSaving(false)
    }
  }

  async function handleSetCurrentVersion(quoteId: string) {
    await supabase.from('quotes').update({ is_current: false }).eq('project_id', projectId)
    await supabase.from('quotes').update({ is_current: true }).eq('id', quoteId)
    setQuotes(prev => prev.map(q => ({ ...q, is_current: q.id === quoteId })))
  }

  async function handleLabelChange(quoteId: string, label: string) {
    const trimmed = label.trim() || null
    setQuotes(prev => prev.map(q => q.id === quoteId ? { ...q, label: trimmed } : q))
    await supabase.from('quotes').update({ label: trimmed }).eq('id', quoteId)
  }

  async function handleDeleteVersion(quoteId: string) {
    const target = quotes.find(q => q.id === quoteId)
    if (!target || target.status !== 'draft') return
    if (!confirm(`Slette ${target.label ? `${target.version} — ${target.label}` : target.version}? Dette kan ikke angres.`)) return

    await supabase.from('quotes').delete().eq('id', quoteId)
    const remaining = quotes.filter(q => q.id !== quoteId)

    if (existingQuoteId === quoteId) {
      const fallback = remaining[remaining.length - 1]
      if (fallback && target.is_current) {
        await supabase.from('quotes').update({ is_current: true }).eq('id', fallback.id)
        fallback.is_current = true
      }
      if (fallback) {
        setExistingQuoteId(fallback.id)
        setBuilderData(fallback.quote_data as unknown as QuoteBuilderData)
      } else {
        // Slettet det eneste tilbudet — tilbake til "ingen tilbud ennå"-tilstanden,
        // samme oppsett som loadAll() bygger når prosjektet aldri har hatt et tilbud.
        setExistingQuoteId(null)
        const initial = createEmptyBuilderData(project?.title || '')
        if (project?.delivery_description) initial.deliveryDescription = project.delivery_description
        if (project?.deliverables && project.deliverables.length > 0) initial.deliverables = project.deliverables
        setBuilderData(initial)
      }
    }
    setQuotes(remaining)
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

  // Det lastede tilbudet (hvis noe), for pakke-panelet under.
  const activeQuote = quotes.find(q => q.id === existingQuoteId) ?? null

  async function handleMarkAsPackage() {
    if (!activeQuote) return
    const label = pkgLabel.trim()
    if (!label) {
      setPkgError('Pakken må ha et navn')
      return
    }
    setPkgSaving(true)
    setPkgError(null)
    try {
      const result = await markQuoteAsPackage(activeQuote.id, { package_label: label, package_category: pkgCategory })
      if ('error' in result) {
        setPkgError(result.error)
        return
      }
      setQuotes(prev => prev.map(q => q.id === activeQuote.id ? { ...q, package_label: label, package_category: pkgCategory } : q))
      setPkgLabel('')
    } finally {
      setPkgSaving(false)
    }
  }

  async function doUnmark() {
    if (!activeQuote) return
    const result = await unmarkQuoteAsPackage(activeQuote.id)
    if ('error' in result) {
      setPkgError(result.error)
      return
    }
    setQuotes(prev => prev.map(q => q.id === activeQuote.id ? { ...q, package_label: null, package_category: null, package_order: 0 } : q))
    setUnmarkConfirmSlugs(null)
  }

  async function handleUnmarkClick() {
    if (!activeQuote) return
    setUnmarking(true)
    setPkgError(null)
    try {
      const { flyerSlugs } = await checkQuoteUsedOnPublishedFlyers(activeQuote.id)
      if (flyerSlugs.length > 0) {
        setUnmarkConfirmSlugs(flyerSlugs)
        return
      }
      await doUnmark()
    } finally {
      setUnmarking(false)
    }
  }

  async function handleConfirmUnmark() {
    setUnmarking(true)
    try {
      await doUnmark()
    } finally {
      setUnmarking(false)
    }
  }

  function openDuplicateModal() {
    setDuplicateCustomerId('')
    setDuplicateNewName('')
    setDuplicateError(null)
    setShowDuplicate(true)
  }

  async function handleDuplicateSubmit() {
    if (!activeQuote) return
    const customer = duplicateCustomerId
      ? { existingCustomerId: duplicateCustomerId }
      : { newCustomerName: duplicateNewName.trim() }
    if (!duplicateCustomerId && !('newCustomerName' in customer && customer.newCustomerName)) {
      setDuplicateError('Velg en eksisterende kunde, eller skriv inn navn på en ny kunde')
      return
    }
    setDuplicating(true)
    setDuplicateError(null)
    try {
      const result = await duplicatePackageAsNewProject(activeQuote.id, customer)
      if ('error' in result) {
        setDuplicateError(result.error)
        return
      }
      setShowDuplicate(false)
      router.push(`/admin/projects/${result.projectId}/quote?quote=${result.quoteId}`)
    } finally {
      setDuplicating(false)
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

        {/* Stegmeny — samme som prosjektoversikten, for å bla mellom stegene uten å måtte om via den */}
        {project?.pipeline_stage && (
          <div className="mb-6">
            <PipelineProgress currentStage={project.pipeline_stage} projectId={projectId} />
          </div>
        )}

        {/* Signeringslenke — publiser prosjektet og hent kunde-lenken direkte herfra,
            uten å måtte innom pitch-editoren (feedback ba2012b0). */}
        <div
          className="flex items-center justify-between gap-3 mb-6"
          style={{ padding: '12px 16px', borderRadius: 8, background: C.surface, border: `1px solid ${C.border}` }}
        >
          {shareLink ? (
            <>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#4CAF7D', marginBottom: 3 }}>
                  Publisert
                </p>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {shareLink}
                </p>
              </div>
              <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(shareLink); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000) }}
                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: C.accentBg, color: C.accent, border: '1px solid rgba(124,92,252,0.25)' }}
                >
                  {linkCopied ? 'Kopiert ✓' : 'Kopier lenke'}
                </button>
                <button
                  type="button"
                  onClick={togglePublish}
                  disabled={publishing}
                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: 'transparent', color: C.text3, border: `1px solid ${C.border}`, opacity: publishing ? 0.6 : 1 }}
                >
                  Avpubliser
                </button>
              </div>
            </>
          ) : (
            <>
              <div>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text2 }}>
                  Ikke publisert — kunden kan ikke se tilbudet eller signere ennå.
                </p>
                {!hasAnySections && (
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginTop: 4 }}>
                    Prosjektet har ingen pitch — kunden får en enkel side med kun tilbud og signering.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={togglePublish}
                disabled={publishing}
                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, padding: '7px 14px', borderRadius: 6, cursor: 'pointer', background: C.accent, color: '#fff', border: 'none', opacity: publishing ? 0.6 : 1, flexShrink: 0 }}
              >
                {publishing ? 'Publiserer …' : 'Publiser og lag signeringslenke →'}
              </button>
            </>
          )}
        </div>

        {/* Versjoner */}
        {quotes.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-6">
            {quotes.map(q => {
              const active = q.id === existingQuoteId
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => handleSwitchVersion(q.id)}
                  title={q.is_current ? 'Dette er den gjeldende versjonen' : undefined}
                  className="flex items-center gap-1.5"
                  style={{
                    fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem',
                    padding: '5px 10px', borderRadius: 3, cursor: 'pointer',
                    background: active ? C.accent : C.surface,
                    color: active ? C.bg : C.text2,
                    border: `1px solid ${q.is_current ? C.accent : (active ? C.accent : C.border)}`,
                  }}
                >
                  {q.version}{q.label ? ` — ${q.label}` : ''}
                  {q.is_current && (
                    <span
                      style={{
                        fontFamily: 'var(--font-dm-sans)', fontSize: '0.58rem', fontWeight: 700,
                        letterSpacing: '0.08em', textTransform: 'uppercase',
                        padding: '2px 6px', borderRadius: 2, flexShrink: 0,
                        color: '#4CAF7D', background: 'rgba(76,175,125,0.16)',
                        border: '1px solid rgba(76,175,125,0.4)',
                      }}
                    >
                      Gjeldende
                    </span>
                  )}
                </button>
              )
            })}
            <button
              type="button"
              onClick={handleDuplicateVersion}
              disabled={saving}
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem',
                padding: '5px 10px', borderRadius: 3, cursor: 'pointer',
                background: 'transparent', color: C.accent, border: `1px dashed ${C.accent}`,
              }}
            >
              + Nytt tilbud
            </button>

            {existingQuoteId && (() => {
              const active = quotes.find(q => q.id === existingQuoteId)
              if (!active) return null
              const creator = active.created_by ? profiles.find(p => p.id === active.created_by) : null
              return (
                <div className="flex items-center gap-2 ml-2">
                  {creator && (
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3 }} title={`Opprettet ${new Date(active.created_at).toLocaleDateString('nb-NO')}`}>
                      Opprettet av {creator.name ?? creator.email}
                    </span>
                  )}
                  <input
                    defaultValue={active.label ?? ''}
                    placeholder="Notat (f.eks. 2 filmer)"
                    onBlur={e => handleLabelChange(active.id, e.target.value)}
                    style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: '1rem',
                      padding: '5px 8px', borderRadius: 3, background: C.surface,
                      border: `1px solid ${C.border}`, color: C.text, width: 160,
                    }}
                  />
                  {!active.is_current && (
                    <button
                      type="button"
                      onClick={() => handleSetCurrentVersion(active.id)}
                      style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      Sett som gjeldende
                    </button>
                  )}
                  {active.status === 'draft' && (
                    <button
                      type="button"
                      onClick={() => handleDeleteVersion(active.id)}
                      style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#B84040', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    >
                      Slett
                    </button>
                  )}
                </div>
              )
            })()}
          </div>
        )}

        {/* Kundens valg — tydelig oppsummering av hvilke tilvalg kunden har akseptert/haket
            av, siden det ellers ikke er synlig noe sted uten å lete gjennom hele
            tilbudsbyggeren manuelt (feedback 08a0235b). Kun for tilbud kunden faktisk har
            svart på (akseptert/avslått) — kladder har ingen kundevalg å vise ennå. */}
        {existingQuoteId && builderData && (() => {
          const active = quotes.find(q => q.id === existingQuoteId)
          if (!active || (active.status !== 'accepted' && active.status !== 'rejected')) return null
          const selectedIds = new Set(active.selected_addon_ids ?? [])
          const selectedAddons = (builderData.optionalAddons ?? []).filter(a => selectedIds.has(a.id))
          const total = selectedAddons.reduce((sum, a) => sum + addonTotalPrice(a), 0)
          const formatNOK = (n: number) => new Intl.NumberFormat('no-NO', { style: 'currency', currency: 'NOK', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
          const isAccepted = active.status === 'accepted'
          return (
            <div style={{
              marginBottom: 20, padding: '14px 18px', borderRadius: 8,
              background: isAccepted ? 'rgba(76,175,125,0.08)' : 'rgba(184,64,64,0.08)',
              border: `1px solid ${isAccepted ? 'rgba(76,175,125,0.3)' : 'rgba(184,64,64,0.3)'}`,
            }}>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: isAccepted ? '#4CAF7D' : '#B84040', marginBottom: 6 }}>
                {isAccepted ? '✓ Akseptert av kunden' : '✗ Avslått av kunden'}
                {active.accepted_at && ` — ${new Date(active.accepted_at).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })}`}
                {active.accepted_by ? ` (${active.accepted_by})` : ''}
              </p>
              {isAccepted && (
                selectedAddons.length > 0 ? (
                  <>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text2, marginBottom: 6 }}>
                      Kunden valgte {selectedAddons.length} tilvalg:
                    </p>
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {selectedAddons.map(a => (
                        <li key={a.id} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text, marginBottom: 3 }}>
                          {a.description || '(uten beskrivelse)'} — {formatNOK(addonTotalPrice(a))}
                        </li>
                      ))}
                    </ul>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text2, marginTop: 8, fontWeight: 600 }}>
                      Sum tilvalg: {formatNOK(total)}
                    </p>
                  </>
                ) : (
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text2 }}>
                    Ingen valgfrie tilvalg ble haket av — kunden aksepterte kun grunnpakken.
                  </p>
                )
              )}
            </div>
          )
        })()}

        {/* Pakke-merking — gjør tilbudet til en gjenbrukbar pakke-mal for salgsflyere
            (sales-flyers-planen, Task 7). Kun synlig når tilbudet faktisk er lagret. */}
        {activeQuote && (
          <div
            className="mb-6"
            style={{ padding: '14px 18px', borderRadius: 8, background: C.surface, border: `1px solid ${C.border}` }}
          >
            {activeQuote.package_label ? (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.accent, marginBottom: 3 }}>
                    Pakke-mal
                  </p>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text }}>
                    {activeQuote.package_label}
                    <span style={{ color: C.text3, marginLeft: 8, fontSize: '0.72rem' }}>
                      ({activeQuote.package_category ? PACKAGE_CATEGORY_LABEL[activeQuote.package_category] : '—'})
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={openDuplicateModal}
                    style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: C.accentBg, color: C.accent, border: '1px solid rgba(124,92,252,0.25)' }}
                  >
                    Dupliser som nytt tilbud
                  </button>
                  <button
                    type="button"
                    onClick={handleUnmarkClick}
                    disabled={unmarking}
                    style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', padding: '6px 12px', borderRadius: 6, cursor: unmarking ? 'default' : 'pointer', background: 'transparent', color: C.danger, border: `1px solid ${C.border}`, opacity: unmarking ? 0.6 : 1 }}
                  >
                    {unmarking ? 'Sjekker…' : 'Fjern pakke-merking'}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, letterSpacing: '0.04em', marginBottom: 8 }}>
                  Merk som pakke-mal (vises i Pakkemaler-fanen og kan brukes på en salgsflyer)
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    type="text"
                    value={pkgLabel}
                    onChange={e => setPkgLabel(e.target.value)}
                    placeholder="F.eks. Liten pakke"
                    style={{ padding: '7px 10px', borderRadius: 6, background: C.surface2, border: `1px solid ${C.border}`, color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', outline: 'none', width: 220 }}
                  />
                  <select
                    value={pkgCategory}
                    onChange={e => setPkgCategory(e.target.value as SalesFlyerPackageCategory)}
                    style={{ padding: '7px 10px', borderRadius: 6, background: C.surface2, border: `1px solid ${C.border}`, color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', outline: 'none' }}
                  >
                    <option value="foto">Bilder</option>
                    <option value="film">Film</option>
                    <option value="foto_film">Bilder og film</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleMarkAsPackage}
                    disabled={pkgSaving}
                    style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, padding: '7px 14px', borderRadius: 6, cursor: pkgSaving ? 'default' : 'pointer', background: C.accent, color: '#fff', border: 'none', opacity: pkgSaving ? 0.6 : 1 }}
                  >
                    {pkgSaving ? 'Lagrer…' : 'Lagre som pakke'}
                  </button>
                </div>
                {pkgError && (
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.danger, marginTop: 6 }}>
                    {pkgError}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Builder */}
        {builderData && (
          <QuoteBuilder
            key={existingQuoteId ?? 'new'}
            initialData={builderData}
            teamMembers={teamMembers}
            customers={customers}
            priceCatalog={priceCatalog}
            equipmentGroups={equipmentGroups}
            discountFactors={discountFactors}
            onSave={handleSave}
            onGeneratePDF={handleGeneratePDF}
            saving={saving}
            generatingPDF={generatingPDF}
            autosaveEnabled={(quotes.find(q => q.id === existingQuoteId)?.status ?? 'draft') === 'draft'}
          />
        )}

        {/* Chat — kun synlig etter tilbudet er lagret første gang */}
        {existingQuoteId && (
          <QuoteChat
            quoteId={existingQuoteId}
            projectId={projectId}
            profiles={profiles}
            forceOpen={forceOpenChat}
          />
        )}

        {/* Bekreftelse før pakke-merkingen fjernes mens tilbudet fortsatt er i bruk på én
            eller flere publiserte flyere (sales-flyers Task 7, Step 2). */}
        {unmarkConfirmSlugs && (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '10vh 16px', zIndex: 50 }}
            onClick={() => !unmarking && setUnmarkConfirmSlugs(null)}
          >
            <div
              style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}
              onClick={e => e.stopPropagation()}
            >
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.text }}>
                Dette tilbudet vises på {unmarkConfirmSlugs.length === 1 ? 'flyeren' : 'flyerne'}:
              </p>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {unmarkConfirmSlugs.map(slug => (
                  <li key={slug} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text2 }}>
                    {slug}
                  </li>
                ))}
              </ul>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text2 }}>
                Fjern merkingen likevel? Pakken forsvinner da fra disse flyerne.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setUnmarkConfirmSlugs(null)}
                  disabled={unmarking}
                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', padding: '7px 14px', borderRadius: 6, cursor: 'pointer', background: 'transparent', color: C.text3, border: `1px solid ${C.border}` }}
                >
                  Avbryt
                </button>
                <button
                  type="button"
                  onClick={handleConfirmUnmark}
                  disabled={unmarking}
                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, padding: '7px 14px', borderRadius: 6, cursor: unmarking ? 'default' : 'pointer', background: C.danger, color: '#fff', border: 'none', opacity: unmarking ? 0.6 : 1 }}
                >
                  {unmarking ? 'Fjerner…' : 'Fjern merkingen'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Kundevelger for "Dupliser som nytt tilbud" (sales-flyers Task 7, Step 3) —
            enkel select over eksisterende kunder (samme customers-prop som QuoteBuilder
            allerede får) + fritekst for en ny kunde, siden QuoteBuilders egen
            CustomerSelector ikke er eksportert ut av den filen. */}
        {showDuplicate && activeQuote && (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '10vh 16px', zIndex: 50 }}
            onClick={() => !duplicating && setShowDuplicate(false)}
          >
            <div
              style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 20, width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.text }}>
                  Dupliser som nytt tilbud
                </p>
                <button
                  onClick={() => setShowDuplicate(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, fontSize: '1.1rem', lineHeight: 1, padding: 4 }}
                >
                  ×
                </button>
              </div>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text2 }}>
                Oppretter et helt nytt prosjekt og tilbud, basert på &quot;{activeQuote.package_label}&quot;. Pakke-malen selv endres ikke.
              </p>
              <div>
                <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginBottom: 4 }}>
                  Kunde
                </label>
                <select
                  value={duplicateCustomerId}
                  onChange={e => setDuplicateCustomerId(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', outline: 'none' }}
                >
                  <option value="">— Ny kunde —</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.customer_number ? ` — #${c.customer_number}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              {!duplicateCustomerId && (
                <div>
                  <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginBottom: 4 }}>
                    Navn på ny kunde
                  </label>
                  <input
                    type="text"
                    autoFocus
                    value={duplicateNewName}
                    onChange={e => setDuplicateNewName(e.target.value)}
                    placeholder="Kundenavn"
                    style={{ width: '100%', padding: '8px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', outline: 'none' }}
                  />
                </div>
              )}
              {duplicateError && (
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.danger }}>
                  {duplicateError}
                </p>
              )}
              <button
                type="button"
                onClick={handleDuplicateSubmit}
                disabled={duplicating}
                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, padding: '9px 18px', borderRadius: 8, cursor: duplicating ? 'default' : 'pointer', background: C.accent, color: '#fff', border: 'none', opacity: duplicating ? 0.6 : 1 }}
              >
                {duplicating ? 'Dupliserer…' : 'Dupliser'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
