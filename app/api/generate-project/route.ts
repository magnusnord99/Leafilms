import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { createServiceClient } from '@/lib/supabase-server'

// Initialize OpenAI client lazily to avoid build-time errors
function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set')
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  })
}

// Labels for lesbar output
const contentTypeLabels: Record<string, string> = {
  film: 'Film',
  photo: 'Foto/Bilder',
  both: 'Film og Foto'
}

const projectTypeLabels: Record<string, string> = {
  commercial: 'Reklame/Markedsføring',
  documentary: 'Dokumentar',
  corporate: 'Bedriftsfilm',
  product: 'Produktfoto/-film',
  event: 'Event/Arrangement',
  music_video: 'Musikkkvideo',
  other: 'Annet'
}

const audienceLabels: Record<string, string> = {
  b2b: 'B2B (Bedrifter)',
  b2c: 'B2C (Forbrukere)',
  young_adults: 'Unge voksne (18-35)',
  families: 'Familier',
  professionals: 'Profesjonelle/Fagfolk',
  general: 'Generelt publikum'
}

const industryLabels: Record<string, string> = {
  outdoor: 'Outdoor/Natur',
  food_beverage: 'Mat & Drikke',
  fashion: 'Mote',
  tech: 'Tech/IT',
  sports: 'Sport',
  travel: 'Reise/Turisme',
  real_estate: 'Eiendom',
  health: 'Helse/Wellness',
  finance: 'Finans',
  culture: 'Kultur/Underholdning',
  other: 'Annet'
}

const mediumLabels: Record<string, string> = {
  social_media: 'Sosiale medier',
  tv: 'TV',
  cinema: 'Kino',
  web: 'Web/Nettside',
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  print: 'Print/Trykk'
}

