'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Customer, PIPELINE_STAGES, PipelineStage } from '@/lib/types'
import { seedTasksFromTemplates } from '@/lib/actions/pipeline'
import { C } from '@/lib/admin-theme'

const projectTypeOptions = [
  { value: 'commercial', label: 'Reklame/Markedsføring' },
  { value: 'documentary', label: 'Dokumentar' },
  { value: 'corporate', label: 'Bedriftsfilm' },
  { value: 'product', label: 'Produktfoto/-film' },
  { value: 'event', label: 'Event/Arrangement' },
  { value: 'music_video', label: 'Musikkkvideo' },
  { value: 'wedding', label: 'Bryllup' },
  { value: 'other', label: 'Annet' }
]

const mediumOptions = [
  { value: 'social_media', label: 'Sosiale medier' },
  { value: 'tv', label: 'TV' },
  { value: 'cinema', label: 'Kino' },
  { value: 'web', label: 'Web/Nettside' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'print', label: 'Print/Trykk' }
]

const targetAudienceOptions = [
  { value: 'b2b', label: 'B2B (Bedrifter)' },
  { value: 'b2c', label: 'B2C (Forbrukere)' },
  { value: 'young_adults', label: 'Unge voksne (18-35)' },
  { value: 'families', label: 'Familie og venner' },
  { value: 'professionals', label: 'Profesjonelle/Fagfolk' },
  { value: 'general', label: 'Generelt publikum' }
]

const industryOptions = [
  { value: 'outdoor', label: 'Outdoor/Natur' },
  { value: 'food_beverage', label: 'Mat & Drikke' },
  { value: 'fashion', label: 'Mote' },
  { value: 'tech', label: 'Tech/IT' },
  { value: 'sports', label: 'Sport' },
  { value: 'travel', label: 'Reise/Turisme' },
  { value: 'real_estate', label: 'Eiendom' },
  { value: 'health', label: 'Helse/Wellness' },
  { value: 'finance', label: 'Finans' },
  { value: 'culture', label: 'Kultur/Underholdning' },
  { value: 'wedding', label: 'Bryllup' },
  { value: 'other', label: 'Annet' }
]

const scopeOptions = [
  { value: 'small', label: 'Lite (1-2 dager produksjon)' },
  { value: 'medium', label: 'Medium (3-5 dager produksjon)' },
  { value: 'large', label: 'Stort (1+ uke produksjon)' }
]

const INNHOLDSTYPE_OPTIONS: { value: 'video' | 'photo' | 'mixed'; label: string }[] = [
  { value: 'video', label: 'Video' },
  { value: 'photo', label: 'Bilder' },
  { value: 'mixed', label: 'Begge' },
]

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 3,
  color: C.text,
  fontFamily: 'var(--font-dm-sans)',
  fontSize: '0.75rem',
  letterSpacing: '0.03em',
  outline: 'none',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%238484A0'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  backgroundSize: '16px',
  cursor: 'pointer',
}

const fieldLabel = (text: string, required?: boolean) => (
  <label style={{
    display: 'block',
    fontFamily: 'var(--font-dm-sans)',
    fontSize: '0.6rem',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: C.text2,
    fontWeight: 500,
    marginBottom: 8,
  }}>
    {text}{required && <span style={{ color: C.accent, marginLeft: 4 }}>*</span>}
  </label>
)

const sectionDivider = (text: string) => (
  <div style={{ paddingBottom: 16, marginBottom: 24, borderBottom: `1px solid ${C.border}` }}>
    <div className="flex items-center gap-3">
      <div style={{ width: 20, height: 1, background: C.accent }} />
      <span style={{
        fontFamily: 'var(--font-dm-sans)',
        fontSize: '0.6rem',
        letterSpacing: '0.16em',
        color: C.accent,
        textTransform: 'uppercase',
        fontWeight: 500,
      }}>
        {text}
      </span>
    </div>
  </div>
)

