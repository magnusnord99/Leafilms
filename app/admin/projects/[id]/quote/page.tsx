'use client'

import { useEffect, useRef, useState, use } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Project, TeamMember, Customer, QuoteBuilderData, CrewMember, PriceCatalogItem, DiscountFactor, Quote, EquipmentGroupWithItems } from '@/lib/types'
import { QuoteBuilder, createEmptyBuilderData } from '@/components/quote/QuoteBuilder'
import QuoteChat from '@/components/quote/QuoteChat'
import { pickQuoteForEditing, isQuoteContentLocked, addonTotalPrice } from '@/lib/quote-builder-utils'
import { C } from '@/lib/admin-theme'

type Props = {
  params: Promise<{ id: string }>
}

export default function ProjectQuotePage({ params }: Props) {
  const { id: projectId } = use(params)
  const searchParams = useSearchParams()
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
  // Hindrer at samtidige "Lagre tilbud" + "Generer PDF"-kall begge tror det ikke finnes
  // en rad ennå og oppretter to quotes-rader for samme prosjekt (én av dem tom).
  const savingRef = useRef(false)

  useEffect(() => {
    loadAll()
  }, [projectId])

  async function loadAll() {
    setLoading(true)
    // Nullstill tilbuds-tilstand fra forrige prosjekt — ellers kan existingQuoteId
    // henge igjen fra et annet prosjekt hvis det nye prosjektet ikke har noe tilbud ennå,
    // og handleSave/QuoteChat ville da operert på feil prosjekts tilbud.
    setExistingQuoteId(null)
    setBuilderData(null)
    try {
      const [projectRes, teamRes, customersRes, quoteRes, sectionsRes, catalogRes, equipmentGroupsRes, discountFactorsRes, profilesRes] = await Promise.all([
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
      ])

      const proj = projectRes.data as Project | null
      const members = (teamRes.data || []) as TeamMember[]
      const custs = (customersRes.data || []) as Customer[]
      const allQuotes = (quoteRes.data || []) as Quote[]
      // Editoren åpner is_current (arbeidsversjonen). pickBestQuote (akseptert
      // vinner) er for display andre steder — her ville den landet på akseptert
      // V1 etter "Lag ny versjon" og latt Lagre/PDF overskrive kundens avtalte
      // tall mens status forble accepted.
      const existingQuote = pickQuoteForEditing(allQuotes)

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
      const record = {
        project_id: projectId,
        sheet_url: '',
        version: data.version || 'V1',
        quote_data: data, // Store raw builder data for future editing
      }

      if (existingQuoteId) {
        const currentStatus = quotes.find(q => q.id === existingQuoteId)?.status
        // Akseptert/avslått quote_data er kundens avtalte svar — aldri overwrite
        // på plass (d29ce51 bevarte status, men lot fortsatt innholdet muteres).
        // Endringer krever "+ Nytt tilbud" / bytte til en kladd-versjon.
        if (isQuoteContentLocked(currentStatus)) {
          setSaveMessage('Aksepterte/avslåtte tilbud er låst — lag et nytt tilbud for å endre')
          return
        }
        // Kladd/sendte tilbud settes tilbake til 'draft' ved lagring (feedback 08a0235b).
        await supabase.from('quotes').update({ ...record, status: 'draft' as const }).eq('id', existingQuoteId)
        setQuotes(prev => prev.map(q => q.id === existingQuoteId ? { ...q, version: record.version, quote_data: data, status: 'draft' } : q))
      } else {
        // Første tilbud for prosjektet — blir automatisk gjeldende versjon
        const { data: newQuote } = await supabase.from('quotes').insert({ ...record, status: 'draft' as const, is_current: true }).select('*').single()
        if (newQuote) {
          setExistingQuoteId(newQuote.id)
          setQuotes(prev => [...prev, newQuote as Quote])
        }
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
    if (quotes.length <= 1) return
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
      }
    }
    setQuotes(remaining)
  }

  async function handleGeneratePDF(data: QuoteBuilderData) {
    setGeneratingPDF(true)
    try {
      const active = quotes.find(q => q.id === existingQuoteId)
      const locked = isQuoteContentLocked(active?.status)
      // Låste tilbud: generer PDF fra lagret quote_data — ikke persistér
      // eventuelle UI-endringer tilbake i den aksepterte raden.
      const pdfSource = locked
        ? ((active?.quote_data as QuoteBuilderData | undefined) ?? data)
        : data
      if (!locked) {
        await handleSave(data)
      }

      const response = await fetch('/api/generate-quote-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          builderData: pdfSource,
          projectId,
          language: pdfSource.language,
          mva: pdfSource.includeVat ? 'y' : 'n',
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
              return (
                <div className="flex items-center gap-2 ml-2">
                  <input
                    defaultValue={active.label ?? ''}
                    placeholder="Notat (f.eks. 2 filmer)"
                    onBlur={e => handleLabelChange(active.id, e.target.value)}
                    style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem',
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
                  {quotes.length > 1 && active.status === 'draft' && (
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
      </div>
    </div>
  )
}