export async function POST(req: NextRequest) {
  try {
    console.log('[generate-project] Starting project generation...')
    
    const { 
      projectId,
      title,
      clientName,
      contentType,
      projectType,
      mediums,
      targetAudience,
      industry,
      scope,
      context
    } = await req.json()

    console.log('[generate-project] Received data:', {
      projectId,
      title,
      contentType,
      projectType,
      targetAudience
    })

    // Valider påkrevd input
    if (!projectId || !contentType || !projectType || !targetAudience) {
      console.error('[generate-project] Missing required information')
      return Response.json({ error: 'Mangler påkrevd informasjon' }, { status: 400 })
    }

    let supabase
    try {
      supabase = createServiceClient()
      console.log('[generate-project] Service client created successfully')
    } catch (clientError: any) {
      console.error('[generate-project] Error creating service client:', clientError.message)
      return Response.json({ 
        error: 'Kunne ikke koble til database. Sjekk at SUPABASE_SERVICE_ROLE_KEY er satt.',
        details: clientError.message
      }, { status: 500 })
    }

    // Hent seksjoner for prosjektet
    const { data: sections, error: sectionsError } = await supabase
      .from('sections')
      .select('*')
      .eq('project_id', projectId)

    if (sectionsError) {
      console.error('Error fetching sections:', sectionsError)
      return Response.json({ error: 'Kunne ikke hente seksjoner' }, { status: 500 })
    }

    // Hent AI-eksempler for de ulike seksjonstypene
    const { data: aiExamples } = await supabase
      .from('ai_examples')
      .select('*')
      .order('quality_score', { ascending: false })

    // Grupper eksempler etter section_type
    const examplesByType: Record<string, string[]> = {}
    aiExamples?.forEach(ex => {
      if (!examplesByType[ex.section_type]) {
        examplesByType[ex.section_type] = []
      }
      if (examplesByType[ex.section_type].length < 3) {
        examplesByType[ex.section_type].push(ex.example_text)
      }
    })

    // Bygg kontekst-streng
    const mediumsText = mediums?.map((m: string) => mediumLabels[m] || m).join(', ') || 'Ikke spesifisert'
    
    const projectContext = `
PROSJEKTINFORMASJON:
- Tittel: ${title || 'Ikke satt'}
- Kunde: ${clientName || 'Ikke spesifisert'}
- Innholdstype: ${contentTypeLabels[contentType] || contentType}
- Prosjekttype: ${projectTypeLabels[projectType] || projectType}
- Plattformer: ${mediumsText}
- Målgruppe: ${audienceLabels[targetAudience] || targetAudience}
- Bransje: ${industry ? (industryLabels[industry] || industry) : 'Ikke spesifisert'}
- Omfang: ${scope || 'Ikke spesifisert'}

${context ? `EKSTRA KONTEKST FRA KUNDEN:\n${context}` : ''}
`.trim()

    // Generer tekster for hver seksjon
    const generatedContent: Record<string, any> = {}

    // 1. HERO-seksjon
    const heroSection = sections?.find(s => s.type === 'hero')
    if (heroSection) {
      const heroExamples = examplesByType['hero'] || []
      const heroText = await generateSectionText(
        'hero',
        projectContext,
        heroExamples,
        'Skriv en kort, engasjerende hero-tekst (2-3 setninger, maks 50 ord) som introduserer prosjektet. Den skal fange oppmerksomhet og gi en smakebit på hva prosjektet handler om.'
      )
      generatedContent.hero = { text: heroText }
    }

    // 2. MÅL-seksjon
    const goalSection = sections?.find(s => s.type === 'goal')
    if (goalSection) {
      const goalExamples = examplesByType['goal'] || []
      const goalText = await generateSectionText(
        'goal',
        projectContext,
        goalExamples,
        'Skriv prosjektmålene (1 kort setning, ca 20 ord). Fokuser på hva vi skal oppnå og hva kunden får ut av prosjektet. Vær konkret og målbar.'
      )
      generatedContent.goal = { text: goalText }
    }

    // 3. KONSEPT-seksjon
    const conceptSection = sections?.find(s => s.type === 'concept')
    if (conceptSection) {
      const conceptExamples = examplesByType['concept'] || []
      const conceptText = await generateSectionText(
        'concept',
        projectContext,
        conceptExamples,
        'Skriv det kreative konseptet (1-2 setninger, ca 50-80 ord). Beskriv ideen, den visuelle tilnærmingen og hvordan vi skal fortelle historien. Vær kreativ og engasjerende.'
      )
      generatedContent.concept = { text: conceptText }
    }

    // 4. TIDSLINJE-seksjon
    const timelineSection = sections?.find(s => s.type === 'timeline')
    if (timelineSection) {
      const timelineText = await generateTimelineItems(projectContext, contentType, scope)
      generatedContent.timeline = { timelineItems: timelineText }
    }

    // 4.5 LEVERANSER-seksjon (dynamisk basert på kontekst)
    const deliverablesSection = sections?.find(s => s.type === 'deliverables')
    if (deliverablesSection) {
      const deliverableItems = await generateDeliverables(projectContext, contentType, mediums, scope, context)
      generatedContent.deliverables = { 
        ...generatedContent.deliverables,
        deliverableItems 
      }
    }

    // 5. Velg TEAM-medlemmer
    const teamSection = sections?.find(s => s.type === 'team')
    if (teamSection) {
      const selectedTeamIds = await selectTeamMembers(contentType, projectType, scope)
      generatedContent.team = { selectedTeamIds }
      
      // 5.5 Legg til faste BTS-bilder i team-galleriet
      try {
        await addBTSImagesToTeamGallery(teamSection.id)
      } catch (error) {
        console.error('Error adding BTS images to team gallery:', error)
      }
    }

    // 6. Velg CASE STUDIES
    const casesSection = sections?.find(s => s.type === 'cases')
    if (casesSection) {
      const selectedCaseIds = await selectCaseStudies(contentType, projectType, industry)
      generatedContent.cases = { selectedCaseIds }
    }

    // 7. Velg BILDE-SETT for Eksempelarbeid
    const exampleWorkSection = sections?.find(s => s.type === 'example_work')
    if (exampleWorkSection) {
      const selectedPresetId = await selectCollagePreset(contentType, industry)
      generatedContent.example_work = { presetId: selectedPresetId }
      
      // Hvis vi har et preset, last inn bildene til seksjonen
      if (selectedPresetId) {
        await loadPresetImagesToSection(exampleWorkSection.id, selectedPresetId, projectId)
      }
    }

    // 8. Velg BAKGRUNNSBILDE for Hero
    if (heroSection) {
      try {
        console.log('[generate-project] Selecting hero image...')
        const heroImageId = await selectSectionImage(contentType, industry, 'hero')
        if (heroImageId) {
          console.log(`[generate-project] Hero image selected: ${heroImageId}, linking to section ${heroSection.id}...`)
          await linkImageToSection(heroSection.id, heroImageId, 'background')
          generatedContent.hero = { ...generatedContent.hero, imageId: heroImageId }
          console.log('[generate-project] ✅ Hero image linked successfully')
        } else {
          console.warn('[generate-project] ⚠️ No hero image selected')
        }
      } catch (error) {
        console.error('[generate-project] ❌ Error linking hero image:', error)
      }
    }

    // 9. Velg BAKGRUNNSBILDE for Konsept
    if (conceptSection) {
      try {
        console.log('[generate-project] Selecting concept image...')
        const conceptImageId = await selectSectionImage(contentType, industry, 'concept')
        if (conceptImageId) {
          console.log(`[generate-project] Concept image selected: ${conceptImageId}, linking to section ${conceptSection.id}...`)
          await linkImageToSection(conceptSection.id, conceptImageId, 'background')
          generatedContent.concept = { ...generatedContent.concept, imageId: conceptImageId }
          console.log('[generate-project] ✅ Concept image linked successfully')
        } else {
          console.warn('[generate-project] ⚠️ No concept image selected')
        }
      } catch (error) {
        console.error('[generate-project] ❌ Error linking concept image:', error)
      }
    }

    // 10. Velg BAKGRUNNSBILDE for Mål
    if (goalSection) {
      try {
        console.log('[generate-project] Selecting goal image...')
        const goalImageId = await selectSectionImage(contentType, industry, 'goal')
        if (goalImageId) {
          console.log(`[generate-project] Goal image selected: ${goalImageId}, linking to section ${goalSection.id}...`)
          await linkImageToSection(goalSection.id, goalImageId, 'background')
          generatedContent.goal = { ...generatedContent.goal, imageId: goalImageId }
          console.log('[generate-project] ✅ Goal image linked successfully')
        } else {
          console.warn('[generate-project] ⚠️ No goal image selected')
        }
      } catch (error) {
        console.error('[generate-project] ❌ Error linking goal image:', error)
      }
    }

    // 11. Velg BAKGRUNNSBILDE for Levering (bruker deliverablesSection fra steg 4.5)
    if (deliverablesSection) {
      try {
        console.log('[generate-project] Selecting deliverables image...')
        const deliverableImageId = await selectSectionImage(contentType, industry, 'deliverables')
        if (deliverableImageId) {
          console.log(`[generate-project] Deliverables image selected: ${deliverableImageId}, linking to section ${deliverablesSection.id}...`)
          await linkImageToSection(deliverablesSection.id, deliverableImageId, 'background')
          generatedContent.deliverables = { ...generatedContent.deliverables, imageId: deliverableImageId }
          console.log('[generate-project] ✅ Deliverables image linked successfully')
        } else {
          console.warn('[generate-project] ⚠️ No deliverables image selected')
        }
      } catch (error) {
        console.error('[generate-project] ❌ Error linking deliverables image:', error)
      }
    }

    // Oppdater seksjonene i databasen
    console.log('Updating sections with generated content:', generatedContent)
    for (const section of sections || []) {
      const content = generatedContent[section.type]
      if (content) {
        console.log(`Updating section ${section.id} (${section.type}) with:`, content)
        if (section.type === 'team' && content.selectedTeamIds) {
          // For team, lagre i section_team_members tabellen
          await supabase
            .from('section_team_members')
            .delete()
            .eq('section_id', section.id)

          if (content.selectedTeamIds.length > 0) {
            const teamInserts = content.selectedTeamIds.map((teamId: string, idx: number) => ({
              section_id: section.id,
              team_member_id: teamId,
              order_index: idx
            }))
            await supabase.from('section_team_members').insert(teamInserts)
          }
        } else if (section.type === 'cases' && content.selectedCaseIds) {
          // For cases, lagre i section_case_studies tabellen
          await supabase
            .from('section_case_studies')
            .delete()
            .eq('section_id', section.id)

          if (content.selectedCaseIds.length > 0) {
            const caseInserts = content.selectedCaseIds.map((caseId: string, idx: number) => ({
              section_id: section.id,
              case_study_id: caseId,
              order_index: idx
            }))
            await supabase.from('section_case_studies').insert(caseInserts)
          }
        } else if (section.type === 'example_work' && content.presetId) {
          // For example_work, lagre preset-referansen i content
          await supabase
            .from('sections')
            .update({ 
              content: { ...section.content, presetId: content.presetId },
              updated_at: new Date().toISOString()
            })
            .eq('id', section.id)
        } else {
          // For andre seksjoner, oppdater content direkte
          const currentContent = section.content || {}
          const { error: updateError } = await supabase
            .from('sections')
            .update({ 
              content: { ...currentContent, ...content },
              updated_at: new Date().toISOString()
            })
            .eq('id', section.id)
          
          if (updateError) {
            console.error(`Error updating section ${section.id} (${section.type}):`, updateError)
          } else {
            console.log(`Successfully updated section ${section.id} (${section.type}) with content:`, content)
          }
        }
      }
    }

    console.log('[generate-project] ✅ Project generation completed successfully!')
    console.log('[generate-project] Generated content summary:', {
      hero: generatedContent.hero ? '✅' : '❌',
      goal: generatedContent.goal ? '✅' : '❌',
      concept: generatedContent.concept ? '✅' : '❌',
      timeline: generatedContent.timeline ? '✅' : '❌',
      deliverables: generatedContent.deliverables ? '✅' : '❌',
      team: generatedContent.team ? '✅' : '❌',
      cases: generatedContent.cases ? '✅' : '❌',
      example_work: generatedContent.example_work ? '✅' : '❌'
    })

    return Response.json({
      success: true,
      generatedContent,
      message: 'Prosjekt generert med tekst og bilder'
    })

  } catch (error: any) {
    console.error('[generate-project] Error generating project:', error)
    console.error('[generate-project] Error stack:', error.stack)
    return Response.json(
      { 
        error: 'Kunne ikke generere prosjekt',
        details: error.message || 'Unknown error',
        hint: 'Sjekk at OPENAI_API_KEY og SUPABASE_SERVICE_ROLE_KEY er satt i miljøvariablene'
      },
      { status: 500 }
    )
  }
}