const chipBtn = (active: boolean, onClick: () => void, label: string) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      padding: '6px 14px',
      fontFamily: 'var(--font-dm-sans)',
      fontSize: '0.68rem',
      letterSpacing: '0.04em',
      borderRadius: 3,
      border: active ? `1px solid ${C.accent}` : `1px solid ${C.border}`,
      background: active ? C.accentBg : C.surface,
      color: active ? C.accent : C.text3,
      cursor: 'pointer',
      transition: 'border-color 0.15s, color 0.15s, background 0.15s',
    }}
  >
    {label}
  </button>
)

function NewProjectContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [generatingStatus, setGeneratingStatus] = useState<string | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [profiles, setProfiles] = useState<{ id: string; name: string | null; email: string }[]>([])
  const [customerInput, setCustomerInput] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    searchParams.get('customer_id') || null
  )
  const [newCustomerInfo, setNewCustomerInfo] = useState({ company: '', email: '', phone: '' })
  const [formData, setFormData] = useState({
    title: '',
    language: 'no' as 'no' | 'en',
    project_type: '' as 'video' | 'photo' | 'mixed' | '',
    legacy_project_type: '',
    mediums: [] as string[],
    target_audience: '',
    industry: '',
    scope: '',
    context: '',
    pipeline_stage: 'lead' as PipelineStage,
    pitch_review_enabled: false,
    pitch_reviewer_id: null as string | null,
    quote_review_enabled: false,
    quote_reviewer_id: null as string | null,
    create_pitch: !!searchParams.get('project_id'),
    delivery_video: '',
    delivery_photo: '',
    delivery_description: '',
    post_prod_days: '',
  })

  const isNewCustomer = customerInput.trim().length > 0 && !selectedCustomerId

  useEffect(() => {
    fetchCustomers()
    fetchProfiles()
    const customerId = searchParams.get('customer_id')
    if (customerId) setSelectedCustomerId(customerId)
    const titleParam = searchParams.get('title')
    const contextParam = searchParams.get('context')
    if (titleParam || contextParam) {
      setFormData(prev => ({
        ...prev,
        ...(titleParam ? { title: titleParam } : {}),
        ...(contextParam ? { context: contextParam } : {}),
      }))
    }

    // Gjenbruk av eksisterende prosjekt (se handleSubmit sin existingProjectId-gren):
    // hent prosjektets eksisterende felter slik at et resubmit ikke nuller ut
    // leveringsinfo/type/språk som allerede er lagret på prosjektet.
    const projectId = searchParams.get('project_id')
    if (projectId) {
      supabase
        .from('projects')
        .select('language, project_type, metadata, delivery_video, delivery_photo, delivery_description, post_prod_days')
        .eq('id', projectId)
        .single()
        .then(({ data, error }) => {
          if (error || !data) return
          const metadata = (data.metadata ?? {}) as {
            project_type?: string
            mediums?: string[]
            target_audience?: string
            industry?: string
            scope?: string
            context?: string
          }
          setFormData(prev => ({
            ...prev,
            language: (data.language as 'no' | 'en' | undefined) ?? prev.language,
            project_type: (data.project_type as 'video' | 'photo' | 'mixed' | '' | undefined) ?? prev.project_type,
            legacy_project_type: metadata.project_type ?? prev.legacy_project_type,
            mediums: metadata.mediums ?? prev.mediums,
            target_audience: metadata.target_audience ?? prev.target_audience,
            industry: metadata.industry ?? prev.industry,
            scope: metadata.scope ?? prev.scope,
            delivery_video: data.delivery_video ?? '',
            delivery_photo: data.delivery_photo ?? '',
            delivery_description: data.delivery_description ?? '',
            post_prod_days: data.post_prod_days != null ? String(data.post_prod_days) : '',
          }))
        })
    }
  }, [searchParams])

  useEffect(() => {
    if (selectedCustomerId) {
      const customer = customers.find(c => c.id === selectedCustomerId)
      if (customer) setCustomerInput(customer.name)
    }
  }, [selectedCustomerId, customers])

  async function fetchCustomers() {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('name', { ascending: true })
    if (!error && data) setCustomers(data as Customer[])
  }

  async function fetchProfiles() {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email')
      .order('name', { ascending: true })
    if (!error && data) setProfiles(data as { id: string; name: string | null; email: string }[])
  }

  const toggleMedium = (value: string) => {
    setFormData(prev => ({
      ...prev,
      mediums: prev.mediums.includes(value)
        ? prev.mediums.filter(m => m !== value)
        : [...prev.mediums, value]
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      let customerId: string | null = selectedCustomerId
      let clientName: string = customerInput.trim()

      if (customerInput.trim()) {
        const existingCustomer = customers.find(
          c => c.name.toLowerCase() === customerInput.trim().toLowerCase()
        )

        if (existingCustomer) {
          customerId = existingCustomer.id
          clientName = existingCustomer.name
        } else {
          const { data: newCustomer, error: customerError } = await supabase
            .from('customers')
            .insert({
              name: customerInput.trim(),
              company: newCustomerInfo.company || customerInput.trim(),
              email: newCustomerInfo.email || null,
              phone: newCustomerInfo.phone || null,
            })
            .select()
            .single()

          if (!customerError) {
            customerId = newCustomer.id
            clientName = newCustomer.name
            setCustomers([...customers, newCustomer as Customer])
          }
        }
      }

      const metadata = {
        project_type: formData.legacy_project_type,
        mediums: formData.mediums,
        target_audience: formData.target_audience,
        industry: formData.industry,
        scope: formData.scope,
        context: formData.context
      }

      // Fra prosjekt-huben: gjenbruk eksisterende prosjekt i stedet for å
      // opprette et duplikat (pipeline_stage, status og slug beholdes urørt)
      const existingProjectId = searchParams.get('project_id')

      let project: { id: string }
      if (existingProjectId) {
        const { data: updated, error: updateError } = await supabase
          .from('projects')
          .update({
            title: formData.title,
            client_name: clientName,
            customer_id: customerId,
            language: formData.language,
            project_type: formData.project_type || null,
            // Skriv kun leveringsfelt når skjemaet faktisk har en verdi — unngår å nulle ut
            // eksisterende leveringsinfo på prosjektet hvis prefill-fetchen over ikke har
            // rukket å fylle formData enda (eller feiler). Se updateProjectDeliveryInfo i
            // lib/actions/pipeline.ts for samme mønster.
            ...(formData.delivery_video ? { delivery_video: formData.delivery_video } : {}),
            ...(formData.delivery_photo ? { delivery_photo: formData.delivery_photo } : {}),
            ...(formData.delivery_description ? { delivery_description: formData.delivery_description } : {}),
            ...(formData.post_prod_days ? { post_prod_days: Number(formData.post_prod_days) } : {}),
            metadata,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingProjectId)
          .select()
          .single()

        if (updateError || !updated) throw updateError ?? new Error('Fant ikke prosjektet')
        project = updated
      } else {
        const baseSlug = formData.title
          .toLowerCase()
          .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'aa')
          .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
        const uniqueSuffix = Date.now().toString(36).slice(-6)
        const slug = `${baseSlug}-${uniqueSuffix}`

        const { data: inserted, error: projectError } = await supabase
          .from('projects')
          .insert({
            title: formData.title,
            slug,
            client_name: clientName,
            customer_id: customerId,
            status: 'draft',
            language: formData.language,
            project_type: formData.project_type || null,
            pipeline_stage: formData.pipeline_stage,
            pitch_review_enabled: formData.pitch_review_enabled,
            pitch_reviewer_id: formData.pitch_reviewer_id,
            quote_review_enabled: formData.quote_review_enabled,
            quote_reviewer_id: formData.quote_reviewer_id,
            delivery_video: formData.delivery_video || null,
            delivery_photo: formData.delivery_photo || null,
            delivery_description: formData.delivery_description || null,
            post_prod_days: formData.post_prod_days ? Number(formData.post_prod_days) : null,
            metadata
          })
          .select()
          .single()

        if (projectError) throw projectError
        project = inserted

        // Seed oppgaver fra task_templates for steget prosjektet starter i —
        // ellers får prosjektet ingen tasks før første stegbytte.
        // (Eksisterende prosjekter har allerede tasks for sitt steg.)
        await seedTasksFromTemplates(project.id, formData.pipeline_stage)
      }

      if (formData.create_pitch) {
        const sections = [
          { type: 'hero', order_index: 1, visible: true },
          { type: 'concept', order_index: 2, visible: true },
          { type: 'goal', order_index: 3, visible: true },
          { type: 'deliverables', order_index: 4, visible: true },
          { type: 'example_work', order_index: 8, visible: true },
          { type: 'cases', order_index: 7, visible: true },
          { type: 'team', order_index: 6, visible: true },
          { type: 'moodboard', order_index: 9, visible: false },
          { type: 'timeline', order_index: 5, visible: true },
          { type: 'contact', order_index: 10, visible: true }
        ]

        // Ikke dupliser seksjoner hvis prosjektet allerede har noen
        const { count: existingSectionCount } = await supabase
          .from('sections')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', project.id)

        if ((existingSectionCount ?? 0) === 0) {
          const { error: sectionsError } = await supabase
            .from('sections')
            .insert(sections.map(s => ({ project_id: project.id, ...s })))

          if (sectionsError) throw sectionsError
        }

        setGeneratingStatus('Genererer innhold med AI...')

        try {
          const aiResponse = await fetch('/api/generate-project', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId: project.id,
              title: formData.title,
              clientName,
              language: formData.language,
              contentType: formData.project_type,
              projectType: formData.legacy_project_type,
              mediums: formData.mediums,
              targetAudience: formData.target_audience,
              industry: formData.industry,
              scope: formData.scope,
              context: formData.context
            })
          })
          if (!aiResponse.ok) {
            const errorData = await aiResponse.json().catch(() => ({}))
            console.error('AI generation failed:', errorData)
          }
        } catch (aiError) {
          console.error('AI generation error:', aiError)
        }

        await new Promise(resolve => setTimeout(resolve, 2000))
        router.push(`/admin/projects/${project.id}/edit?generated=true`)
      } else {
        router.push(`/admin/projects/${project.id}`)
      }
      router.refresh()
    } catch (error) {
      console.error('Error creating project:', error)
      alert('Noe gikk galt. Prøv igjen.')
    } finally {
      setLoading(false)
      setGeneratingStatus(null)
    }
  }

  const isFormValid = formData.create_pitch
    ? formData.title && formData.project_type && formData.legacy_project_type && formData.mediums.length > 0 && formData.target_audience
    : formData.title && (!!selectedCustomerId || customerInput.trim().length > 0)

  return (
    <div className="min-h-screen p-8 md:p-12" style={{ background: C.bg, color: C.text }}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <button
            onClick={() => router.push('/admin')}
            className="flex items-center gap-2 mb-8 transition-colors"
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.6rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: C.text3,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
            Tilbake
          </button>

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
              Nytt prosjekt
            </span>
          </div>
          <h1 style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: 'clamp(2rem, 4vw, 3rem)',
            fontWeight: 300,
            fontStyle: 'italic',
            color: C.text,
            lineHeight: 1.1,
          }}>
            Opprett prosjekt
          </h1>
          <p style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.75rem',
            color: C.text3,
            marginTop: 10,
            letterSpacing: '0.03em',
          }}>
            Fyll inn informasjon — AI genererer et utkast
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-10">
          {/* Section: Grunnleggende info */}
          <div>
            {sectionDivider('Grunnleggende informasjon')}
            <div className="space-y-6">

              <div>
                {fieldLabel('Prosjekttittel', true)}
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Nike Produktlansering 2025"
                  style={inputStyle}
                />
              </div>

              <div>
                {fieldLabel('Pitch')}
                {chipBtn(
                  formData.create_pitch,
                  () => setFormData({ ...formData, create_pitch: !formData.create_pitch }),
                  'Lag pitch nå'
                )}
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, marginTop: 6, letterSpacing: '0.06em' }}>
                  Av: oppretter kun prosjektet. På: AI genererer pitch-innhold basert på feltene under.
                </p>
              </div>

              <div>
                {fieldLabel('Pipeline-steg')}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {PIPELINE_STAGES.map((stage) =>
                    chipBtn(
                      formData.pipeline_stage === stage.value,
                      () => setFormData({ ...formData, pipeline_stage: stage.value }),
                      stage.label
                    )
                  )}
                </div>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, marginTop: 6, letterSpacing: '0.06em' }}>
                  Hvor i prosessen er dere allerede?
                </p>
              </div>

              <div>
                {fieldLabel('Innholdstype', formData.create_pitch)}
                <div style={{ display: 'flex', gap: 8 }}>
                  {INNHOLDSTYPE_OPTIONS.map((opt) =>
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, project_type: opt.value })}
                      style={{
                        padding: '8px 20px',
                        fontFamily: 'var(--font-dm-sans)',
                        fontSize: '0.7rem',
                        letterSpacing: '0.06em',
                        borderRadius: 3,
                        border: formData.project_type === opt.value ? `1px solid ${C.accent}` : `1px solid ${C.border}`,
                        background: formData.project_type === opt.value ? C.accentBg : C.surface,
                        color: formData.project_type === opt.value ? C.accent : C.text3,
                        cursor: 'pointer',
                        transition: 'border-color 0.15s, color 0.15s, background 0.15s',
                      }}
                    >
                      {opt.label}
                    </button>
                  )}
                </div>
              </div>

              <div>
                {fieldLabel('Språk', formData.create_pitch)}
                <div className="flex gap-2">
                  {(['no', 'en'] as const).map((lang) =>
                    chipBtn(
                      formData.language === lang,
                      () => setFormData({ ...formData, language: lang }),
                      lang === 'no' ? 'Norsk' : 'English'
                    )
                  )}
                </div>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, marginTop: 6, letterSpacing: '0.06em' }}>
                  AI genererer innhold på valgt språk
                </p>
              </div>

              <div>
                {fieldLabel('Kunde')}
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    list="customers-list"
                    value={customerInput}
                    onChange={(e) => {
                      setCustomerInput(e.target.value)
                      setSelectedCustomerId(null)
                      setNewCustomerInfo({ company: '', email: '', phone: '' })
                    }}
                    onBlur={(e) => {
                      const match = customers.find(
                        c => c.name.toLowerCase() === e.target.value.trim().toLowerCase()
                      )
                      if (match) {
                        setSelectedCustomerId(match.id)
                        setCustomerInput(match.name)
                        setNewCustomerInfo({ company: '', email: '', phone: '' })
                      }
                    }}
                    placeholder="Skriv navn eller velg fra listen..."
                    style={inputStyle}
                  />
                  <datalist id="customers-list">
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.name}>
                        {customer.company ? `${customer.name} (${customer.company})` : customer.name}
                      </option>
                    ))}
                  </datalist>
                </div>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, marginTop: 6, letterSpacing: '0.06em' }}>
                  Velg fra listen eller skriv inn for å opprette ny kunde
                </p>

                {/* New customer info expansion */}
                {isNewCustomer && (
                  <div style={{
                    marginTop: 12,
                    padding: '16px 20px',
                    background: C.surface2,
                    border: `1px solid ${C.border}`,
                    borderRadius: 3,
                  }}>
                    <div className="flex items-center gap-3 mb-4">
                      <div style={{ width: 12, height: 1, background: C.border }} />
                      <span style={{
                        fontFamily: 'var(--font-dm-sans)',
                        fontSize: '0.58rem',
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: C.text3,
                      }}>
                        Ny kunde — fyll inn mer info (valgfritt)
                      </span>
                    </div>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          {fieldLabel('Firma')}
                          <input
                            type="text"
                            value={newCustomerInfo.company}
                            onChange={(e) => setNewCustomerInfo({ ...newCustomerInfo, company: e.target.value })}
                            placeholder="Firmanavn"
                            style={inputStyle}
                          />
                        </div>
                        <div>
                          {fieldLabel('E-post')}
                          <input
                            type="email"
                            value={newCustomerInfo.email}
                            onChange={(e) => setNewCustomerInfo({ ...newCustomerInfo, email: e.target.value })}
                            placeholder="kontakt@bedrift.no"
                            style={inputStyle}
                          />
                        </div>
                      </div>
                      <div style={{ flex: '1 1 160px' }}>
                        {fieldLabel('Telefon')}
                        <input
                          type="tel"
                          value={newCustomerInfo.phone}
                          onChange={(e) => setNewCustomerInfo({ ...newCustomerInfo, phone: e.target.value })}
                          placeholder="+47 123 45 678"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div style={{ width: 12, height: 1, background: C.border }} />
                  <span style={{
                    fontFamily: 'var(--font-dm-sans)',
                    fontSize: '0.58rem',
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: C.text3,
                  }}>
                    Leveringsinfo (valgfritt)
                  </span>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      {fieldLabel('Video')}
                      <input
                        type="text"
                        value={formData.delivery_video}
                        onChange={(e) => setFormData({ ...formData, delivery_video: e.target.value })}
                        placeholder="F.eks. 2 kampanjefilmer á 90 sek"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      {fieldLabel('Foto')}
                      <input
                        type="text"
                        value={formData.delivery_photo}
                        onChange={(e) => setFormData({ ...formData, delivery_photo: e.target.value })}
                        placeholder="F.eks. 30 produktbilder"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      {fieldLabel('Leveringsbeskrivelse')}
                      <input
                        type="text"
                        value={formData.delivery_description}
                        onChange={(e) => setFormData({ ...formData, delivery_description: e.target.value })}
                        placeholder="Kort oppsummering av leveransen"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      {fieldLabel('Etterarbeidsdager')}
                      <input
                        type="number"
                        min="0"
                        value={formData.post_prod_days}
                        onChange={(e) => setFormData({ ...formData, post_prod_days: e.target.value })}
                        placeholder="F.eks. 5"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {formData.create_pitch && (
          <>
          {/* Section: Prosjektdetaljer */}
          <div>
            {sectionDivider('Prosjektdetaljer')}
            <div className="space-y-6">

              <div>
                {fieldLabel('Prosjekttype', true)}
                <select
                  value={formData.legacy_project_type}
                  onChange={(e) => setFormData({ ...formData, legacy_project_type: e.target.value })}
                  required
                  style={selectStyle}
                >
                  <option value="" disabled>Velg type...</option>
                  {projectTypeOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div>
                {fieldLabel('Medium / Plattform', true)}
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, marginBottom: 10, letterSpacing: '0.06em' }}>
                  Velg én eller flere
                </p>
                <div className="flex flex-wrap gap-2">
                  {mediumOptions.map((option) =>
                    chipBtn(
                      formData.mediums.includes(option.value),
                      () => toggleMedium(option.value),
                      option.label
                    )
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  {fieldLabel('Målgruppe', true)}
                  <select
                    value={formData.target_audience}
                    onChange={(e) => setFormData({ ...formData, target_audience: e.target.value })}
                    required
                    style={selectStyle}
                  >
                    <option value="" disabled>Velg målgruppe...</option>
                    {targetAudienceOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  {fieldLabel('Bransje')}
                  <select
                    value={formData.industry}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                    style={selectStyle}
                  >
                    <option value="">Velg bransje...</option>
                    {industryOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                {fieldLabel('Omfang')}
                <select
                  value={formData.scope}
                  onChange={(e) => setFormData({ ...formData, scope: e.target.value })}
                  style={selectStyle}
                >
                  <option value="">Velg omfang...</option>
                  {scopeOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section: Review */}
          <div>
            {sectionDivider('Review')}
            <div className="space-y-6">
              {([
                { key: 'pitch' as const, label: 'Krev godkjenning av pitch', enabledField: 'pitch_review_enabled' as const, reviewerField: 'pitch_reviewer_id' as const },
                { key: 'quote' as const, label: 'Krev godkjenning av tilbud', enabledField: 'quote_review_enabled' as const, reviewerField: 'quote_reviewer_id' as const },
              ]).map(row => (
                <div key={row.key} className="flex items-center gap-3 flex-wrap">
                  {chipBtn(
                    formData[row.enabledField],
                    () => setFormData({ ...formData, [row.enabledField]: !formData[row.enabledField] }),
                    row.label
                  )}
                  {formData[row.enabledField] && (
                    <select
                      value={formData[row.reviewerField] ?? ''}
                      onChange={e => setFormData({ ...formData, [row.reviewerField]: e.target.value || null })}
                      style={selectStyle}
                    >
                      <option value="">Velg reviewer...</option>
                      {profiles.map(p => (
                        <option key={p.id} value={p.id}>{p.name ?? p.email}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, letterSpacing: '0.06em' }}>
                Valgfritt — kan endres senere på prosjektsiden
              </p>
            </div>
          </div>

          {/* Section: Kontekst */}
          <div>
            {sectionDivider('Kontekst og bakgrunn')}
            <div>
              {fieldLabel('E-postutvekslinger / Brief / Notater')}
              <textarea
                rows={8}
                value={formData.context}
                onChange={(e) => setFormData({ ...formData, context: e.target.value })}
                placeholder={`Lim inn e-postutvekslinger, brief-dokumenter eller møtenotater...\n\n– Hva ønsker kunden å oppnå?\n– Hva er budsjettrammene?\n– Er det spesielle krav eller ønsker?`}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3, marginTop: 8, letterSpacing: '0.06em' }}>
                Jo mer kontekst, desto bedre AI-generering
              </p>
            </div>
          </div>

          {/* AI info */}
          <div style={{
            padding: '20px 24px',
            background: C.accentBg,
            border: `1px solid ${C.border}`,
            borderRadius: 3,
          }}>
            <div className="flex items-center gap-3 mb-4">
              <div style={{ width: 16, height: 1, background: C.accent, opacity: 0.5 }} />
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: C.accent, fontWeight: 500 }}>
                AI genererer
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text2, marginBottom: 6 }}>Innhold</p>
                <ul style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, lineHeight: 1.8 }}>
                  <li>Hero-tekst og introduksjon</li>
                  <li>Prosjektmål</li>
                  <li>Kreativt konsept</li>
                  <li>Tidslinje-beskrivelser</li>
                </ul>
              </div>
              <div>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text2, marginBottom: 6 }}>Velger automatisk</p>
                <ul style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, lineHeight: 1.8 }}>
                  <li>Eksempelbilder</li>
                  <li>Team-medlemmer</li>
                  <li>Relevante cases</li>
                </ul>
              </div>
            </div>
          </div>
          </>
          )}

          {/* Submit */}
          <div className="flex flex-col gap-4">
            {generatingStatus && (
              <div
                className="flex items-center gap-3 px-4 py-3"
                style={{
                  background: C.accentBg,
                  border: `1px solid ${C.border}`,
                  borderRadius: 3,
                }}
              >
                <div
                  className="animate-spin flex-shrink-0"
                  style={{
                    width: 14,
                    height: 14,
                    border: `1.5px solid ${C.border}`,
                    borderTop: `1.5px solid ${C.accent}`,
                    borderRadius: '50%',
                  }}
                />
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.accent, letterSpacing: '0.04em' }}>
                  {generatingStatus}
                </span>
              </div>
            )}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading || !isFormValid}
                style={{
                  flex: 1,
                  padding: '11px 20px',
                  background: loading || !isFormValid ? C.border : C.accent,
                  color: loading || !isFormValid ? C.text3 : '#fff',
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.65rem',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: 3,
                  cursor: loading || !isFormValid ? 'not-allowed' : 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                {loading
                  ? (formData.create_pitch ? (generatingStatus || 'Oppretter prosjekt...') : 'Oppretter...')
                  : (formData.create_pitch ? 'Opprett Prosjekt med AI' : 'Opprett prosjekt')}
              </button>
              <button
                type="button"
                onClick={() => router.push('/admin')}
                disabled={loading}
                style={{
                  padding: '11px 20px',
                  background: 'transparent',
                  color: C.text3,
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.65rem',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  border: `1px solid ${C.border}`,
                  borderRadius: 3,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.5 : 1,
                }}
              >
                Avbryt
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function NewProject() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg }}>
        <div className="animate-spin" style={{ width: 24, height: 24, border: `1.5px solid ${C.border}`, borderTop: `1.5px solid ${C.accent}`, borderRadius: '50%' }} />
      </div>
    }>
      <NewProjectContent />
    </Suspense>
  )
}
