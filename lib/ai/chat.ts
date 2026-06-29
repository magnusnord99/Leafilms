import Anthropic from '@anthropic-ai/sdk'
import { SCHEMA_CONTEXT } from './schema-context'
import { retrievers } from './retrievers/index'

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY er ikke satt')
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
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

  const apiMessages: Anthropic.MessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }))

  // Tool use loop — maks 3 runder for å unngå uendelig løkke
  for (let round = 0; round < 3; round++) {
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 2048,
      system: SCHEMA_CONTEXT,
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