// Hjelpefunksjon for å generere tekst for en seksjon
async function generateSectionText(
  sectionType: string,
  projectContext: string,
  examples: string[],
  instructions: string
): Promise<string> {
  const examplesText = examples.length > 0
    ? `\n\nHER ER EKSEMPLER PÅ GODE TEKSTER:\n${examples.map((ex, i) => `${i + 1}. "${ex}"`).join('\n\n')}`
    : ''

  const prompt = `${projectContext}

OPPGAVE: ${instructions}
${examplesText}

Skriv teksten nå. Kun teksten, ingen overskrifter eller ekstra formattering.`

  const openai = getOpenAIClient()
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'Du er en erfaren tekstforfatter for Leafilms, et profesjonelt film- og fotoproduksjonsselskap i Norge. Du skriver på norsk med profesjonell men tilgjengelig tone. Unngå klisjeer og overdrevne adjektiver. Vær konkret og engasjerende.'
      },
      { role: 'user', content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 400
  })

  let text = completion.choices[0].message.content || ''
  
  // Rens teksten
  text = text.trim()
  if (text.startsWith('"') && text.endsWith('"')) text = text.slice(1, -1).trim()
  if (text.startsWith('«') && text.endsWith('»')) text = text.slice(1, -1).trim()
  
  return text
}

