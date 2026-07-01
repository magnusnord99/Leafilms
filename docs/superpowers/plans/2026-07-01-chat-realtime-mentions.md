# Realtime task-chat + @mentions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make task-chat realtime (matching the existing project-chat pattern), and add @mention autocomplete + dedicated mention notifications to both project-chat and task-chat.

**Architecture:** One new migration extends `project_messages`/`task_messages` with a `mentions UUID[]` column (mirroring the existing `quote_messages.mentions`) and extends the existing `notify_project_message()`/`notify_task_message()` triggers to emit `*_mention` notifications. A new shared `MentionTextInput` component provides `@`-autocomplete in both chat surfaces, backed by a small pure-function module (`lib/mentions.ts`) for parsing mention IDs out of message text and rendering `@name` highlights. Task-chat gains a Supabase realtime subscription identical in shape to the one already running in `ProjectChat.tsx`. The notifications page (`VarslerClient.tsx`) gets a realtime subscription (INSERT + UPDATE) so it updates live like the bell already does.

**Tech Stack:** Next.js App Router, Supabase (Postgres + Realtime + RLS), TypeScript, inline-style React components (existing codebase convention, no CSS framework classes used in these files).

## Global Constraints

- **No test runner exists in this repo** (no jest/vitest/playwright, verified via `package.json`). Verification steps in this plan are manual: `npm run lint`, `npm run build`, and direct browser/SQL checks — this matches how every other feature in this codebase has been verified (see `docs/superpowers/specs/2026-06-08-varsler-design.md`'s "Ikke inkludert" style specs). Do not introduce a new test framework as part of this work — out of scope.
- All UI copy is Norwegian (Bokmål), matching existing strings in `ProjectChat.tsx`, `VarslerClient.tsx`, and the postprod page.
- Next migration number is `081` (last applied is `080_quote_messages.sql`). Run migrations with `npm run migrate:single supabase/migrations/081_message_mentions.sql`.
- Mention matching is **first-name-only, case-insensitive, whole-word** (e.g. `@Kai`). This is a deliberate simplification for a small internal team — documented in `lib/mentions.ts`, not hidden.
- Quote-chat (`quote_messages`) is explicitly **out of scope** — do not add a trigger or UI for it in this plan.
- Follow the spec at `docs/superpowers/specs/2026-07-01-chat-realtime-mentions-design.md` for all product decisions; this plan implements it task-by-task.

---

### Task 1: Migration — mentions columns, notification types, trigger updates, realtime for task_messages

**Files:**
- Create: `supabase/migrations/081_message_mentions.sql`

**Interfaces:**
- Produces: `project_messages.mentions UUID[]`, `task_messages.mentions UUID[]` columns; notification `type` values `project_message_mention`, `task_message_mention`; `task_messages` added to `supabase_realtime` publication with `REPLICA IDENTITY FULL`.

- [ ] **Step 1: Write the migration file**

```sql
-- 081_message_mentions.sql
-- @mentions for project_messages/task_messages + realtime for task_messages

ALTER TABLE project_messages ADD COLUMN IF NOT EXISTS mentions UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE task_messages    ADD COLUMN IF NOT EXISTS mentions UUID[] NOT NULL DEFAULT '{}';

-- Utvid notifications type-constraint med de nye mention-typene
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'project_message', 'task_message', 'selection_submitted',
    'task_assigned', 'lead_assigned', 'quote_assigned', 'invoice_assigned',
    'quote_mention', 'project_message_mention', 'task_message_mention'
  ));

-- Trigger 1 (oppdatert): prosjekt-melding
-- Mentions varsles uansett assignee-status; assignees som IKKE er nevnt
-- får vanlig project_message-varsel. En nevnt assignee får kun mention-varselet.
CREATE OR REPLACE FUNCTION notify_project_message()
RETURNS TRIGGER AS $$
DECLARE
  rec     RECORD;
  preview TEXT;
BEGIN
  preview := left(NEW.content, 80);

  FOR rec IN
    SELECT DISTINCT m AS profile_id
    FROM unnest(NEW.mentions) AS m
    WHERE m != NEW.user_id
  LOOP
    INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name)
    VALUES (rec.profile_id, 'project_message_mention', NEW.project_id, preview, COALESCE(NEW.user_name, 'Ukjent'));
  END LOOP;

  FOR rec IN
    SELECT DISTINCT ta.profile_id
    FROM task_assignees ta
    JOIN tasks t ON t.id = ta.task_id
    WHERE t.project_id = NEW.project_id
      AND ta.profile_id != NEW.user_id
      AND ta.profile_id != ALL(NEW.mentions)
  LOOP
    INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name)
    VALUES (rec.profile_id, 'project_message', NEW.project_id, preview, COALESCE(NEW.user_name, 'Ukjent'));
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger 2 (oppdatert): oppgave-melding, samme mention/assignee-logikk
CREATE OR REPLACE FUNCTION notify_task_message()
RETURNS TRIGGER AS $$
DECLARE
  rec       RECORD;
  proj_id   UUID;
  sndr_name TEXT;
  preview   TEXT;
BEGIN
  preview := left(NEW.message, 80);
  SELECT project_id INTO proj_id FROM tasks WHERE id = NEW.task_id;
  SELECT COALESCE(name, email, 'Ukjent') INTO sndr_name FROM profiles WHERE id = NEW.user_id;

  FOR rec IN
    SELECT DISTINCT m AS profile_id
    FROM unnest(NEW.mentions) AS m
    WHERE m != NEW.user_id
  LOOP
    INSERT INTO notifications (user_id, type, project_id, task_id, message_preview, sender_name)
    VALUES (rec.profile_id, 'task_message_mention', proj_id, NEW.task_id, preview, sndr_name);
  END LOOP;

  FOR rec IN
    SELECT DISTINCT ta.profile_id
    FROM task_assignees ta
    WHERE ta.task_id = NEW.task_id
      AND ta.profile_id != NEW.user_id
      AND ta.profile_id != ALL(NEW.mentions)
  LOOP
    INSERT INTO notifications (user_id, type, project_id, task_id, message_preview, sender_name)
    VALUES (rec.profile_id, 'task_message', proj_id, NEW.task_id, preview, sndr_name);
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Realtime for task_messages (project_messages og notifications er allerede aktivert)
ALTER TABLE task_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE task_messages;
EXCEPTION WHEN SQLSTATE '42710' THEN
  NULL;
END$$;
```

- [ ] **Step 2: Check whether `project_messages` is already in the realtime publication**

Run: `npm run migrate:psql -- -c "SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';"` (or open Supabase SQL editor and run the same `SELECT`).

If `project_messages` is **not** listed, add these two lines to the migration file from Step 1 (same `DO $$ ... END$$` pattern, before the `task_messages` block):

```sql
ALTER TABLE project_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE project_messages;
EXCEPTION WHEN SQLSTATE '42710' THEN
  NULL;
END$$;
```

(It's very likely already enabled since `ProjectChat.tsx` already relies on realtime INSERTs working today — this step is just a safety check.)

- [ ] **Step 3: Run the migration**

Run: `npm run migrate:single supabase/migrations/081_message_mentions.sql`
Expected: `✨ Migration completed successfully!`

- [ ] **Step 4: Verify columns and constraint**

Run: `npm run migrate:show` or open Supabase SQL editor and run:
```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'task_messages' AND column_name = 'mentions';
SELECT conname FROM pg_constraint WHERE conname = 'notifications_type_check';
```
Expected: `mentions` column present, constraint exists.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/081_message_mentions.sql
git commit -m "feat(db): add mentions columns, mention notification types, task_messages realtime"
```

---

### Task 2: Types — mentions field + new notification types

**Files:**
- Modify: `lib/types.ts:391-398` (`ProjectMessage`), `lib/types.ts:448-455` (`TaskMessage`)
- Modify: `lib/actions/notifications.ts:6-19` (`Notification` type)

**Interfaces:**
- Produces: `ProjectMessage.mentions: string[]`, `TaskMessage.mentions: string[]`, `Notification.type` including `'project_message_mention' | 'task_message_mention'`.

- [ ] **Step 1: Update `ProjectMessage` and `TaskMessage` in `lib/types.ts`**

```typescript
export type ProjectMessage = {
  id: string
  project_id: string
  user_id: string
  user_name: string | null
  content: string
  mentions: string[]
  created_at: string
}
```

```typescript
export type TaskMessage = {
  id: string
  task_id: string
  user_id: string
  message: string
  mentions: string[]
  created_at: string
  user?: { id: string; name: string | null; email: string } | null
}
```

- [ ] **Step 2: Update `Notification` type in `lib/actions/notifications.ts`**

```typescript
export type Notification = {
  id: string
  type: 'project_message' | 'task_message' | 'selection_submitted' | 'task_assigned' | 'lead_assigned' | 'quote_assigned' | 'invoice_assigned' | 'quote_mention' | 'project_message_mention' | 'task_message_mention'
  project_id: string | null
  task_id: string | null
  lead_id: string | null
  message_preview: string
  sender_name: string
  read: boolean
  created_at: string
  projects: { title: string } | null
  tasks: { title: string } | null
  leads: { name: string; company: string | null } | null
}
```

- [ ] **Step 3: Verify with typecheck**

Run: `npm run lint`
Expected: No new errors (existing `.select('*')` calls in `getTaskMessages`/`getNotifications` already return all columns, so no other code should break from adding a field to a type — if something does break, it's a real call site that needs the field, fix it there).

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts lib/actions/notifications.ts
git commit -m "feat(types): add mentions field and mention notification types"
```

---

### Task 3: Shared mention parsing/rendering helpers

**Files:**
- Create: `lib/mentions.ts`

**Interfaces:**
- Produces: `MentionableProfile` type, `mentionToken(profile)`, `extractMentionIds(text, profiles)`, `MENTION_DISPLAY_PATTERN`, `splitMentionSegments(text)`.
- Consumed by: Task 4 (`MentionTextInput`), Task 5 (`ProjectChat`), Task 7 (postprod page).

- [ ] **Step 1: Write `lib/mentions.ts`**

```typescript
// Mention-parsing: first-name-only, case-insensitive, whole-word matching.
// Deliberate simplification for a small internal team — if two teammates
// share a first name, mentioning either name notifies both. Multi-word
// names are not supported as mention tokens.

export type MentionableProfile = { id: string; name: string | null; email: string }

export function mentionToken(profile: MentionableProfile): string {
  const base = profile.name?.trim() || profile.email.split('@')[0]
  return base.split(' ')[0]
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function extractMentionIds(text: string, profiles: MentionableProfile[]): string[] {
  const ids = new Set<string>()
  for (const profile of profiles) {
    const token = mentionToken(profile)
    if (!token) continue
    const pattern = new RegExp(`@${escapeRegExp(token)}(?![\\wæøåÆØÅ])`, 'i')
    if (pattern.test(text)) ids.add(profile.id)
  }
  return Array.from(ids)
}

export const MENTION_DISPLAY_PATTERN = /@[\wæøåÆØÅ.-]+/g

export type MentionSegment = { text: string; isMention: boolean }

export function splitMentionSegments(text: string): MentionSegment[] {
  const segments: MentionSegment[] = []
  let lastIndex = 0
  for (const match of text.matchAll(MENTION_DISPLAY_PATTERN)) {
    const index = match.index ?? 0
    if (index > lastIndex) segments.push({ text: text.slice(lastIndex, index), isMention: false })
    segments.push({ text: match[0], isMention: true })
    lastIndex = index + match[0].length
  }
  if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex), isMention: false })
  return segments
}
```

- [ ] **Step 2: Manually verify parsing logic in a scratch script**

Run: `npx tsx -e "
import { extractMentionIds, splitMentionSegments } from './lib/mentions'
const profiles = [{ id: 'a', name: 'Kai', email: 'kai@leafilms.no' }, { id: 'b', name: 'Nova', email: 'nova@leafilms.no' }]
console.log(extractMentionIds('kan du sjekke denne @kai ?', profiles))
console.log(extractMentionIds('ingen mentions her', profiles))
console.log(splitMentionSegments('hei @kai, kan du se på dette'))
"`
Expected: First line prints `[ 'a' ]`, second prints `[]`, third prints an array of segments where `@kai` has `isMention: true`.

- [ ] **Step 3: Commit**

```bash
git add lib/mentions.ts
git commit -m "feat: add mention parsing and rendering helpers"
```

---

### Task 4: Shared `MentionTextInput` component

**Files:**
- Create: `components/shared/MentionTextInput.tsx`

**Interfaces:**
- Consumes: `MentionableProfile`, `mentionToken` from `lib/mentions.ts` (Task 3).
- Produces: `MentionTextInput` component with props `{ value, onChange, onEnter, profiles, as, rows?, placeholder?, disabled?, style?, className? }`.
- Consumed by: Task 5 (`ProjectChat`), Task 7 (postprod page).

- [ ] **Step 1: Write `components/shared/MentionTextInput.tsx`**

```tsx
'use client'

import { useRef, useState } from 'react'
import { mentionToken, type MentionableProfile } from '@/lib/mentions'

type Props = {
  value: string
  onChange: (value: string) => void
  onEnter: () => void
  profiles: MentionableProfile[]
  as?: 'input' | 'textarea'
  rows?: number
  placeholder?: string
  disabled?: boolean
  style?: React.CSSProperties
  className?: string
}

function detectMentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const uptoCaret = text.slice(0, caret)
  const at = uptoCaret.lastIndexOf('@')
  if (at === -1) return null
  const before = uptoCaret[at - 1]
  if (before !== undefined && !/\s/.test(before)) return null
  const fragment = uptoCaret.slice(at + 1)
  if (/\s/.test(fragment)) return null
  return { start: at, query: fragment }
}

export function MentionTextInput({
  value, onChange, onEnter, profiles, as = 'input', rows, placeholder, disabled, style, className,
}: Props) {
  const [query, setQuery] = useState<string | null>(null)
  const [queryStart, setQueryStart] = useState(0)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)

  const matches = query === null
    ? []
    : profiles.filter(p => mentionToken(p).toLowerCase().startsWith(query.toLowerCase())).slice(0, 6)

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const next = e.target.value
    onChange(next)
    const caret = e.target.selectionStart ?? next.length
    const detected = detectMentionQuery(next, caret)
    if (detected) {
      setQuery(detected.query)
      setQueryStart(detected.start)
      setHighlightIdx(0)
    } else {
      setQuery(null)
    }
  }

  function selectMatch(profile: MentionableProfile) {
    if (query === null || !ref.current) return
    const caret = ref.current.selectionStart ?? value.length
    const token = mentionToken(profile)
    const next = value.slice(0, queryStart) + `@${token} ` + value.slice(caret)
    onChange(next)
    setQuery(null)
    requestAnimationFrame(() => {
      const pos = queryStart + token.length + 2
      ref.current?.setSelectionRange(pos, pos)
      ref.current?.focus()
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (query !== null && matches.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => (i + 1) % matches.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => (i - 1 + matches.length) % matches.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); selectMatch(matches[highlightIdx]); return }
      if (e.key === 'Escape') { e.preventDefault(); setQuery(null); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onEnter()
    }
  }

  return (
    <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
      {as === 'textarea' ? (
        <textarea
          ref={ref}
          rows={rows}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          style={style}
          className={className}
        />
      ) : (
        <input
          ref={ref}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          style={style}
          className={className}
        />
      )}
      {query !== null && matches.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 4,
            background: '#21212D',
            border: '1px solid #3C3C52',
            borderRadius: 8,
            overflow: 'hidden',
            zIndex: 200,
            minWidth: 160,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {matches.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); selectMatch(p) }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 10px',
                background: i === highlightIdx ? 'rgba(124,92,252,0.15)' : 'transparent',
                border: 'none',
                color: '#EEEEF2',
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              @{mentionToken(p)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify with typecheck**

Run: `npm run lint`
Expected: No errors in the new file. (`ref={ref}` on both `<textarea>` and `<input>` works because `useRef<HTMLInputElement & HTMLTextAreaElement>` is a supertype ref accepted by both element types in this codebase's TS config — if lint flags it, change to two separate refs, one per branch, and pick the active one in `handleChange`/`handleKeyDown`/`selectMatch` via `as === 'textarea' ? textareaRef.current : inputRef.current`.)

- [ ] **Step 3: Commit**

```bash
git add components/shared/MentionTextInput.tsx
git commit -m "feat: add shared MentionTextInput component with @-autocomplete"
```

---

### Task 5: `ProjectChat` — mentions integration

**Files:**
- Modify: `components/project/ProjectChat.tsx`

**Interfaces:**
- Consumes: `getAllProfiles()` from `lib/actions/pipeline.ts` (already exists, returns `{ id: string; name: string | null; email: string }[]`), `extractMentionIds`/`splitMentionSegments` from `lib/mentions.ts` (Task 3), `MentionTextInput` from `components/shared/MentionTextInput.tsx` (Task 4).
- Produces: POST body to `/api/projects/${projectId}/messages` now includes `mentions: string[]`.

- [ ] **Step 1: Add profile fetching and imports**

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase-client'
import { getAllProfiles } from '@/lib/actions/pipeline'
import { extractMentionIds, splitMentionSegments, type MentionableProfile } from '@/lib/mentions'
import { MentionTextInput } from '@/components/shared/MentionTextInput'
import type { ProjectMessage } from '@/lib/types'

type Props = {
  projectId: string
}

export function ProjectChat({ projectId }: Props) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ProjectMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [unread, setUnread] = useState(0)
  const [profiles, setProfiles] = useState<MentionableProfile[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const openRef = useRef(open)

  useEffect(() => {
    getAllProfiles().then(setProfiles)
  }, [])

  useEffect(() => {
    openRef.current = open
  }, [open])
```

(This replaces the existing top of the file, from the `'use client'` directive through the `useEffect` that syncs `openRef` — everything else in the file below that point stays as-is until Step 2.)

- [ ] **Step 2: Send mentions with the message**

Replace the existing `sendMessage` function:

```typescript
  async function sendMessage() {
    if (!input.trim() || sending) return
    setSending(true)
    const content = input.trim()
    const mentions = extractMentionIds(content, profiles)
    setInput('')
    const res = await fetch(`/api/projects/${projectId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, mentions }),
    })
    if (res.ok) {
      const { message } = await res.json()
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === message.id)
        if (exists) return prev
        return [...prev, message]
      })
    }
    setSending(false)
  }
