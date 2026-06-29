# AI Chat-assistent (RAG) — Implementasjonsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bygg en flytende chat-knapp i admin som lar teamet stille naturlige spørsmål om Leafilms-data (prosjekter, leads, priser, teamet) og få svar generert av Claude via SQL-oppslag mot Supabase.

**Architecture:** Claude mottar en skjemabeskrivelse og brukerens spørsmål, kaller et `query_database`-verktøy for å kjøre SELECT-spørringer mot Supabase, og returnerer et norsk svar. Retriever-laget er abstrakt slik at pgvector kan legges til som en ny retriever i fase 2 uten å endre resten av systemet.

**Tech Stack:** `@anthropic-ai/sdk` (^0.95.1, allerede installert), Next.js 16 App Router, Supabase (`createServiceClient` fra `@/lib/supabase-server`), TypeScript strict, Tailwind/inline styles med `C` fra `@/lib/admin-theme`.

## Global Constraints

- Kun SELECT-spørringer tillatt — aldri INSERT/UPDATE/DELETE/DDL
- Kun autentiserte admin-brukere har tilgang til `/api/ai/chat`
- Modell: `claude-opus-4-8` — ikke bytt uten eksplisitt instruksjon
- Alle brukervendte tekster på norsk
- Inline styles med `C`-konstantene fra `@/lib/admin-theme` — ingen Tailwind className i UI-komponenter
- Maks 50 rader per SQL-spørring (håndheves i Postgres-funksjonen)
- Neste migrasjonsnummer: `077`

---

## Filstruktur

```
Opprettes:
  supabase/migrations/077_ai_readonly_query.sql
  lib/ai/schema-context.ts
  lib/ai/retrievers/index.ts
  lib/ai/retrievers/sql.ts
  lib/ai/chat.ts
  app/api/ai/chat/route.ts
  components/ai/AIChatMessage.tsx
  components/ai/AIChatPanel.tsx
  components/ai/AIChatButton.tsx

Endres:
  app/admin/layout.tsx  — legg til <AIChatButton /> ved siden av <FeedbackButton />
  docs/superpowers/specs/2026-06-29-ai-chat-rag-design.md  — allerede oppdatert
```

---

### Task 1: Databasemigrasjon — `execute_readonly_query`

**Files:**
- Create: `supabase/migrations/077_ai_readonly_query.sql`

**Interfaces:**
- Produces: Postgres-funksjon `execute_readonly_query(query TEXT) RETURNS JSONB` tilgjengelig via `supabase.rpc('execute_readonly_query', { query: '...' })`

- [ ] **Steg 1: Opprett migrasjonsfilen**

```sql
-- 077_ai_readonly_query.sql
-- Sikkert lesegrensesnitt for AI-chat-boten

CREATE OR REPLACE FUNCTION execute_readonly_query(query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSONB;
BEGIN
  -- Kun SELECT tillatt
  IF query !~* '^\s*SELECT' THEN
    RAISE EXCEPTION 'Kun SELECT-spørringer er tillatt';
  END IF;

  -- Blokker farlige nøkkelord
  IF query ~* '\m(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|EXECUTE|COPY)\M' THEN
    RAISE EXCEPTION 'Ikke-tillatt SQL-operasjon';
  END IF;

  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || query || ' LIMIT 50) t'
    INTO result;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- Kun service_role kan kalle funksjonen
REVOKE EXECUTE ON FUNCTION execute_readonly_query(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION execute_readonly_query(TEXT) TO service_role;

COMMENT ON FUNCTION execute_readonly_query(TEXT) IS
  'Sikkert grensesnitt for AI-chat: kun SELECT, maks 50 rader, kun service_role';
```

- [ ] **Steg 2: Kjør migrasjonen**

```bash
cd leafilms-pitch
npx supabase db push
```

Forventet output: `Applying migration 077_ai_readonly_query.sql... done`