// Generer tidslinje-elementer
async function generateTimelineItems(
  projectContext: string,
  contentType: string,
  scope: string
): Promise<Array<{ title: string; text: string }>> {
  const prompt = `${projectContext}

OPPGAVE: Lag 4 tidslinje-faser for dette prosjektet. Hver fase skal ha en kort tittel (1-2 ord) og en beskrivelse (1-2 setninger, maks 30 ord).

Fasene skal typisk være:
1. Pre-produksjon (planlegging, research, konseptutvikling)
2. Produksjon (opptak, fotografering)
3. Post-produksjon (redigering, etterarbeid)
4. Levering (eksport, overlevering)

Tilpass innholdet til prosjekttypen (${contentType === 'photo' ? 'fotoprosjekt' : contentType === 'film' ? 'filmprosjekt' : 'film- og fotoprosjekt'}).

Svar i dette JSON-formatet:
[
  { "title": "FASE-TITTEL", "text": "Kort beskrivelse av fasen." },
  ...
]`

  const openai = getOpenAIClient()
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'Du er en prosjektleder for film- og fotoproduksjoner. Svar kun med gyldig JSON.'
      },
      { role: 'user', content: prompt }
    ],
    temperature: 0.5,
    max_tokens: 500
  })

  try {
    const text = completion.choices[0].message.content || '[]'
    // Finn JSON i responsen
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  } catch (e) {
    console.error('Error parsing timeline JSON:', e)
  }

  // Fallback
  return [
    { title: 'PRE-PRODUKSJON', text: 'Idéutvikling, moodboards og planlegging av konsept.' },
    { title: 'PRODUKSJON', text: 'Gjennomføring av opptak og sikring av materiale.' },
    { title: 'POST-PRODUKSJON', text: 'Redigering, fargekorrigering og ferdigstilling.' },
    { title: 'LEVERING', text: 'Eksport og overlevering til kunden.' }
  ]
}