```

(Note: signature changed from `sendMessage(e: React.FormEvent)` to `sendMessage()` — no event parameter needed anymore since `MentionTextInput` calls it directly via `onEnter`.)

- [ ] **Step 3: Replace the plain `<input>` with `MentionTextInput` and wire up the form**

Replace the `<form onSubmit={sendMessage} ...>` block (previously lines 267-310) with:

```tsx
          <form
            onSubmit={(e) => { e.preventDefault(); sendMessage() }}
            style={{
              borderTop: '1px solid #2A261F',
              display: 'flex',
              gap: 0,
            }}
          >
            <MentionTextInput
              value={input}
              onChange={setInput}
              onEnter={sendMessage}
              profiles={profiles}
              as="input"
              placeholder="Skriv en melding..."
              disabled={sending}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                padding: '10px 12px',
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.7rem',
                color: '#E8E1D5',
                letterSpacing: '0.03em',
                width: '100%',
              }}
            />
            <button
              type="submit"
              disabled={sending || !input.trim()}
              style={{
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                borderLeft: '1px solid #2A261F',
                color: input.trim() ? '#C49434' : '#2A261F',
                cursor: input.trim() ? 'pointer' : 'default',
                lineHeight: 0,
                transition: 'color 0.15s',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 8L2 2l3 6-3 6 12-6z" />
              </svg>
            </button>
          </form>
```

- [ ] **Step 4: Highlight mentions in the message list**

Replace the message content paragraph:

```tsx
                <p style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.7rem',
                  color: '#B5AFA5',
                  lineHeight: 1.5,
                  margin: 0,
                  wordBreak: 'break-word',
                }}>
                  {splitMentionSegments(msg.content).map((seg, i) =>
                    seg.isMention
                      ? <span key={i} style={{ color: '#C49434', fontWeight: 600 }}>{seg.text}</span>
                      : <span key={i}>{seg.text}</span>
                  )}
                </p>
