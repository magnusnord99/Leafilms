'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button, Input, Select, Textarea, Card } from '@/components/ui'
import { Customer } from '@/lib/types'

const contentTypeOptions = [
  { value: 'film', label: 'Film' },
  { value: 'photo', label: 'Bilder' },
  { value: 'both', label: 'Film og Bilder' }
]

const projectTypeOptions = [
  { value: 'commercial', label: 'Reklame/Markedsføring' },
  { value: 'documentary', label: 'Dokumentar' },
  { value: 'corporate', label: 'Bedriftsfilm' },
  { value: 'product', label: 'Produktfoto/-film' },
  { value: 'event', label: 'Event/Arrangement' },
  { value: 'music_video', label: 'Musikkkvideo' },
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
  { value: 'families', label: 'Familier' },
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
  { value: 'other', label: 'Annet' }
]

const scopeOptions = [
  { value: 'small', label: 'Lite (1-2 dager produksjon)' },
  { value: 'medium', label: 'Medium (3-5 dager produksjon)' },
  { value: 'large', label: 'Stort (1+ uke produksjon)' }
]

const fieldLabel = (text: string, required?: boolean) => (
  <label style={{
    display: 'block',
    fontFamily: 'var(--font-dm-sans)',
    fontSize: '0.6rem',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: '#9E9287',
    fontWeight: 500,
    marginBottom: 8,
  }}>
    {text}{required && <span style={{ color: '#C49434', marginLeft: 4 }}>*</span>}
  </label>
)

const sectionDivider = (text: string) => (
  <div style={{ paddingBottom: 16, marginBottom: 24, borderBottom: '1px solid #2A261F' }}>
    <div className="flex items-center gap-3">
      <div style={{ width: 20, height: 1, background: '#C49434' }} />
      <span style={{
        fontFamily: 'var(--font-dm-sans)',
        fontSize: '0.6rem',
        letterSpacing: '0.16em',
        color: '#C49434',
        textTransform: 'uppercase',
        fontWeight: 500,
      }}>
        {text}
      </span>
    </div>
  </div>
)

function NewProjectContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [generatingStatus, setGeneratingStatus] = useState<string | null>(null)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerInput, setCustomerInput] = useState('')
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    searchParams.get('customer_id') || null
  )
  const [formData, setFormData] = useState({
    title: '',
    language: 'no' as 'no' | 'en',
    content_type: '',
    project_type: '',
    mediums: [] as string[],
    target_audience: '',
    industry: '',
    scope: '',
    context: ''
  })

  useEffect(() => {
    fetchCustomers()
    const customerId = searchParams.get('customer_id')
    if (customerId) setSelectedCustomerId(customerId)
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
            .insert({ name: customerInput.trim(), company: customerInput.trim() })
            .select()
            .single()

          if (!customerError) {
            customerId = newCustomer.id
            clientName = newCustomer.name
            setCustomers([...customers, newCustomer as Customer])
          }
        }
      }

      const baseSlug = formData.title
        .toLowerCase()
        .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'aa')
        .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      const uniqueSuffix = Date.now().toString(36).slice(-6)
      const slug = `${baseSlug}-${uniqueSuffix}`

      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
          title: formData.title,
          slug,
          client_name: clientName,
          customer_id: customerId,
          status: 'draft',
          language: formData.language,
          metadata: {
            content_type: formData.content_type,
            project_type: formData.project_type,
            mediums: formData.mediums,
            target_audience: formData.target_audience,
            industry: formData.industry,
            scope: formData.scope,
            context: formData.context
          }
        })
        .select()
        .single()

      if (projectError) throw projectError

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

      const { error: sectionsError } = await supabase
        .from('sections')
        .insert(sections.map(s => ({ project_id: project.id, ...s })))

      if (sectionsError) throw sectionsError

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
            contentType: formData.content_type,
            projectType: formData.project_type,
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
      router.refresh()
    } catch (error) {
      console.error('Error creating project:', error)
      alert('Noe gikk galt. Prøv igjen.')
    } finally {
      setLoading(false)
      setGeneratingStatus(null)
    }
  }

  const isFormValid = formData.title && formData.content_type && formData.project_type && formData.mediums.length > 0 && formData.target_audience

  return (
    <div className="min-h-screen p-8 md:p-12" style={{ background: '#0C0B09', color: '#E8E1D5' }}>
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
              color: '#62594E',
            }}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
            Tilbake
          </button>

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
              Nytt prosjekt
            </span>
          </div>
          <h1 style={{
            fontFamily: 'var(--font-cormorant)',
            fontSize: 'clamp(2rem, 4vw, 3rem)',
            fontWeight: 300,
            fontStyle: 'italic',
            color: '#E8E1D5',
            lineHeight: 1.1,
          }}>
            Opprett prosjekt
          </h1>
          <p style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.75rem',
            color: '#62594E',
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
                <Input
                  type="text"
                  id="title"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Nike Produktlansering 2025"
                />
              </div>

              <div>
                {fieldLabel('Språk', true)}
                <div className="flex gap-2">
                  {(['no', 'en'] as const).map((lang) => (
                    <Button
                      key={lang}
                      type="button"
                      onClick={() => setFormData({ ...formData, language: lang })}
                      variant={formData.language === lang ? 'primary' : 'secondary'}
                      size="sm"
                    >
                      {lang === 'no' ? 'Norsk' : 'English'}
                    </Button>
                  ))}
                </div>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: '#62594E', marginTop: 6, letterSpacing: '0.06em' }}>
                  AI genererer innhold på valgt språk
                </p>
              </div>

              <div>
                {fieldLabel('Kunde')}
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    id="customer"
                    list="customers-list"
                    value={customerInput}
                    onChange={(e) => {
                      setCustomerInput(e.target.value)
                      setSelectedCustomerId(null)
                    }}
                    onBlur={(e) => {
                      const match = customers.find(
                        c => c.name.toLowerCase() === e.target.value.trim().toLowerCase()
                      )
                      if (match) {
                        setSelectedCustomerId(match.id)
                        setCustomerInput(match.name)
                      }
                    }}
                    placeholder="Skriv navn eller velg fra listen..."
                    style={{
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
                    }}
                  />
                  <datalist id="customers-list">
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.name}>
                        {customer.company ? `${customer.name} (${customer.company})` : customer.name}
                      </option>
                    ))}
                  </datalist>
                </div>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: '#62594E', marginTop: 6, letterSpacing: '0.06em' }}>
                  Velg fra listen eller skriv inn for å opprette ny kunde
                </p>
              </div>
            </div>
          </div>

          {/* Section: Prosjektdetaljer */}
          <div>
            {sectionDivider('Prosjektdetaljer')}
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  {fieldLabel('Innholdstype', true)}
                  <Select
                    options={contentTypeOptions}
                    placeholder="Film eller bilder?"
                    value={formData.content_type}
                    onChange={(e) => setFormData({ ...formData, content_type: e.target.value })}
                    required
                  />
                </div>
                <div>
                  {fieldLabel('Prosjekttype', true)}
                  <Select
                    options={projectTypeOptions}
                    placeholder="Velg type..."
                    value={formData.project_type}
                    onChange={(e) => setFormData({ ...formData, project_type: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div>
                {fieldLabel('Medium / Plattform', true)}
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: '#62594E', marginBottom: 10, letterSpacing: '0.06em' }}>
                  Velg én eller flere
                </p>
                <div className="flex flex-wrap gap-2">
                  {mediumOptions.map((option) => (
                    <Button
                      key={option.value}
                      type="button"
                      onClick={() => toggleMedium(option.value)}
                      variant={formData.mediums.includes(option.value) ? 'primary' : 'secondary'}
                      size="sm"
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  {fieldLabel('Målgruppe', true)}
                  <Select
                    options={targetAudienceOptions}
                    placeholder="Velg målgruppe..."
                    value={formData.target_audience}
                    onChange={(e) => setFormData({ ...formData, target_audience: e.target.value })}
                    required
                  />
                </div>
                <div>
                  {fieldLabel('Bransje')}
                  <Select
                    options={industryOptions}
                    placeholder="Velg bransje..."
                    value={formData.industry}
                    onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
                  />
                </div>
              </div>

              <div>
                {fieldLabel('Omfang')}
                <Select
                  options={scopeOptions}
                  placeholder="Velg omfang..."
                  value={formData.scope}
                  onChange={(e) => setFormData({ ...formData, scope: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Section: Kontekst */}
          <div>
            {sectionDivider('Kontekst og bakgrunn')}
            <div>
              {fieldLabel('E-postutvekslinger / Brief / Notater')}
              <Textarea
                id="context"
                rows={8}
                value={formData.context}
                onChange={(e) => setFormData({ ...formData, context: e.target.value })}
                placeholder={`Lim inn e-postutvekslinger, brief-dokumenter eller møtenotater...\n\n– Hva ønsker kunden å oppnå?\n– Hva er budsjettrammene?\n– Er det spesielle krav eller ønsker?`}
              />
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: '#62594E', marginTop: 8, letterSpacing: '0.06em' }}>
                Jo mer kontekst, desto bedre AI-generering
              </p>
            </div>
          </div>

          {/* AI info */}
          <div style={{
            padding: '20px 24px',
            background: 'rgba(196,148,52,0.05)',
            border: '1px solid rgba(196,148,52,0.15)',
            borderRadius: 3,
          }}>
            <div className="flex items-center gap-3 mb-4">
              <div style={{ width: 16, height: 1, background: '#C49434', opacity: 0.5 }} />
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#C49434', fontWeight: 500 }}>
                AI genererer
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: '#9E9287', marginBottom: 6 }}>Innhold</p>
                <ul style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: '#62594E', lineHeight: 1.8 }}>
                  <li>Hero-tekst og introduksjon</li>
                  <li>Prosjektmål</li>
                  <li>Kreativt konsept</li>
                  <li>Tidslinje-beskrivelser</li>
                </ul>
              </div>
              <div>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: '#9E9287', marginBottom: 6 }}>Velger automatisk</p>
                <ul style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: '#62594E', lineHeight: 1.8 }}>
                  <li>Eksempelbilder</li>
                  <li>Team-medlemmer</li>
                  <li>Relevante cases</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="flex flex-col gap-4">
            {generatingStatus && (
              <div
                className="flex items-center gap-3 px-4 py-3"
                style={{
                  background: 'rgba(196,148,52,0.08)',
                  border: '1px solid rgba(196,148,52,0.25)',
                  borderRadius: 3,
                }}
              >
                <div
                  className="animate-spin flex-shrink-0"
                  style={{
                    width: 14,
                    height: 14,
                    border: '1.5px solid rgba(196,148,52,0.3)',
                    borderTop: '1.5px solid #C49434',
                    borderRadius: '50%',
                  }}
                />
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: '#C49434', letterSpacing: '0.04em' }}>
                  {generatingStatus}
                </span>
              </div>
            )}
            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={loading || !isFormValid}
                variant="primary"
                className="flex-1"
              >
                {loading
                  ? (generatingStatus || 'Oppretter prosjekt...')
                  : 'Opprett Prosjekt med AI'}
              </Button>
              <Button
                type="button"
                onClick={() => router.push('/admin')}
                variant="secondary"
                disabled={loading}
              >
                Avbryt
              </Button>
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0C0B09' }}>
        <div className="animate-spin" style={{ width: 24, height: 24, border: '1.5px solid #2A261F', borderTop: '1.5px solid #C49434', borderRadius: '50%' }} />
      </div>
    }>
      <NewProjectContent />
    </Suspense>
  )
}