// Velg team-medlemmer basert på prosjekttype
async function selectTeamMembers(
  contentType: string,
  projectType: string,
  scope: string
): Promise<string[]> {
  const supabase = createServiceClient()
  // Hent alle team-medlemmer med deres roller/tags
  const { data: teamMembers } = await supabase
    .from('team_members')
    .select('id, name, role, tags')
    .order('order_index')

  if (!teamMembers || teamMembers.length === 0) return []

  // Bestem hvor mange team-medlemmer basert på omfang
  const teamSize = scope === 'large' ? 4 : scope === 'medium' ? 3 : 2

  // Prioriter basert på innholdstype
  const priorityRoles: string[] = []
  
  if (contentType === 'film' || contentType === 'both') {
    priorityRoles.push('regissør', 'produsent', 'fotograf', 'kameramann', 'editor', 'redigerer')
  }
  if (contentType === 'photo' || contentType === 'both') {
    priorityRoles.push('fotograf', 'produsent', 'retusjør', 'stylist')
  }

  // Scorer team-medlemmer
  const scored = teamMembers.map(member => {
    let score = 0
    const roleLower = member.role?.toLowerCase() || ''
    const tagsLower = member.tags?.map((t: string) => t.toLowerCase()) || []

    // Sjekk rolle-match
    priorityRoles.forEach(pr => {
      if (roleLower.includes(pr)) score += 10
      if (tagsLower.some((t: string) => t.includes(pr))) score += 5
    })

    // Sjekk prosjekttype-match
    if (tagsLower.includes(projectType)) score += 5

    return { ...member, score }
  })

  // Sorter etter score og velg de beste
  scored.sort((a, b) => b.score - a.score)
  
  return scored.slice(0, teamSize).map(m => m.id)
}

// Velg case studies basert på relevans
async function selectCaseStudies(
  contentType: string,
  projectType: string,
  industry: string
): Promise<string[]> {
  const supabase = createServiceClient()
  const { data: cases } = await supabase
    .from('case_studies')
    .select('id, title, tags')
    .order('order_index')
    .limit(10)

  if (!cases || cases.length === 0) return []

  // Scorer case studies
  const scored = cases.map(caseStudy => {
    let score = 0
    const tagsLower = caseStudy.tags?.map((t: string) => t.toLowerCase()) || []
    const titleLower = caseStudy.title?.toLowerCase() || ''

    // Sjekk innholdstype
    if (contentType === 'film' && (tagsLower.includes('film') || tagsLower.includes('video'))) score += 10
    if (contentType === 'photo' && (tagsLower.includes('foto') || tagsLower.includes('photo'))) score += 10
    
    // Sjekk prosjekttype
    if (tagsLower.includes(projectType)) score += 5

    // Sjekk bransje
    if (industry && tagsLower.includes(industry)) score += 8

    return { ...caseStudy, score }
  })

  // Sorter og velg topp 4
  scored.sort((a, b) => b.score - a.score)
  
  return scored.slice(0, 4).map(c => c.id)
}

