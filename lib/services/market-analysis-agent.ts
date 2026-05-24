import Anthropic from '@anthropic-ai/sdk'
import type { MarketLead } from '@/lib/types'

function getAnthropicClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY er ikke satt')
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

const SYSTEM_PROMPT = `Du er en erfaren salgsstrateg for Leafilms, et norsk profesjonelt film- og videoproduksjonsselskap basert i Norge.

Leafilms tilbyr:
- Reklameproduksjon (TV, sosiale medier, digitalt)
- Bedriftsfilm og presentasjonsvideoer
- Rekrutteringsfilmer og employer branding
- ProduktvideoProduksjon
- Musikkvideo
- Dokumentar og reportasje

Din oppgave er å finne 5 norske selskaper som trolig trenger film/videoproduksjon akkurat NÅ, basert på:
- Pågående produktlanseringer
- Nylig oppstartede selskaper med behov for å etablere seg
- Selskaper som ansetter aktivt (trenger rekrutteringsfilm)
- Bedrifter med kommende kampanjer eller arrangementer
- Selskaper i vekst som trenger å kommunisere merkevaren sin

For hvert selskap, returner JSON i dette eksakte formatet (viktig: kun JSON, ingen markdown):
{
  "customers": [
    {
      "name": "Fornavn Etternavn (kontaktperson hvis kjent, ellers 'Markedssjef')",
      "company": "Selskapsnavn AS",
      "website": "https://www.example.no",
      "reason": "Detaljert forklaring på 2-3 setninger om hvorfor dette selskapet trenger film/videoproduksjon akkurat nå",
      "sales_points": [
        "Konkret salgspunkt 1 tilpasset selskapets situasjon",
        "Konkret salgspunkt 2",
        "Konkret salgspunkt 3"
      ],
      "cold_email": "Emne: [Spesifikt emne]\n\nHei [navn],\n\n[Personalisert email-tekst på 3-4 avsnitt. Vis at du vet noe om dem, presentér Leafilms, foreslå neste steg.]\n\nMed vennlig hilsen,\nLeafilms"
    }
  ],
  "generated_at": "ISO-tidsstempel"
}

Søk etter norske selskaper og gi realistiske, aktuelle forslag.`

export async function runMarketAnalysis(): Promise<{ customers: MarketLead[]; generated_at: string }> {
  const client = getAnthropicClient()

  const today = new Date().toLocaleDateString('nb-NO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const userMessage = `I dag er det ${today}.

Søk på nettet etter norske selskaper som trolig trenger film- eller videoproduksjon denne uken. Se etter:
1. Norske bedrifter som nylig har lansert eller snart skal lansere produkter/tjenester
2. Selskaper med aktive stillingsutlysninger som trenger rekrutteringsfilm
3. Veksende norske startups som trenger brand awareness-innhold
4. Bedrifter med kommende messer, events eller kampanjer
5. Selskaper i bransjer som tradisjonelt investerer i video (tech, fintech, eiendom, helse, retail)

Finn 5 konkrete norske selskaper og returner dem i JSON-formatet spesifisert i systemprompten.`

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
  })

  const textBlock = response.content.find((b: Anthropic.ContentBlock) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Ingen tekstrespons fra Claude')
  }

  const raw = textBlock.text.trim()

  let parsed: { customers: MarketLead[]; generated_at: string }
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Ingen JSON funnet i respons')
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    throw new Error(`Kunne ikke parse JSON fra Claude: ${raw.slice(0, 200)}`)
  }

  if (!Array.isArray(parsed.customers) || parsed.customers.length === 0) {
    throw new Error('Ingen kunder i responsen')
  }

  return {
    customers: parsed.customers.slice(0, 5),
    generated_at: parsed.generated_at || new Date().toISOString(),
  }
}
