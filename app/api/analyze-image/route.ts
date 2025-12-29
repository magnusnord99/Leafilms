import { NextRequest } from 'next/server'
import OpenAI from 'openai'

// Initialize OpenAI client lazily to avoid build-time errors
function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set')
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  })
}

// Kategorier og underkategorier vi bruker
const categories = {
  landskap: ['fjell', 'kyst', 'by', 'natur', 'skog'],
  sport: ['ski', 'løping', 'sykkel', 'vannsport', 'klatring', 'fotball'],
  closeup: ['produkt', 'detalj', 'tekstur', 'ansikt'],
  portrett: ['enkel', 'gruppe', 'bedrift'],
  event: ['konsert', 'konferanse', 'festival', 'sport'],
  kommersiell: ['produkt', 'merkevare', 'reklame'],
  abstrakt: ['kunst', 'mønster', 'farge'],
  bts: ['opptak', 'rigging', 'team', 'utstyr', 'lokasjon']
}

export async function POST(req: NextRequest) {
  try {
    const { imageUrl } = await req.json()

    if (!imageUrl) {
      return Response.json({ error: 'Mangler bilde-URL' }, { status: 400 })
    }

    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ error: 'OpenAI API-nøkkel ikke konfigurert' }, { status: 500 })
    }

    // Analyser bildet med OpenAI Vision API
    const openai = getOpenAIClient()
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o', // Bruker gpt-4o for bildeanalyse
      messages: [
        {
          role: 'system',
          content: `Du er en ekspert på å kategorisere og tagge bilder for et film- og fotoproduksjonsselskap.

Kategorier:
- landskap (fjell, kyst, by, natur, skog)
- sport (ski, løping, sykkel, vannsport, klatring, fotball)
- closeup (produkt, detalj, tekstur, ansikt)
- portrett (enkel, gruppe, bedrift)
- event (konsert, konferanse, festival, sport)
- kommersiell (produkt, merkevare, reklame)
- abstrakt (kunst, mønster, farge)
- bts (opptak, rigging, team, utstyr, lokasjon) - Behind The Scenes: bilder fra filmproduksjon, kamerautstyr, filmcrew i arbeid, kamera-rigg, lysoppsett, produksjonslokasjon, folk som jobber med film/foto

VIKTIG: Hvis bildet viser filmproduksjon, kamerafolk, utstyr som kameraer/lys/stativer, filmcrew i arbeid, eller scener fra et filmopptak - velg kategorien "bts" (Behind The Scenes).

Returner kun JSON i dette formatet:
{
  "category": "kategorinavn",
  "subcategory": "kategori/underkategori eller null",
  "tags": ["tag1", "tag2", "tag3"],
  "title": "Forslag til tittel",
  "description": "Kort beskrivelse av bildet"
}

Tags skal være relevante nøkkelord på norsk eller engelsk, 3-5 stykker.`
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Analyser dette bildet og gi meg kategori, subcategory, tags, title og description. Returner kun JSON, ingen annen tekst.'
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl
              }
            }
          ]
        }
      ],
      max_tokens: 500,
      response_format: { type: 'json_object' }
    })

    const responseText = completion.choices[0].message.content
    if (!responseText) {
      throw new Error('Ingen respons fra OpenAI')
    }

    const analysis = JSON.parse(responseText)

    // Valider og juster kategori/subcategory
    const category = analysis.category && Object.keys(categories).includes(analysis.category)
      ? analysis.category
      : 'landskap' // Default fallback

    let subcategory = null
    if (analysis.subcategory) {
      // Sjekk om subcategory er gyldig for valgt kategori
      const validSubcategories = categories[category as keyof typeof categories] || []
      const subcatName = analysis.subcategory.split('/').pop() || analysis.subcategory
      if (validSubcategories.includes(subcatName)) {
        subcategory = `${category}/${subcatName}`
      }
    }

    return Response.json({
      category,
      subcategory,
      tags: analysis.tags || [],
      title: analysis.title || null,
      description: analysis.description || null
    })
  } catch (error) {
    console.error('Error analyzing image:', error)
    return Response.json(
      { error: 'Kunne ikke analysere bilde. Sjekk at OPENAI_API_KEY er satt og at bildet er tilgjengelig.' },
      { status: 500 }
    )
  }
}