// Velg bilde-sett basert på relevans
async function selectCollagePreset(
  contentType: string,
  industry: string
): Promise<number | null> {
  const supabase = createServiceClient()
  const { data: presets } = await supabase
    .from('collage_presets')
    .select('id, name, keywords')

  if (!presets || presets.length === 0) return null

  // Scorer presets
  const scored = presets.map(preset => {
    let score = 0
    const keywordsLower = preset.keywords?.map((k: string) => k.toLowerCase()) || []
    const nameLower = preset.name?.toLowerCase() || ''

    // Sjekk innholdstype
    if (contentType === 'film' && (keywordsLower.includes('film') || keywordsLower.includes('video'))) score += 10
    if (contentType === 'photo' && (keywordsLower.includes('foto') || keywordsLower.includes('photo'))) score += 10
    
    // Sjekk bransje
    if (industry) {
      if (keywordsLower.includes(industry)) score += 8
      if (nameLower.includes(industry)) score += 5
    }

    return { ...preset, score }
  })

  // Sorter og velg beste match
  scored.sort((a, b) => b.score - a.score)
  
  return scored[0]?.id || null
}

// Generer leveranser basert på prosjektinfo og kontekst
async function generateDeliverables(
  projectContext: string,
  contentType: string,
  mediums: string[],
  scope: string,
  context: string
): Promise<Array<{ id: string; title: string; quantity: string; format: string; description: string }>> {
  
  const prompt = `${projectContext}

OPPGAVE: Basert på prosjektinformasjonen over, foreslå 3-5 konkrete leveranser (deliverables) for dette prosjektet.

Hver leveranse skal ha:
- title: Kort navn på leveransen (f.eks. "PRODUKTBILDER", "HOVEDFILM", "INSTAGRAM REELS", "DOKUMENTASJON")
- quantity: Kun antall (f.eks. "20 stk", "1 stk", "5 stk")
- format: Format/aspect ratio/varighet (f.eks. "16:9", "9:16", "1:1", "2:30 min", "30 sek")
- description: En kort beskrivelse (1-2 setninger) av hva leveransen innebærer

Tilpass leveransene til:
- Innholdstype: ${contentType === 'film' ? 'Film' : contentType === 'photo' ? 'Foto' : 'Film og Foto'}
- Plattformer: ${mediums?.join(', ') || 'Ikke spesifisert'}
- Omfang: ${scope || 'Ikke spesifisert'}

${context ? `Legg spesielt merke til eventuelle spesifikke ønsker i konteksten.` : ''}

Svar BARE med gyldig JSON i dette formatet:
[
  { "id": "1", "title": "TITTEL", "quantity": "antall", "format": "format", "description": "Kort beskrivelse" },
  ...
]`

  try {
    const openai = getOpenAIClient()
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Du er en erfaren prosjektleder for film- og fotoproduksjoner. Du foreslår konkrete, realistiske leveranser. Svar kun med gyldig JSON.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.6,
      max_tokens: 600
    })

    const text = completion.choices[0].message.content || '[]'
    
    // Finn JSON i responsen
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      // Sørg for at alle items har riktig struktur
      return parsed.map((item: any, index: number) => ({
        id: item.id || String(index + 1),
        title: item.title || 'LEVERANSE',
        quantity: item.quantity || '',
        format: item.format || '',
        description: item.description || ''
      }))
    }
  } catch (e) {
    console.error('Error generating deliverables:', e)
  }

  // Fallback basert på innholdstype
  if (contentType === 'film') {
    return [
      { id: '1', title: 'HOVEDFILM', quantity: '1 stk', format: '16:9 - 2:00 min', description: 'Ferdig redigert hovedfilm med fargekorrigering og lyddesign.' },
      { id: '2', title: 'CUTDOWNS', quantity: '3 stk', format: '30 sek', description: 'Kortere versjoner tilpasset ulike plattformer.' },
      { id: '3', title: 'BEHIND THE SCENES', quantity: '1 stk', format: '1:00 min', description: 'Dokumentasjon av produksjonsprosessen.' }
    ]
  } else if (contentType === 'photo') {
    return [
      { id: '1', title: 'PRODUKTBILDER', quantity: '20 stk', format: '3:2', description: 'Profesjonelle produktbilder med retusjering.' },
      { id: '2', title: 'LIVSSTILSBILDER', quantity: '10 stk', format: '16:9', description: 'Bilder som viser produktet i bruk.' },
      { id: '3', title: 'SOSIALE MEDIER', quantity: '15 stk', format: '1:1', description: 'Tilpassede bilder for Instagram og Facebook.' }
    ]
  } else {
    return [
      { id: '1', title: 'HOVEDFILM', quantity: '1 stk', format: '16:9 - 2:00 min', description: 'Ferdig redigert hovedfilm med fargekorrigering.' },
      { id: '2', title: 'PRODUKTBILDER', quantity: '15 stk', format: '3:2', description: 'Profesjonelle produktbilder med retusjering.' },
      { id: '3', title: 'REELS', quantity: '5 stk', format: '9:16 - 15 sek', description: 'Korte videoer for sosiale medier.' }
    ]
  }
}