- [ ] **Steg 3: Verifiser at funksjonen finnes**

I Supabase SQL-editor eller via psql:
```sql
SELECT execute_readonly_query('SELECT id, title FROM projects LIMIT 3');
```
Forventet: JSON-array med opptil 3 prosjektrader.

- [ ] **Steg 4: Commit**

```bash
git add supabase/migrations/077_ai_readonly_query.sql
git commit -m "feat: add execute_readonly_query db function for AI chat"
```

---

### Task 2: Schema-kontekst og retriever-lag

**Files:**
- Create: `lib/ai/schema-context.ts`
- Create: `lib/ai/retrievers/index.ts`
- Create: `lib/ai/retrievers/sql.ts`

**Interfaces:**
- Produces:
  - `SCHEMA_CONTEXT: string` fra `lib/ai/schema-context.ts`
  - `interface Retriever` fra `lib/ai/retrievers/index.ts`
  - `retrievers: Retriever[]` fra `lib/ai/retrievers/index.ts`
  - `sqlRetriever: Retriever` fra `lib/ai/retrievers/sql.ts`

- [ ] **Steg 1: Skriv `lib/ai/schema-context.ts`**

```ts
export const SCHEMA_CONTEXT = `Du er en intern assistent for Leafilms, et norsk filmproduksjonsselskap. Du svarer alltid på norsk. Du hjelper teamet med å finne informasjon om prosjekter, kunder, leads og oppgaver.

Du har tilgang til verktøyet query_database som lar deg kjøre SELECT-spørringer mot databasen. Bruk dette verktøyet for å hente data før du svarer. Kjør alltid en spørring – ikke svar fra minnet.

Tilgjengelige tabeller:

projects — Prosjekter
  id, title, client_name, customer_id, pipeline_stage, project_type,
  delivery_description, post_prod_days, meeting_notes, created_at
  pipeline_stage: lead | møte | tilbud_sendt | kontrakt | pre_prod | produksjon | post_prod | levering | fakturert | videresalg
  project_type: video | photo | mixed

customers — Kunder
  id, name, company, email, phone, notes

leads — Potensielle kunder (CRM)
  id, name, company, email, status, source, reason, notes, assigned_to, created_at
  status: new | contacted | meeting_booked | converted | lost

tasks — Oppgaver knyttet til prosjekter
  id, project_id, title, description, status, priority, due_date, pipeline_stage
  status: todo | in_progress | done
  priority: low | medium | high

task_assignees — Hvem som er tildelt oppgaver
  task_id, profile_id

profiles — Teammedlemmer (brukere)
  id, name, email, role

quotes — Pristilbud
  id, project_id, version, status, quote_data (JSONB med prisinfo), created_at
  status: draft | sent | accepted | rejected
  quote_data inneholder bl.a. total_price, line_items

team_members — Eksternt team-bibliotek
  id, name, role, bio, email, phone, tags

email_log — Logg over sendte e-poster
  id, project_id, lead_id, to_email, subject, type, sent_at

Eksempel-spørringer:
- Alle prosjekter i post_prod: SELECT title, client_name FROM projects WHERE pipeline_stage = 'post_prod'
- Antall leads per status: SELECT status, COUNT(*) FROM leads GROUP BY status
- Oppgaver tildelt en bruker: SELECT t.title, t.status FROM tasks t JOIN task_assignees ta ON ta.task_id = t.id JOIN profiles p ON p.id = ta.profile_id WHERE p.name ILIKE '%Magnus%'
- Pristilbud for et prosjekt: SELECT version, status, quote_data->>'total_price' AS pris FROM quotes WHERE project_id = (SELECT id FROM projects WHERE title ILIKE '%kundenavn%' LIMIT 1)

Hold svarene korte og direkte. Bruk tabeller eller lister når det gjør svaret lettere å lese.`
```

- [ ] **Steg 2: Skriv `lib/ai/retrievers/index.ts`**