```

- [ ] **Step 5: Verify with typecheck and build**

Run: `npm run lint && npm run build`
Expected: Both succeed with no errors.

- [ ] **Step 6: Manual browser verification**

Run: `npm run dev`, open a project page, open the project chat, type `@` and confirm the autocomplete dropdown appears with real teammates, select one, send the message, and confirm `@name` renders in gold/bold in the message list.

- [ ] **Step 7: Commit**

```bash
git add components/project/ProjectChat.tsx
git commit -m "feat: add @mention autocomplete and highlighting to project chat"
```

---

### Task 6: Project messages API route — accept and store mentions

**Files:**
- Modify: `app/api/projects/[id]/messages/route.ts`

**Interfaces:**
- Consumes: `mentions: string[]` in POST request body (sent by Task 5).

- [ ] **Step 1: Update the POST handler to read and store `mentions`**

Replace:

```typescript
    const { content } = await req.json()
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return Response.json({ error: 'Melding kan ikke være tom' }, { status: 400 })
    }
```

with:

```typescript
    const { content, mentions } = await req.json()
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return Response.json({ error: 'Melding kan ikke være tom' }, { status: 400 })
    }
    const mentionIds = Array.isArray(mentions) ? mentions.filter((m) => typeof m === 'string') : []
```

And replace:

```typescript
    const serviceClient = createServiceClient()
    const { data, error } = await serviceClient
      .from('project_messages')
      .insert({
        project_id: projectId,
        user_id: user.id,
        user_name: userName,
        content: content.trim(),
      })
      .select()
      .single()
