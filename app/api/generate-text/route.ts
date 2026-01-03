import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { createPublicClient } from '@/lib/supabase-server'

// Initialize OpenAI client lazily to avoid build-time errors
function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set')
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  })
}

export async function POST(req: NextRequest) {
  try {
    const { projectType, medium, targetAudience, sectionType } = await req.json()

    // Valider input
    if (!projectType || !medium || !targetAudience || !sectionType) {
      return Response.json({ error: 'Mangler påkrevd informasjon' }, { status: 400 })
    }

    const supabase = createPublicClient()

    // Hent eksempler fra database
    const { data: examplesData, error: examplesError } = await supabase
      .from('ai_examples')
      .select('example_text')
      .eq('section_type', sectionType)
      .eq('project_type', projectType)
      .order('quality_score', { ascending: false })
      .limit(5)

    if (examplesError) {
      console.error('Error fetching examples:', examplesError)
      return Response.json({ error: 'Kunne ikke hente eksempler' }, { status: 500 })
    }

    const examples = examplesData?.map(e => e.example_text) || []

    if (examples.length === 0) {
      return Response.json({ error: 'Ingen eksempler funnet for denne kombinasjonen' }, { status: 400 })
    }

    // Bygg prompt basert på seksjonstype
    const sectionNames: Record<string, string> = {
      goal: 'Mål',
      concept: 'Konsept'
    }

    const mediumLabels: Record<string, string> = {
      film: 'Film',
      photo: 'Foto',
      both: 'Film og Foto'
    }

    const audienceLabels: Record<string, string> = {
      youth: '18-35 år',
      professional: '35-55 år (Profesjonelle)',
      mature: '55+ år',
      b2b: 'B2B / Bedrifter',
      general: 'Generelt publikum'
    }

    const examplesText = examples
      .map((ex, i) => `Eksempel ${i + 1}:\n"${ex}"\n`)
      .join('\n')

    // Spesifikke prompts for hver seksjonstype
    const sectionPrompts: Record<string, { length: string, style: string, description: string }> = {
      goal: {
        length: '1-2 avsnitt, ca 50-80 ord totalt',
        style: 'Kortfattet, målrettet og konkret. Fokuser på hva vi skal oppnå.',
        description: 'Mål-seksjonen skal være kort og presis. Den skal tydelig kommunisere hva prosjektet skal oppnå.'
      },
      concept: {
        length: '2-3 avsnitt, ca 100-150 ord totalt',
        style: 'Utfyllende, kreativ og engasjerende. Beskriv ideen og konseptet i detalj.',
        description: 'Konsept-seksjonen skal være mer utfyllende og beskrive ideen, kreativiteten og tilnærmingen til prosjektet.'
      }
    }

    const sectionConfig = sectionPrompts[sectionType] || sectionPrompts.concept

    const prompt = `Du skriver prosjektbeskrivelser for Lea Films, et profesjonelt film- og fotoproduksjonsselskap i Norge.

Prosjektinfo:
- Type: ${projectType}
- Medium: ${mediumLabels[medium]}
- Målgruppe: ${audienceLabels[targetAudience]}

Du skal skrive en "${sectionNames[sectionType]}"-seksjon.

Krav til teksten:
- Profesjonell men engasjerende tone
- Konkret og målbar stil
- ${sectionConfig.length}
- ${sectionConfig.style}
- På norsk

${sectionConfig.description}

Her er ${examples.length} eksempler på tidligere "${sectionNames[sectionType]}"-seksjoner:

${examplesText}

Nå, skriv en ny "${sectionNames[sectionType]}"-seksjon for dette prosjektet. Følg samme stil, struktur og lengde som eksemplene, men tilpass innholdet til prosjekttypen, mediumet og målgruppen.`

    // Kall OpenAI
    const openai = getOpenAIClient()
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Du er en erfaren tekstforfatter som spesialiserer deg på prosjektbeskrivelser for film- og fotoproduksjon. Du skriver på norsk med profesjonell, men tilgjengelig språk. Du unngår å bruke overdrevent mange adjektiver. For "${sectionNames[sectionType]}"-seksjoner skal du følge lengde- og stilkravene nøye: ${sectionConfig.length}. ${sectionConfig.style}`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 500
    })

    let generatedText = completion.choices[0].message.content || ''

    // Fjern anførselstegn fra start og slutt hvis de finnes
    generatedText = generatedText.trim()
    // Fjern engelske anførselstegn (" ")
    if (generatedText.startsWith('"') && generatedText.endsWith('"')) {
      generatedText = generatedText.slice(1, -1).trim()
    }
    // Fjern norske anførselstegn (« »)
    if (generatedText.startsWith('«') && generatedText.endsWith('»')) {
      generatedText = generatedText.slice(1, -1).trim()
    }

    return Response.json({
      text: generatedText,
      usage: completion.usage
    })
  } catch (error) {
    console.error('Error generating text:', error)
    return Response.json(
      { error: 'Kunne ikke generere tekst. Sjekk at OPENAI_API_KEY er satt.' },
      { status: 500 }
    )
  }
}

