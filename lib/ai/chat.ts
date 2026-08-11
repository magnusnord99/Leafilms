import Anthropic from '@anthropic-ai/sdk'
import { PROMPT_PREFIX, STATIC_SCHEMA_FALLBACK } from './schema-context'
import { retrievers } from './retrievers/index'
import { createServiceClient } from '@/lib/supabase-server'

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY er ikke satt')
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

// Henter tabeller/kolonner/constraints live fra databasen (migrasjon 141) så
// systemprompten aldri går ut av synk med skjemaet. Faller tilbake til en
// statisk beskrivelse hvis funksjonen ikke finnes ennå (migrasjonen ikke kjørt).
async function getSchemaDescription(): Promise<string> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase.rpc('get_schema_context')
    if (error || typeof data !== 'string' || !data.trim()) {
      throw error ?? new Error('Tomt svar fra get_schema_context')
    }
    return `Tilgjengelige tabeller (live fra databasen):\n\n${data}`
  } catch (err) {
    console.warn('[AI chat] get_schema_context feilet, bruker statisk fallback:', err)
    return STATIC_SCHEMA_FALLBACK
  }
}

export async function runChat(
  messages: ChatMessage[]
): Promise<ReadableStream<Uint8Array>> {
  const client = getClient()
  const enc = new TextEncoder()

  const tools: Anthropic.Tool[] = retrievers.map((r) => ({
    name: r.name,
    description: r.description,
    input_schema: r.inputSchema as Anthropic.Tool['input_schema'],
  }))

  const today = new Date().toISOString().slice(0, 10)
  const schema = await getSchemaDescription()
  const system = `Dagens dato er ${today}. Når noen spør om en periode uten å oppgi år (f.eks. "i september", "denne måneden", "neste uke"), regn det ut fra dagens dato — ikke gjett eller sjekk flere år.\n\n${PROMPT_PREFIX}\n\n${schema}`

  const apiMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  // Tool use loop — maks 3 runder for å unngå uendelig løkke
  for (let round = 0; round < 3; round++) {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2048,
      system,
      messages: apiMessages,
      tools,
    })

    if (response.stop_reason !== 'tool_use') {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')

      return new ReadableStream({
        start(controller) {
          controller.enqueue(enc.encode(text))
          controller.close()
        },
      })
    }

    // Kjør verktøykall
    apiMessages.push({ role: 'assistant', content: response.content })

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue
      const retriever = retrievers.find((r) => r.name === block.name)
      const result = retriever
        ? await retriever.execute(block.input as Record<string, unknown>)
        : { error: `Ukjent verktøy: ${block.name}` }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      })
    }

    apiMessages.push({ role: 'user', content: toolResults })
  }

  return new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode('Beklager, kunne ikke hente data fra databasen.'))
      controller.close()
    },
  })
}