```

with:

```typescript
    const serviceClient = createServiceClient()
    const { data, error } = await serviceClient
      .from('project_messages')
      .insert({
        project_id: projectId,
        user_id: user.id,
        user_name: userName,
        content: content.trim(),
        mentions: mentionIds,
      })
      .select()
      .single()
```

- [ ] **Step 2: Verify with typecheck**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 3: Manual verification**

With `npm run dev` running, send a project-chat message mentioning a teammate (from Task 5's browser check), then check the row in Supabase:
```sql
SELECT content, mentions FROM project_messages ORDER BY created_at DESC LIMIT 1;
```
Expected: `mentions` contains the mentioned teammate's profile UUID. Also check:
```sql
SELECT type, user_id FROM notifications WHERE type = 'project_message_mention' ORDER BY created_at DESC LIMIT 1;
```
Expected: A row exists for the mentioned user.

- [ ] **Step 4: Commit**

```bash
git add app/api/projects/[id]/messages/route.ts
git commit -m "feat: store mentions on project message insert"
```

---

### Task 7: Task-chat — realtime subscription + mentions integration

**Files:**
- Modify: `app/admin/postprod/[id]/page.tsx`
- Modify: `lib/actions/pipeline.ts:1055-1079` (`sendTaskMessage`)

**Interfaces:**
- Consumes: `MentionTextInput` (Task 4), `extractMentionIds`/`splitMentionSegments` (Task 3), `getAllProfiles` (already imported in this file), `supabase` client from `lib/supabase-client.ts`.
- Produces: `sendTaskMessage(taskId, message, mentions)` — signature changed, all call sites in this file updated.

- [ ] **Step 1: Update `sendTaskMessage` in `lib/actions/pipeline.ts` to accept mentions**

Replace:

```typescript
export async function sendTaskMessage(
  taskId: string,
  message: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { ok: false, error: 'Ikke autentisert' }

    const { error } = await supabase
      .from('task_messages')
      .insert({ task_id: taskId, user_id: user.id, message: message.trim() })

    if (error) {
      console.error('sendTaskMessage error:', error)
      return { ok: false, error: error.message }
    }

    return { ok: true }
  } catch (err) {
    console.error('sendTaskMessage unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}
```

with:

```typescript
export async function sendTaskMessage(
  taskId: string,
  message: string,
  mentions: string[] = []
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { ok: false, error: 'Ikke autentisert' }

    const { error } = await supabase
      .from('task_messages')
      .insert({ task_id: taskId, user_id: user.id, message: message.trim(), mentions })

    if (error) {
      console.error('sendTaskMessage error:', error)
      return { ok: false, error: error.message }
    }

    return { ok: true }
  } catch (err) {
    console.error('sendTaskMessage unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}
```

- [ ] **Step 2: Add imports and a realtime subscription in `app/admin/postprod/[id]/page.tsx`**

Add to the import block near the top of the file (after the existing `lib/types` import):

```typescript
import { supabase } from '@/lib/supabase-client'
import { extractMentionIds, splitMentionSegments } from '@/lib/mentions'
import { MentionTextInput } from '@/components/shared/MentionTextInput'
```

Add a new `useEffect` right after the existing one that calls `loadMessages` on `selectedTask?.id` change (the one at lines 402-413):

```typescript
  // Realtime: nye meldinger på valgt oppgave fra andre brukere
  useEffect(() => {
    if (!selectedTask) return
    const taskId = selectedTask.id
    const channel = supabase
      .channel(`task-messages-${taskId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'task_messages', filter: `task_id=eq.${taskId}` },
        () => {
          loadMessages(taskId)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedTask?.id])
```

(This re-fetches via the existing `getTaskMessages` action on any INSERT rather than merging the raw payload into state, because the payload from `postgres_changes` doesn't include the joined `user:profiles(...)` data that the message bubbles need for the sender name/avatar — `loadMessages` already fetches that join. This mirrors how `VarslerClient` will re-fetch joined data in Task 8.)

- [ ] **Step 3: Update `handleSendMessage` to extract and pass mentions**

Replace:

```typescript
  async function handleSendMessage() {
    if (!newMessage.trim() || sendingMsg || !selectedTask) return
    setSendingMsg(true)
    const result = await sendTaskMessage(selectedTask.id, newMessage.trim())
    if (result.ok) {
      setNewMessage('')
      await loadMessages(selectedTask.id)
    }
    setSendingMsg(false)
  }
```

with:

```typescript
  async function handleSendMessage() {
    if (!newMessage.trim() || sendingMsg || !selectedTask) return
    setSendingMsg(true)
    const mentions = extractMentionIds(newMessage.trim(), profiles)
    const result = await sendTaskMessage(selectedTask.id, newMessage.trim(), mentions)
    if (result.ok) {
      setNewMessage('')
      await loadMessages(selectedTask.id)
    }
    setSendingMsg(false)
  }
```

- [ ] **Step 4: Replace the message textarea with `MentionTextInput`**

Replace the `<textarea>` block (previously lines 1779-1798):

```tsx
                <MentionTextInput
                  value={newMessage}
                  onChange={setNewMessage}
                  onEnter={handleSendMessage}
                  profiles={profiles}
                  as="textarea"
                  rows={2}
                  placeholder="Skriv en melding... (Enter for å sende)"
                  style={{
                    flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem',
                    color: C.text, background: C.surface,
                    border: `1px solid ${C.border}`, borderRadius: 8,
                    padding: '9px 12px', resize: 'none', outline: 'none', lineHeight: 1.5,
                    width: '100%',
                  }}
                />
```

(The old inline `onKeyDown` Enter-handling is gone — `MentionTextInput` handles Enter-to-send and Shift+Enter-for-newline internally.)

- [ ] **Step 5: Highlight mentions in task-chat message bubbles**

Replace:

```tsx
                          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {msg.message}
                          </p>
```

with:

```tsx
                          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {splitMentionSegments(msg.message).map((seg, i) =>
                              seg.isMention
                                ? <span key={i} style={{ color: C.accent, fontWeight: 600 }}>{seg.text}</span>
                                : <span key={i}>{seg.text}</span>
                            )}
                          </p>
```

- [ ] **Step 6: Verify with typecheck and build**

Run: `npm run lint && npm run build`
Expected: Both succeed. If lint complains about the unused old `onKeyDown` logic or unused imports, remove them.

- [ ] **Step 7: Manual browser verification — realtime**

Run: `npm run dev`. Open the same task in postprod in two browser windows (or one normal + one incognito, logged in as two different team members). Send a message from one window. Confirm it appears in the other window within ~1 second, without switching tasks or reloading.

- [ ] **Step 8: Manual browser verification — mentions**

In the task chat, type `@` followed by a teammate's first name, confirm the dropdown, select it, send. Confirm `@name` renders in accent color, and confirm (via Supabase SQL or the mentioned user's `/admin/varsler` page) that a `task_message_mention` notification was created.

- [ ] **Step 9: Commit**

```bash
git add app/admin/postprod/[id]/page.tsx lib/actions/pipeline.ts
git commit -m "feat: realtime task-chat with @mention autocomplete and highlighting"
```

---

### Task 8: Varsler-side — mention notification display + realtime

**Files:**
- Modify: `app/admin/varsler/VarslerClient.tsx`

**Interfaces:**
- Consumes: `Notification` type from `lib/actions/notifications.ts` (Task 2), `supabase` client from `lib/supabase-client.ts`.
- Produces: `VarslerClient` now manages its own live-updating notification list instead of only rendering the server-fetched prop once.

- [ ] **Step 1: Add realtime state management**

Replace the top of the component:

```tsx
'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-client'
import { markAsRead, markAllAsRead, type Notification } from '@/lib/actions/notifications'
import { C } from '@/lib/admin-theme'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'akkurat nå'
  if (mins < 60) return `${mins} min siden`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} t siden`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'i går'
  return `${days} dager siden`
}

export default function VarslerClient({ notifications: initialNotifications }: { notifications: Notification[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [notifications, setNotifications] = useState(initialNotifications)

  useEffect(() => {
    setNotifications(initialNotifications)
  }, [initialNotifications])

  useEffect(() => {
    const supabase = createClient()
    let channelName = ''

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      channelName = `varsler-page-${user.id}`

      supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          async (payload) => {
            const { data } = await supabase
              .from('notifications')
              .select('*, projects(title), tasks(title), leads(name, company)')
              .eq('id', (payload.new as { id: string }).id)
              .single()
            if (data) {
              setNotifications((prev) => {
                if (prev.some((n) => n.id === data.id)) return prev
                return [data as Notification, ...prev]
              })
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
          (payload) => {
            const updated = payload.new as Notification
            setNotifications((prev) => prev.map((n) => (n.id === updated.id ? { ...n, read: updated.read } : n)))
          }
        )
        .subscribe()
    }

    init()

    return () => {
      if (channelName) supabase.removeChannel(supabase.channel(channelName))
    }
  }, [])
```

(Everything below this point — `handleClick`, `handleMarkAll`, `unreadCount`, and the JSX return — stays the same, since it already reads from a `notifications` variable that now comes from local state instead of directly from props.)

- [ ] **Step 2: Add icon/text for the two new mention types**

Replace:

```tsx
                  {n.type === 'task_assigned' || n.type === 'lead_assigned' ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                    </svg>
                  ) : n.type === 'project_message' || n.type === 'quote_mention' ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.8">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.text3} strokeWidth="1.8">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M8 12h8M8 8h8M8 16h5" />
                    </svg>
                  )}
```

with:

```tsx
                  {n.type === 'task_assigned' || n.type === 'lead_assigned' ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                    </svg>
                  ) : n.type === 'project_message_mention' || n.type === 'task_message_mention' || n.type === 'quote_mention' ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="4" />
                      <path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-4 7.5" />
                    </svg>
                  ) : n.type === 'project_message' ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.8">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.text3} strokeWidth="1.8">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M8 12h8M8 8h8M8 16h5" />
                    </svg>
                  )}
```

- [ ] **Step 3: Add label text for the two new types**

Replace:

```tsx
                      {n.type === 'project_message' ? 'i prosjekt-chatten'
                        : n.type === 'task_assigned' ? 'tildelte deg en oppgave'
                        : n.type === 'lead_assigned' ? 'satte deg som ansvarlig for en lead'
                        : n.type === 'selection_submitted' ? 'sendte inn bildevalg'
                        : n.type === 'quote_mention' ? 'tagget deg i tilbud'
                        : 'i en oppgave'}
```

with:

```tsx
                      {n.type === 'project_message' ? 'i prosjekt-chatten'
                        : n.type === 'project_message_mention' ? 'nevnte deg i prosjekt-chatten'
                        : n.type === 'task_message_mention' ? 'nevnte deg i en oppgave'
                        : n.type === 'task_assigned' ? 'tildelte deg en oppgave'
                        : n.type === 'lead_assigned' ? 'satte deg som ansvarlig for en lead'
                        : n.type === 'selection_submitted' ? 'sendte inn bildevalg'
                        : n.type === 'quote_mention' ? 'tagget deg i tilbud'
                        : 'i en oppgave'}
```

- [ ] **Step 4: Update `handleClick` navigation for the new types**

Replace:

```tsx
    if (n.type === 'lead_assigned') {
      router.push(n.project_id ? `/admin/projects/${n.project_id}/contact` : `/admin/leads/${n.lead_id}`)
    } else if (n.type === 'task_assigned' || n.type === 'project_message') {
      router.push(`/admin/projects/${n.project_id}`)
    } else if (n.type === 'quote_mention') {
      router.push(`/admin/projects/${n.project_id}/quote`)
    } else {
      router.push(`/admin/postprod/${n.project_id}`)
    }
```

with:

```tsx
    if (n.type === 'lead_assigned') {
      router.push(n.project_id ? `/admin/projects/${n.project_id}/contact` : `/admin/leads/${n.lead_id}`)
    } else if (n.type === 'task_assigned' || n.type === 'project_message' || n.type === 'project_message_mention') {
      router.push(`/admin/projects/${n.project_id}`)
    } else if (n.type === 'quote_mention') {
      router.push(`/admin/projects/${n.project_id}/quote`)
    } else {
      router.push(`/admin/postprod/${n.project_id}`)
    }
```

(`task_message_mention` falls through to the existing `else` branch, same destination as `task_message` today.)

- [ ] **Step 5: Update `handleMarkAll` to also update local state immediately**

Replace:

```tsx
  async function handleMarkAll() {
    startTransition(async () => {
      await markAllAsRead()
      router.refresh()
    })
  }
```

with:

```tsx
  async function handleMarkAll() {
    startTransition(async () => {
      await markAllAsRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    })
  }
```

(Dropped `router.refresh()` since local state now reflects the change immediately — matches how `markAsRead` in `handleClick` already relies on the realtime UPDATE event to patch state instead of a full page refresh.)

- [ ] **Step 6: Verify with typecheck and build**

Run: `npm run lint && npm run build`
Expected: Both succeed.

- [ ] **Step 7: Manual browser verification**

Open `/admin/varsler` in one window logged in as User A. From another window/user, send a project-chat or task-chat message that mentions User A. Confirm the new notification appears at the top of User A's `/admin/varsler` list within ~1 second, with the correct "nevnte deg..." text and project/task name, without a reload. Then click "Merk alle som lest" and confirm the gold left-border disappears immediately.

- [ ] **Step 8: Commit**

```bash
git add app/admin/varsler/VarslerClient.tsx
git commit -m "feat: realtime notifications page + mention notification display"
```

---

## Summary of files touched

| File | Change |
|---|---|
| `supabase/migrations/081_message_mentions.sql` | New — mentions columns, trigger updates, realtime for task_messages |
| `lib/types.ts` | `ProjectMessage`/`TaskMessage` gain `mentions: string[]` |
| `lib/actions/notifications.ts` | `Notification.type` gains 2 new values |
| `lib/mentions.ts` | New — shared mention parsing/rendering helpers |
| `components/shared/MentionTextInput.tsx` | New — shared `@`-autocomplete input |
| `components/project/ProjectChat.tsx` | Mentions integration |
| `app/api/projects/[id]/messages/route.ts` | Accept/store `mentions` |
| `lib/actions/pipeline.ts` | `sendTaskMessage` accepts `mentions` |
| `app/admin/postprod/[id]/page.tsx` | Realtime task-chat + mentions integration |
| `app/admin/varsler/VarslerClient.tsx` | Realtime notifications + mention display |