```ts
import { sqlRetriever } from './sql'

export interface Retriever {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, { type: string; description: string }>
    required: string[]
  }
  execute(input: Record<string, unknown>): Promise<unknown>
}

export const retrievers: Retriever[] = [sqlRetriever]
```

- [ ] **Steg 3: Skriv `lib/ai/retrievers/sql.ts`**

```ts
import { createServiceClient } from '@/lib/supabase-server'
import type { Retriever } from './index'

export const sqlRetriever: Retriever = {
  name: 'query_database',
  description:
    'Kjør en SELECT-spørring mot Leafilms-databasen for å hente data om prosjekter, kunder, leads, oppgaver og team.',
  inputSchema: {
    type: 'object',
    properties: {
      sql: {
        type: 'string',
        description: 'SQL SELECT-spørring mot databasen',
      },
    },
    required: ['sql'],
  },
  async execute(input) {
    const { sql } = input as { sql: string }

    if (!/^\s*SELECT\s/i.test(sql.trim())) {
      return { error: 'Kun SELECT-spørringer er tillatt' }
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase.rpc('execute_readonly_query', {
      query: sql,
    })

    if (error) return { error: error.message }
    return { rows: data ?? [], count: Array.isArray(data) ? data.length : 0 }
  },
}
```

- [ ] **Steg 4: Verifiser TypeScript**

```bash
cd leafilms-pitch
npx tsc --noEmit
```

Forventet: ingen feil.

- [ ] **Steg 5: Commit**

```bash
git add lib/ai/schema-context.ts lib/ai/retrievers/index.ts lib/ai/retrievers/sql.ts
git commit -m "feat: add AI retriever layer with SQL retriever"
```

---

### Task 3: Chat-orkestrasjon

**Files:**
- Create: `lib/ai/chat.ts`

**Interfaces:**
- Consumes:
  - `SCHEMA_CONTEXT` fra `@/lib/ai/schema-context`
  - `retrievers: Retriever[]` fra `@/lib/ai/retrievers/index`
  - `Anthropic` fra `@anthropic-ai/sdk`
- Produces:
  - `runChat(messages: ChatMessage[]): Promise<ReadableStream<Uint8Array>>`
  - `type ChatMessage = { role: 'user' | 'assistant'; content: string }`

- [ ] **Steg 1: Skriv `lib/ai/chat.ts`**

```ts
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
```

- [ ] **Steg 2: Verifiser TypeScript**

```bash
npx tsc --noEmit
```

Forventet: ingen feil.

- [ ] **Steg 3: Commit**

```bash
git add lib/ai/chat.ts
git commit -m "feat: add AI chat orchestration with tool use loop"
```

---

### Task 4: API-rute

**Files:**
- Create: `app/api/ai/chat/route.ts`

**Interfaces:**
- Consumes:
  - `runChat` fra `@/lib/ai/chat`
  - `createClient` fra `@/lib/supabase-server`
  - `ChatMessage` fra `@/lib/ai/chat`
- Produces: `POST /api/ai/chat` — tar `{ messages: ChatMessage[] }`, returnerer streamet tekst (`text/plain; charset=utf-8`)

- [ ] **Steg 1: Skriv `app/api/ai/chat/route.ts`**

```ts
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { runChat, type ChatMessage } from '@/lib/ai/chat'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Ikke autentisert' }, { status: 401 })
  }

  let messages: ChatMessage[]
  try {
    const body = await req.json()
    messages = body.messages
    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: 'Ugyldig input: messages må være en ikke-tom array' }, { status: 400 })
    }
  } catch {
    return Response.json({ error: 'Ugyldig JSON' }, { status: 400 })
  }

  try {
    const stream = await runChat(messages)
    return new Response(stream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  } catch (err) {
    console.error('[AI chat] Feil:', err)
    return Response.json({ error: 'Serverfeil ved generering av svar' }, { status: 500 })
  }
}
```

