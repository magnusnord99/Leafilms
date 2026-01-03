'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button, Input, Select, Textarea, Card } from '@/components/ui'
import { Customer } from '@/lib/types'

// Dropdown-alternativer
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

// Medium-alternativer for multi-valg
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
    content_type: '', // Film / Bilder / Begge
    project_type: '',
    mediums: [] as string[], // Multi-valg
    target_audience: '',
    industry: '',
    scope: '',
    context: '' // For e-postutvekslinger og annen kontekst
  })

  // Hent eksisterende kunder
  useEffect(() => {
    fetchCustomers()
    
    // Hvis customer_id er i URL, sett kundenavn
    const customerId = searchParams.get('customer_id')
    if (customerId) {
      setSelectedCustomerId(customerId)
    }
  }, [searchParams])

  useEffect(() => {
    if (selectedCustomerId) {
      const customer = customers.find(c => c.id === selectedCustomerId)
      if (customer) {
        setCustomerInput(customer.name)
      }
    }
  }, [selectedCustomerId, customers])

  async function fetchCustomers() {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('name', { ascending: true })

    if (!error && data) {
      setCustomers(data as Customer[])
    }
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
      // Håndter kunde: finn eksisterende eller opprett ny
      let customerId: string | null = selectedCustomerId
      let clientName: string = customerInput.trim()

      if (customerInput.trim()) {
        // Sjekk om kundenavnet matcher en eksisterende kunde
        const existingCustomer = customers.find(
          c => c.name.toLowerCase() === customerInput.trim().toLowerCase()
        )

        if (existingCustomer) {
          // Bruk eksisterende kunde
          customerId = existingCustomer.id
          clientName = existingCustomer.name
        } else {
          // Opprett ny kunde
          const { data: newCustomer, error: customerError } = await supabase
            .from('customers')
            .insert({
              name: customerInput.trim(),
              company: customerInput.trim() // Bruk navnet som firmanavn også
            })
            .select()
            .single()

          if (customerError) {
            console.error('Error creating customer:', customerError)
            // Fortsett uten kunde hvis opprettelse feiler
          } else {
            customerId = newCustomer.id
            clientName = newCustomer.name
            // Oppdater kundelisten
            setCustomers([...customers, newCustomer as Customer])
          }
        }
      }

      // Generer slug fra tittel med unik suffix for å unngå duplikater
      const baseSlug = formData.title
        .toLowerCase()
        .replace(/æ/g, 'ae')
        .replace(/ø/g, 'o')
        .replace(/å/g, 'aa')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
      
      // Legg til kort unik ID (siste 6 tegn av timestamp)
      const uniqueSuffix = Date.now().toString(36).slice(-6)
      const slug = `${baseSlug}-${uniqueSuffix}`

      // Opprett prosjekt med metadata
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
          title: formData.title,
          slug: slug,
          client_name: clientName, // Behold for bakoverkompatibilitet
          customer_id: customerId, // Ny kunde-kobling
          status: 'draft',
          // Lagre AI-metadata i en egen kolonne eller som JSON
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

      // Opprett standard-seksjoner
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

      const sectionsToInsert = sections.map(s => ({
        project_id: project.id,
        ...s
      }))

      const { error: sectionsError } = await supabase
        .from('sections')
        .insert(sectionsToInsert)

      if (sectionsError) throw sectionsError

      // Kjør AI-generering
      setGeneratingStatus('Genererer innhold med AI...')
      
      try {
        const aiResponse = await fetch('/api/generate-project', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: project.id,
            title: formData.title,
            clientName: clientName,
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
          let errorMessage = 'Unknown error'
          try {
            const errorData = await aiResponse.json()
            errorMessage = errorData.error || errorData.message || 'Unknown error'
            console.error('AI generation failed:', errorMessage)
            console.error('Response status:', aiResponse.status)
            console.error('Full error data:', errorData)
          } catch (e) {
            // If response is not JSON, try to get text
            try {
              const errorText = await aiResponse.text()
              console.error('AI generation failed (non-JSON response):', errorText)
              errorMessage = errorText || `HTTP ${aiResponse.status}`
            } catch (textError) {
              console.error('AI generation failed:', `HTTP ${aiResponse.status}`)
            }
          }
          // Fortsett selv om AI feiler - prosjektet er opprettet
        } else {
          try {
            const aiData = await aiResponse.json()
            console.log('AI generation successful:', aiData)
          } catch (e) {
            console.warn('AI generation response was not JSON, but status was OK')
          }
        }
      } catch (aiError) {
        console.error('AI generation error:', aiError)
        // Fortsett selv om AI feiler
      }

      // Vent litt for å sikre at alle database-oppdateringer er ferdig
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Redirect til prosjekt-editoren med query parameter for å trigge refresh
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
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <Button
            variant="ghost"
            onClick={() => router.push('/admin')}
            className="mb-4 -ml-2"
          >
            ← Tilbake
          </Button>
          <h1 className="text-4xl font-bold mb-2">Nytt Prosjekt</h1>
          <p className="text-gray-400">Fyll inn informasjon så genererer AI et utkast for deg</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Grunnleggende info */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-300 border-b border-gray-800 pb-2">
              Grunnleggende informasjon
            </h2>
            
            <Input
              label="Prosjekttittel *"
              type="text"
              id="title"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Nike Produktlansering 2025"
            />

            {/* Kundevelger med autocomplete */}
            <div>
              <label htmlFor="customer" className="block text-sm font-medium mb-2 text-admin-text-muted">
                Kunde
              </label>
              <div className="relative">
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
                    // Når brukeren klikker utenfor, sjekk om det matcher en eksisterende kunde
                    const match = customers.find(
                      c => c.name.toLowerCase() === e.target.value.trim().toLowerCase()
                    )
                    if (match) {
                      setSelectedCustomerId(match.id)
                      setCustomerInput(match.name)
                    }
                  }}
                  placeholder="Skriv navn eller velg fra listen..."
                  className="w-full px-4 py-2 bg-admin-surface border border-admin-border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white focus:border-transparent"
                />
                <datalist id="customers-list">
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.name}>
                      {customer.company ? `${customer.name} (${customer.company})` : customer.name}
                    </option>
                  ))}
                </datalist>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                💡 Velg fra listen eller skriv inn et nytt navn for å opprette ny kunde
              </p>
            </div>
          </div>

          {/* Prosjektdetaljer */}
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-300 border-b border-gray-800 pb-2">
              Prosjektdetaljer
            </h2>
            
            {/* Innholdstype og Prosjekttype */}
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Innholdstype *"
                options={contentTypeOptions}
                placeholder="Film eller bilder?"
                value={formData.content_type}
                onChange={(e) => setFormData({ ...formData, content_type: e.target.value })}
                required
              />

              <Select
                label="Prosjekttype *"
                options={projectTypeOptions}
                placeholder="Velg type..."
                value={formData.project_type}
                onChange={(e) => setFormData({ ...formData, project_type: e.target.value })}
                required
              />
            </div>

            {/* Medium - Multi-valg */}
            <div>
              <label className="block text-sm font-medium mb-3 text-admin-text-muted">
                Medium/Plattform * <span className="text-gray-500 font-normal">(velg én eller flere)</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {mediumOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => toggleMedium(option.value)}
                    className={`px-4 py-2 rounded-lg text-sm transition-all ${
                      formData.mediums.includes(option.value)
                        ? 'bg-white text-black font-medium'
                        : 'bg-admin-surface-light border border-admin-border text-admin-text hover:bg-admin-surface-light/80'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Målgruppe og Bransje */}
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Målgruppe *"
                options={targetAudienceOptions}
                placeholder="Velg målgruppe..."
                value={formData.target_audience}
                onChange={(e) => setFormData({ ...formData, target_audience: e.target.value })}
                required
              />

              <Select
                label="Bransje"
                options={industryOptions}
                placeholder="Velg bransje..."
                value={formData.industry}
                onChange={(e) => setFormData({ ...formData, industry: e.target.value })}
              />
            </div>

            <Select
              label="Omfang"
              options={scopeOptions}
              placeholder="Velg omfang..."
              value={formData.scope}
              onChange={(e) => setFormData({ ...formData, scope: e.target.value })}
            />
          </div>

          {/* Kontekst */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-300 border-b border-gray-800 pb-2">
              Kontekst og bakgrunn
            </h2>
            
            <Textarea
              label="E-postutvekslinger / Brief / Notater"
              id="context"
              rows={8}
              value={formData.context}
              onChange={(e) => setFormData({ ...formData, context: e.target.value })}
              placeholder="Lim inn e-postutvekslinger med kunden, brief-dokumenter, møtenotater eller annen relevant informasjon som gir kontekst til prosjektet...

Eksempel:
- Hva ønsker kunden å oppnå?
- Hva er budsjettrammene?
- Er det spesielle krav eller ønsker?
- Tidligere samarbeid eller referanser?"
            />
            <p className="text-sm text-gray-500">
              💡 Jo mer kontekst du gir, desto bedre blir AI-genereringen
            </p>
          </div>

          {/* Info Box */}
          <Card>
            <p className="text-sm text-gray-400 mb-3">
              🤖 AI vil generere følgende basert på dine valg:
            </p>
            <ul className="space-y-1 text-sm text-gray-500">
              <li>✓ Hero-tekst og introduksjon</li>
              <li>✓ Prosjektmål</li>
              <li>✓ Kreativt konsept</li>
              <li>✓ Tidslinje-beskrivelser</li>
            </ul>
            <p className="text-sm text-gray-400 mt-4 mb-3">
              📸 AI vil velge relevant innhold:
            </p>
            <ul className="space-y-1 text-sm text-gray-500">
              <li>✓ Eksempelbilder (bilde-sett)</li>
              <li>✓ Team-medlemmer</li>
              <li>✓ Relevante case studies</li>
            </ul>
            <p className="text-xs text-gray-600 mt-4">
              ℹ️ Faste tekster som Levering og Team-intro genereres ikke
            </p>
          </Card>

          {/* Submit */}
          <div className="flex flex-col gap-4">
            {generatingStatus && (
              <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-4 flex items-center gap-3">
                <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
                <span className="text-blue-300">{generatingStatus}</span>
              </div>
            )}
            <div className="flex gap-4">
              <Button
                type="submit"
                disabled={loading || !isFormValid}
                variant="primary"
                className="flex-1"
              >
                {loading 
                  ? (generatingStatus || 'Oppretter prosjekt...') 
                  : '🚀 Opprett Prosjekt med AI'
                }
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
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-white border-t-transparent rounded-full" />
      </div>
    }>
      <NewProjectContent />
    </Suspense>
  )
}