// Velg et passende bilde for en seksjon basert på type og prosjektinfo
async function selectSectionImage(
  contentType: string,
  industry: string,
  sectionType: 'hero' | 'deliverables' | 'concept' | 'goal'
): Promise<string | null> {
  const supabase = createServiceClient()
  // Hent bilder fra biblioteket
  const { data: images, error: imagesError } = await supabase
    .from('images')
    .select('id, category, subcategory, tags, title')
    .limit(50)

  if (imagesError) {
    console.error(`Error fetching images for ${sectionType}:`, imagesError)
    return null
  }

  if (!images || images.length === 0) {
    console.warn(`No images found in database for ${sectionType}`)
    return null
  }

  console.log(`Found ${images.length} images to choose from for ${sectionType}`)

  // Definer preferanser basert på seksjonstype
  const sectionPreferences: Record<string, string[]> = {
    hero: ['landskap', 'action', 'outdoor', 'nature', 'hero', 'wide'],
    concept: ['kreativ', 'konsept', 'mood', 'atmosphere', 'artistic'],
    goal: ['fokus', 'detail', 'closeup', 'product', 'action'],
    deliverables: ['production', 'equipment', 'arbeid', 'kamera']
  }

  const preferences = sectionPreferences[sectionType] || []

  // Scorer bilder
  const scored = images.map(image => {
    let score = 0
    const categoryLower = image.category?.toLowerCase() || ''
    const subcategoryLower = image.subcategory?.toLowerCase() || ''
    const tagsLower = image.tags?.map((t: string) => t.toLowerCase()) || []
    const titleLower = image.title?.toLowerCase() || ''

    // Sjekk seksjons-preferanser
    preferences.forEach(pref => {
      if (categoryLower.includes(pref)) score += 10
      if (subcategoryLower.includes(pref)) score += 8
      if (tagsLower.some((t: string) => t.includes(pref))) score += 5
      if (titleLower.includes(pref)) score += 3
    })

    // Sjekk innholdstype
    if (contentType === 'film' && (tagsLower.includes('film') || tagsLower.includes('video'))) score += 5
    if (contentType === 'photo' && (tagsLower.includes('foto') || tagsLower.includes('photo'))) score += 5

    // Sjekk bransje-match
    if (industry) {
      if (categoryLower.includes(industry)) score += 8
      if (subcategoryLower.includes(industry)) score += 6
      if (tagsLower.includes(industry)) score += 4
    }

    // Gi bonus for bilder med høy oppløsning (bra for bakgrunner)
    // Kan legges til senere hvis vi har width/height data

    return { ...image, score }
  })

  // Sorter og velg beste match
  scored.sort((a, b) => b.score - a.score)

  // Returner beste match hvis score > 0, ellers tilfeldig
  if (scored[0]?.score > 0) {
    console.log(`Selected image ${scored[0].id} for ${sectionType} with score ${scored[0].score}`)
    return scored[0].id
  }
  
  // Fallback: returner et tilfeldig bilde
  const randomIndex = Math.floor(Math.random() * images.length)
  const selectedId = images[randomIndex]?.id || null
  console.log(`Selected random image ${selectedId} for ${sectionType} (no high-scoring matches)`)
  return selectedId
}