- [ ] **Steg 2: Verifiser TypeScript**

```bash
npx tsc --noEmit
```

Forventet: ingen feil.

- [ ] **Steg 3: Test API-ruten manuelt**

Start dev-serveren (`npm run dev`) og test med curl (erstatt `YOUR_SESSION_COOKIE`):

```bash
curl -X POST http://localhost:3000/api/ai/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: YOUR_SESSION_COOKIE" \
  -d '{"messages":[{"role":"user","content":"Hvor mange prosjekter finnes det?"}]}'
```

Forventet: tekststreamog svar på norsk om antall prosjekter.

- [ ] **Steg 4: Commit**

```bash
git add app/api/ai/chat/route.ts
git commit -m "feat: add POST /api/ai/chat streaming route"
```

---

### Task 5: UI — flytende chat-knapp og panel

**Files:**
- Create: `components/ai/AIChatMessage.tsx`
- Create: `components/ai/AIChatPanel.tsx`
- Create: `components/ai/AIChatButton.tsx`
- Modify: `app/admin/layout.tsx`

**Interfaces:**
- Consumes:
  - `C` fra `@/lib/admin-theme`
  - `ChatMessage` fra `@/lib/ai/chat` (type only)
  - `POST /api/ai/chat`
- Produces: Flytende chat-knapp `bottom: 20, right: 68` (til venstre for eksisterende FeedbackButton på `right: 20`)

- [ ] **Steg 1: Skriv `components/ai/AIChatMessage.tsx`**

```tsx
'use client'

import { C } from '@/lib/admin-theme'
import type { ChatMessage } from '@/lib/ai/chat'

export function AIChatMessage({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 10,
      }}
    >
      <div
        style={{
          maxWidth: '85%',
          padding: '8px 12px',
          borderRadius: isUser ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
          background: isUser ? C.accent : C.surface2,
          color: C.text,
          fontFamily: 'var(--font-dm-sans)',
          fontSize: '0.8rem',
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {message.content}
      </div>
    </div>
  )
}
```

- [ ] **Steg 2: Skriv `components/ai/AIChatPanel.tsx`**

```tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { C } from '@/lib/admin-theme'
import { AIChatMessage } from './AIChatMessage'
import type { ChatMessage } from '@/lib/ai/chat'

interface Props {
  onClose: () => void
}

export function AIChatPanel({ onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: 'Hei! Jeg kan hjelpe deg med informasjon om prosjekter, leads, kunder og oppgaver. Hva lurer du på?' },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const content = input.trim()
    if (!content || loading) return

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    // Legg til tom assistent-melding som fylles under streaming
    setMessages((m) => [...m, { role: 'assistant', content: '' }])

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })

      if (!res.ok || !res.body) {
        setMessages((m) => {
          const updated = [...m]
          updated[updated.length - 1] = {
            role: 'assistant',
            content: 'Beklager, noe gikk galt. Prøv igjen.',
          }
          return updated
        })
        return
      }

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let text = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        text += dec.decode(value, { stream: true })
        setMessages((m) => {
          const updated = [...m]
          updated[updated.length - 1] = { role: 'assistant', content: text }
          return updated
        })
      }
    } catch {
      setMessages((m) => {
        const updated = [...m]
        updated[updated.length - 1] = {
          role: 'assistant',
          content: 'Nettverksfeil. Sjekk tilkoblingen og prøv igjen.',
        }
        return updated
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 68,
        right: 20,
        width: 360,
        maxHeight: 520,
        display: 'flex',
        flexDirection: 'column',
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        zIndex: 95,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderBottom: `1px solid ${C.border}`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: C.accentBg,
              border: `1px solid ${C.accent}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.7rem',
            }}
          >
            ✦
          </div>
          <span
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.82rem',
              fontWeight: 600,
              color: C.text,
            }}
          >
            Leafilms AI
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: C.text3,
            cursor: 'pointer',
            fontSize: '1.1rem',
            lineHeight: 1,
            padding: 4,
          }}
        >
          ×
        </button>
      </div>

      {/* Meldingsliste */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 14px',
        }}
      >
        {messages.map((msg, i) => (
          <AIChatMessage key={i} message={msg} />
        ))}
        {loading && messages[messages.length - 1]?.content === '' && (
          <div
            style={{
              display: 'flex',
              gap: 4,
              padding: '8px 12px',
              alignItems: 'center',
            }}
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: C.text3,
                  animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                }}
              />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '10px 12px',
          borderTop: `1px solid ${C.border}`,
          flexShrink: 0,
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder="Spør om et prosjekt, lead, pris..."
          disabled={loading}
          style={{
            flex: 1,
            background: C.surface2,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: '8px 10px',
            color: C.text,
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.8rem',
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{
            background: C.accent,
            border: 'none',
            borderRadius: 8,
            padding: '8px 12px',
            color: '#fff',
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !input.trim() ? 0.5 : 1,
            transition: 'opacity 0.12s',
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Steg 3: Skriv `components/ai/AIChatButton.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { C } from '@/lib/admin-theme'
import { AIChatPanel } from './AIChatPanel'

export function AIChatButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      {open && <AIChatPanel onClose={() => setOpen(false)} />}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Spør AI om prosjekter, leads og kunder"
        style={{
          position: 'fixed',
          bottom: 20,
          right: 68,
          zIndex: 90,
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: `1px solid ${open ? C.accent : 'transparent'}`,
          background: open ? C.accentBg : C.surface,
          boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
          color: open ? C.accent : C.text3,
          fontSize: '0.95rem',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'color 0.15s, background 0.15s, border-color 0.15s, transform 0.15s',
        }}
        onMouseEnter={(e) => {
          if (!open) {
            ;(e.currentTarget as HTMLButtonElement).style.color = C.text
            ;(e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)'
          }
        }}
        onMouseLeave={(e) => {
          if (!open) {
            ;(e.currentTarget as HTMLButtonElement).style.color = C.text3
            ;(e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'
          }
        }}
      >
        ✦
      </button>
    </>
  )
}
```

- [ ] **Steg 4: Legg til `<AIChatButton />` i `app/admin/layout.tsx`**

Finn linjen som inneholder `<FeedbackButton />` (nær slutten av `return`-blokken) og legg til `AIChatButton` rett over den.

Importer øverst i filen (legg til ved siden av eksisterende importer):
```tsx
import { AIChatButton } from '@/components/ai/AIChatButton'
```

Endre:
```tsx
      <FeedbackButton />
    </div>
  )
```

Til:
```tsx
      <AIChatButton />
      <FeedbackButton />
    </div>
  )
```

- [ ] **Steg 5: Legg til pulserende dot-animasjon i globals.css**

Åpne `app/globals.css` og legg til på slutten:

```css
@keyframes pulse {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}
```

- [ ] **Steg 6: Verifiser TypeScript**

```bash
npx tsc --noEmit
```

Forventet: ingen feil.

- [ ] **Steg 7: Test i nettleser**

Start dev-serveren og gå til `/admin`. Verifiser:
1. Chat-knappen (✦) vises nederst til høyre, til venstre for feedback-knappen
2. Klikk åpner panelet med velkomstmelding
3. Skriv "Hvor mange prosjekter finnes det?" og trykk Send
4. Svaret vises med antall prosjekter
5. Skriv "Hvilke leads er ikke kontaktet ennå?" og verifiser norsk svar
6. Lukk-knapp (×) lukker panelet

- [ ] **Steg 8: Commit**

```bash
git add components/ai/AIChatMessage.tsx components/ai/AIChatPanel.tsx components/ai/AIChatButton.tsx app/admin/layout.tsx app/globals.css
git commit -m "feat: add floating AI chat button to admin layout"
```