// Koble et bilde til en seksjon
async function linkImageToSection(
  sectionId: string,
  imageId: string,
  position: string = 'background'
): Promise<void> {
  const supabase = createServiceClient()
  // Slett eksisterende kobling først (for å unngå duplikater)
  const { error: deleteError } = await supabase
    .from('section_images')
    .delete()
    .eq('section_id', sectionId)
    .eq('position', position)

  if (deleteError) {
    console.error(`Error deleting existing section_images for section ${sectionId}:`, deleteError)
  }

  // Opprett ny kobling
  const { error: insertError } = await supabase
    .from('section_images')
    .insert({
      section_id: sectionId,
      image_id: imageId,
      position: position,
      order_index: 0
    })

  if (insertError) {
    console.error(`Error linking image ${imageId} to section ${sectionId} (${position}):`, insertError)
    throw insertError
  } else {
    console.log(`Successfully linked image ${imageId} to section ${sectionId} (${position})`)
  }
}

// Legg til faste BTS-bilder i team-seksjonens galleri
async function addBTSImagesToTeamGallery(teamSectionId: string): Promise<void> {
  const supabase = createServiceClient()
  // Hent alle BTS-bilder fra biblioteket
  const { data: btsImages, error } = await supabase
    .from('images')
    .select('id')
    .eq('category', 'bts')
    .order('created_at', { ascending: true })
    .limit(10) // Maks 10 BTS-bilder

  if (error) {
    console.error('Error fetching BTS images:', error)
    return
  }

  if (!btsImages || btsImages.length === 0) {
    console.log('No BTS images found for team gallery')
    return
  }

  console.log(`Found ${btsImages.length} BTS images for team gallery`)

  // Slett eksisterende galleri-bilder for denne seksjonen
  const { error: deleteError } = await supabase
    .from('section_images')
    .delete()
    .eq('section_id', teamSectionId)
    .eq('position', 'gallery')

  if (deleteError) {
    console.error(`Error deleting existing gallery images for section ${teamSectionId}:`, deleteError)
  }

  // Legg til BTS-bildene i galleriet
  const inserts = btsImages.map((img, index) => ({
    section_id: teamSectionId,
    image_id: img.id,
    order_index: index,
    position: 'gallery'
  }))

  const { error: insertError } = await supabase
    .from('section_images')
    .insert(inserts)

  if (insertError) {
    console.error(`Error inserting BTS images to section ${teamSectionId}:`, insertError)
    throw insertError
  } else {
    console.log(`Successfully added ${inserts.length} BTS images to team gallery (section ${teamSectionId})`)
  }
}

// Last inn bilder fra et preset til example_work seksjonen
async function loadPresetImagesToSection(
  sectionId: string,
  presetId: number,
  projectId: string
): Promise<void> {
  const supabase = createServiceClient()
  // Hent bilder fra preset
  const { data: presetImages } = await supabase
    .from('collage_preset_images')
    .select('image_id, position')
    .eq('preset_id', presetId)

  if (!presetImages || presetImages.length === 0) {
    console.log(`No preset images found for preset ${presetId}`)
    return
  }

  // Sorter manuelt basert på position (pos1, pos2, etc.)
  presetImages.sort((a: any, b: any) => {
    const aMatch = a.position?.match(/pos(\d+)/)
    const bMatch = b.position?.match(/pos(\d+)/)
    const aNum = aMatch ? parseInt(aMatch[1]) : 999
    const bNum = bMatch ? parseInt(bMatch[1]) : 999
    return aNum - bNum
  })

  // Slett eksisterende section_images for denne seksjonen
  await supabase
    .from('section_images')
    .delete()
    .eq('section_id', sectionId)

  // Opprett nye koblinger i section_images (samme struktur som andre seksjoner)
  // Map position (pos1, pos2, etc.) til order_index (0, 1, 2, etc.)
  const inserts = presetImages.map((pi: any, index: number) => {
    // Extract position number from "pos1", "pos2", etc.
    const positionMatch = pi.position?.match(/pos(\d+)/)
    const orderIndex = positionMatch ? parseInt(positionMatch[1]) - 1 : index
    
    return {
      section_id: sectionId,
      image_id: pi.image_id,
      order_index: orderIndex,
      position: 'gallery' // Use 'gallery' position for collage images
    }
  })

  const { error: insertError } = await supabase
    .from('section_images')
    .insert(inserts)

  if (insertError) {
    console.error('Error inserting preset images to section_images:', insertError)
  } else {
    console.log(`Successfully loaded ${inserts.length} preset images to section ${sectionId}`)
  }
}

