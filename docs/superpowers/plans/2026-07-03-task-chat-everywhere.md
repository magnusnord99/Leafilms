# Task-chat overalt + reparerte varsler — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every task, in every pipeline stage, gets a usable chat thread; clicking a chat notification always lands the user in the right conversation; the three chat surfaces (project/task/quote) behave consistently.

**Architecture:** `task_messages` already exists in the DB (migration 045) and is fully realtime + mention-wired (migration 081) — no schema changes needed except one additive migration for a notification fallback and quote-chat realtime. The work is UI: extract the postprod-only inline task-chat into a reusable `TaskChat` component, wrap it in a `TaskChatToggle` for flat task-list pages (preprod, project hub), wire `?task=` deep-linking, and fix notification routing that currently hardcodes postprod.

**Tech Stack:** Next.js App Router (client components, `'use client'`), Supabase (Postgres + RLS + Realtime), TypeScript strict mode, inline-style React (no CSS framework in these admin pages).

## Global Constraints

- Norwegian UI copy throughout (matches existing app).
- No new database tables — `task_messages`/`task_assignees`/`notifications` already support this generically.
- Migration file goes in `supabase/migrations/082_...sql` (next number after `081_message_mentions.sql`) — **write it, do not run it against Supabase**. This repo's convention (per `CLAUDE.md`) is that migrations are committed as files and applied separately by Magnus. Do not run `supabase db push` or any command that touches the live database.
- No automated test suite exists in this repo (`package.json` has no `test` script, no jest/vitest/playwright). Verification is `npx tsc --noEmit` for type safety plus manual `npm run dev` walkthroughs described precisely in each task.
- Preserve all existing visual behavior in postprod — this is a refactor-and-extend, not a redesign. Colors, spacing, and copy for the parts being moved must stay pixel-identical.
- Work happens on branch `feat/task-chat-everywhere`. Do not push to remote or merge to `main` — leave it for Magnus to review.

---

### Task 0: Create the working branch

**Files:** none (git only)

- [ ] **Step 1: Create and switch to the feature branch**

```bash
git checkout -b feat/task-chat-everywhere
```

Expected: `Switched to a new branch 'feat/task-chat-everywhere'`

---

### Task 1: Extract `TaskChat` component from postprod, refactor postprod to use it

**Files:**
- Create: `components/task/TaskChat.tsx`
- Modify: `app/admin/postprod/[id]/page.tsx`

**Interfaces:**
- Produces: `TaskChat` component —
  ```ts
  type TaskChatProps = {
    taskId: string
    taskTitle: string
    currentUserId: string | null
    profiles: MentionableProfile[] // from '@/lib/mentions'
  }
  export function TaskChat(props: TaskChatProps): JSX.Element
  ```
  Renders a self-contained, self-scrolling chat panel: header ("Chat" + task title), scrollable message list (bubbles, mention highlighting), and a `MentionTextInput`-driven send box. Fetches its own messages via `getTaskMessages(taskId)`, sends via `sendTaskMessage`, subscribes to Supabase Realtime on `task_messages` filtered by `task_id`, and re-fetches/re-subscribes whenever `taskId` changes. Root element uses `flex: 1, display: 'flex', flexDirection: 'column'` so it fills whatever container it's placed in.
- Consumes (already exist, no changes needed): `getTaskMessages`, `sendTaskMessage` from `@/lib/actions/pipeline`; `extractMentionIds`, `splitMentionSegments`, `MentionableProfile` from `@/lib/mentions`; `MentionTextInput` from `@/components/shared/MentionTextInput`; `supabase` from `@/lib/supabase-client`; `TaskMessage` from `@/lib/types`.

- [ ] **Step 1: Create `components/task/TaskChat.tsx`**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { getTaskMessages, sendTaskMessage } from '@/lib/actions/pipeline'
import { extractMentionIds, splitMentionSegments, type MentionableProfile } from '@/lib/mentions'
import { MentionTextInput } from '@/components/shared/MentionTextInput'
import { supabase } from '@/lib/supabase-client'
import type { TaskMessage } from '@/lib/types'

const C = {
  bg:       '#181920',
  surface:  '#21212D',
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text:     '#EEEEF2',
  text2:    '#B4B4CC',
  text3:    '#8484A0',
  accent:   '#7C5CFC',
  accentBg: 'rgba(124,92,252,0.08)',
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
  }
  return (
    d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }) +
    ' · ' +
    d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
  )
}

type Props = {
  taskId: string
  taskTitle: string
  currentUserId: string | null
  profiles: MentionableProfile[]
}

export function TaskChat({ taskId, taskTitle, currentUserId, profiles }: Props) {
  const [messages, setMessages] = useState<TaskMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sendingMsg, setSendingMsg] = useState(false)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  async function loadMessages() {
    setLoadingMsgs(true)
    const msgs = await getTaskMessages(taskId)
    setMessages(msgs)
    setLoadingMsgs(false)
  }

  useEffect(() => {
    loadMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const channel = supabase
      .channel(`task-messages-${taskId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'task_messages', filter: `task_id=eq.${taskId}` },
        () => {
          loadMessages()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId])

  async function handleSendMessage() {
    if (!newMessage.trim() || sendingMsg) return
    setSendingMsg(true)
    const mentions = extractMentionIds(newMessage.trim(), profiles)
    const result = await sendTaskMessage(taskId, newMessage.trim(), mentions)
    if (result.ok) {
      setNewMessage('')
      await loadMessages()
    }
    setSendingMsg(false)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: C.bg }}>
      {/* Chat header */}
      <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Chat
        </p>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, marginTop: 2 }}>
          {taskTitle}
        </p>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loadingMsgs ? (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, textAlign: 'center', marginTop: 32 }}>Laster meldinger...</p>
        ) : messages.length === 0 ? (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, textAlign: 'center', marginTop: 32 }}>
            Ingen meldinger ennå. Start diskusjonen!
          </p>
        ) : (
          messages.map(msg => {
            const isMe = currentUserId === msg.user_id
            const senderName = msg.user?.name ?? msg.user?.email?.split('@')[0] ?? 'Ukjent'
            return (
              <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', gap: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {!isMe && (
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: C.surface2, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.55rem', fontWeight: 700, color: C.text2 }}>
                        {senderName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 500, color: isMe ? C.accent : C.text3 }}>
                    {isMe ? 'Du' : senderName}
                  </span>
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3 }}>
                    {formatTime(msg.created_at)}
                  </span>
                </div>
                <div style={{
                  maxWidth: '85%', padding: '8px 12px', borderRadius: isMe ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  background: isMe ? C.accentBg : C.surface,
                  border: `1px solid ${isMe ? 'rgba(124,92,252,0.2)' : C.border}`,
                }}>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {splitMentionSegments(msg.message).map((seg, i) =>
                      seg.isMention
                        ? <span key={i} style={{ color: C.accent, fontWeight: 600 }}>{seg.text}</span>
                        : <span key={i}>{seg.text}</span>
                    )}
                  </p>
                </div>
              </div>
            )
          })
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Message input */}
      <div style={{ flexShrink: 0, padding: '12px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
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
        <button
          onClick={handleSendMessage}
          disabled={!newMessage.trim() || sendingMsg}
          style={{
            width: 38, height: 38, borderRadius: 8, flexShrink: 0,
            background: newMessage.trim() ? C.accent : C.surface2,
            border: 'none', cursor: newMessage.trim() && !sendingMsg ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: !newMessage.trim() || sendingMsg ? 0.5 : 1,
            transition: 'background 0.15s, opacity 0.15s',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M14 8L2 3L5.5 8L2 13L14 8Z" fill="white" />
          </svg>
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Refactor `app/admin/postprod/[id]/page.tsx` to use `TaskChat`**

Remove now-duplicated state/logic and swap in the component. Make these exact edits:

1. Add the import (near the other local imports, e.g. after the `MentionTextInput` import on line 22):
   ```tsx
   import { TaskChat } from '@/components/task/TaskChat'
   ```

2. Delete these state declarations (they now live inside `TaskChat`): line 197 (`const [messages, setMessages] = useState<TaskMessage[]>([])`), line 204 (`const [newMessage, setNewMessage] = useState('')`), line 205 (`const [sendingMsg, setSendingMsg] = useState(false)`), line 206 (`const [loadingMsgs, setLoadingMsgs] = useState(false)`).

3. Delete `chatEndRef` (line 250: `const chatEndRef = useRef<HTMLDivElement>(null)`) and its scroll effect (lines 297-299:
   ```tsx
   useEffect(() => {
     chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
   }, [messages])
   ```
   ).

4. Delete the `loadMessages` function (lines 396-401):
   ```tsx
   async function loadMessages(taskId: string) {
     setLoadingMsgs(true)
     const msgs = await getTaskMessages(taskId)
     setMessages(msgs)
     setLoadingMsgs(false)
   }
   ```

5. In the effect at lines 405-416, delete just the `loadMessages(selectedTask.id)` call (line 407) — keep the notes/taskData init logic:
   ```tsx
   useEffect(() => {
     if (!selectedTask) return
     if (notes[selectedTask.id] === undefined) {
       setNotes(prev => ({ ...prev, [selectedTask.id]: selectedTask.notes ?? '' }))
     }
     if (taskData[selectedTask.id] === undefined) {
       const td = (selectedTask.task_data as Record<string, string>) ?? {}
       setTaskData(prev => ({ ...prev, [selectedTask.id]: td }))
       pendingTaskDataRef.current[selectedTask.id] = td
     }
   }, [selectedTask?.id])
   ```

6. Delete the entire realtime effect at lines 418-436 (`// Realtime: nye meldinger...` through its closing `}, [selectedTask?.id])`) — `TaskChat` now owns this subscription.

7. In `handleAdvance` (starts line 480), delete the `loadMessages(displayTasks[nextIdx].id)` call (line 489) — `TaskChat` will load fresh messages automatically when its `taskId` prop changes because `setSelectedIdx(nextIdx)` (line 488, kept) changes `selectedTask`.

8. Delete the `handleSendMessage` function entirely (lines 504-514):
   ```tsx
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

9. Replace the entire "Right: chat" block, lines 1743-1840 (from `{/* Right: chat */}` through its matching closing `</div>`), with:
   ```tsx
   {/* Right: chat */}
   <TaskChat
     taskId={selectedTask.id}
     taskTitle={selectedTask.title}
     currentUserId={currentUser?.id ?? null}
     profiles={profiles}
   />
   ```

10. `getTaskMessages`, `sendTaskMessage` are no longer called directly in this file — remove them from the `lib/actions/pipeline` import list at the top (lines 6-15) if no other usage remains in the file. `extractMentionIds` and `splitMentionSegments` (line 21 import from `@/lib/mentions`) may also become unused in this file — check with a search for remaining usages before removing; leave the import if anything else in the file still uses them.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors related to `app/admin/postprod/[id]/page.tsx` or `components/task/TaskChat.tsx`. Pre-existing unrelated errors elsewhere in the repo (if any) are not this task's concern — note them but don't fix.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, open `/admin/postprod/<a real project id>`. Confirm: task list still shows, selecting a task shows its chat with existing messages, sending a message works and appears immediately, the "Chat" header still shows the selected task's title, switching tasks loads that task's messages. Visually compare against a screenshot/memory of current behavior — no layout shift.

- [ ] **Step 5: Commit**

```bash
git add components/task/TaskChat.tsx "app/admin/postprod/[id]/page.tsx"
git commit -m "refactor: extract TaskChat component from postprod inline chat"
```

---

### Task 2: `getTaskMessageCounts` server action

**Files:**
- Modify: `lib/actions/pipeline.ts`

**Interfaces:**
- Produces: `getTaskMessageCounts(taskIds: string[]): Promise<Record<string, number>>` — maps `task_id` to message count for the given tasks in one query. Returns `{}` for empty input or on error.

- [ ] **Step 1: Add the function to `lib/actions/pipeline.ts`**

Add directly after the existing `sendTaskMessage` function (after line 1080, before the next function's comment block at line 1082):

```ts
export async function getTaskMessageCounts(taskIds: string[]): Promise<Record<string, number>> {
  if (taskIds.length === 0) return {}
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('task_messages')
      .select('task_id')
      .in('task_id', taskIds)

    if (error) {
      console.error('getTaskMessageCounts error:', error)
      return {}
    }

    const counts: Record<string, number> = {}
    for (const row of data ?? []) {
      counts[row.task_id] = (counts[row.task_id] ?? 0) + 1
    }
    return counts
  } catch (err) {
    console.error('getTaskMessageCounts unexpected error:', err)
    return {}
  }
}
```

(This fetches `task_id` per row and counts client-side rather than using `.select('task_id', { count: ... }).group()` because the Supabase JS client doesn't support `GROUP BY` directly — for a single project's task list this is at most a few hundred rows, so the round-trip cost is negligible.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/pipeline.ts
git commit -m "feat: add getTaskMessageCounts server action"
```

---

### Task 3: `TaskChatToggle` component

**Files:**
- Create: `components/task/TaskChatToggle.tsx`

**Interfaces:**
- Consumes: `TaskChat` from `./TaskChat` (Task 1).
- Produces:
  ```ts
  type TaskChatToggleProps = {
    taskId: string
    taskTitle: string
    currentUserId: string | null
    profiles: MentionableProfile[]
    messageCount: number
    forceOpen?: boolean
  }
  export function TaskChatToggle(props: TaskChatToggleProps): JSX.Element
  ```
  Renders a small pill button (chat icon + message count badge) meant to sit inline inside an existing flex row, plus — when expanded — a full-width panel below it containing `TaskChat`. Uses the CSS flex-wrap trick (`flexBasis: '100%'`) so it can be dropped into an existing horizontal flex row without restructuring that row's DOM, **provided the parent row has `flexWrap: 'wrap'` set** (Tasks 4 and 5 add this).

- [ ] **Step 1: Create `components/task/TaskChatToggle.tsx`**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { TaskChat } from './TaskChat'
import type { MentionableProfile } from '@/lib/mentions'

const C = {
  border:  '#3C3C52',
  text3:   '#8484A0',
  accent:  '#7C5CFC',
}

type Props = {
  taskId: string
  taskTitle: string
  currentUserId: string | null
  profiles: MentionableProfile[]
  messageCount: number
  forceOpen?: boolean
}

export function TaskChatToggle({ taskId, taskTitle, currentUserId, profiles, messageCount, forceOpen }: Props) {
  const [expanded, setExpanded] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (forceOpen) {
      setExpanded(true)
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [forceOpen])

  return (
    <>
      <button
        onClick={() => setExpanded(e => !e)}
        title={expanded ? 'Skjul chat' : 'Åpne chat'}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, cursor: 'pointer',
          background: expanded ? 'rgba(124,92,252,0.12)' : 'transparent',
          border: `1px solid ${expanded ? 'rgba(124,92,252,0.3)' : C.border}`,
          borderRadius: 20, padding: '3px 8px', color: expanded ? C.accent : C.text3,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {messageCount > 0 && (
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600 }}>
            {messageCount}
          </span>
        )}
      </button>
      {expanded && (
        <div
          ref={panelRef}
          style={{
            flexBasis: '100%', width: '100%', height: 360, marginTop: 8,
            border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden',
          }}
        >
          <TaskChat taskId={taskId} taskTitle={taskTitle} currentUserId={currentUserId} profiles={profiles} />
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/task/TaskChatToggle.tsx
git commit -m "feat: add TaskChatToggle wrapper for flat task-list pages"
```

---

### Task 4: Wire task-chat into preprod's task list

**Files:**
- Modify: `app/admin/preprod/[id]/page.tsx`

**Interfaces:**
- Consumes: `TaskChatToggle` (Task 3), `getTaskMessageCounts` (Task 2), `getCurrentUserProfile` (already exists in `@/lib/actions/pipeline`, same shape used by postprod — `{ id, name, email } | null`).

- [ ] **Step 1: Add imports**

At the top of the file, extend the existing import from `@/lib/actions/pipeline` (currently `import { toggleTaskAssignee, setInvoiceAssignee, setProjectLead } from '@/lib/actions/pipeline'`) to also pull in `getCurrentUserProfile` and `getTaskMessageCounts`:

```tsx
import { toggleTaskAssignee, setInvoiceAssignee, setProjectLead, getCurrentUserProfile, getTaskMessageCounts } from '@/lib/actions/pipeline'
```

Add a new import for `TaskChatToggle`:

```tsx
import { TaskChatToggle } from '@/components/task/TaskChatToggle'
```

Add `useSearchParams` to the existing `next/navigation` import (currently `import { useParams } from 'next/navigation'` at the top):

```tsx
import { useParams, useSearchParams } from 'next/navigation'
```

- [ ] **Step 2: Add state and data loading in `PreprodDetailPage`**

In the component body (around line 956-967, alongside the other `useState` declarations), add:

```tsx
const searchParams = useSearchParams()
const deepLinkTaskId = searchParams?.get('task') ?? null
const [currentUserId, setCurrentUserId] = useState<string | null>(null)
const [messageCounts, setMessageCounts] = useState<Record<string, number>>({})
```

In the data-loading effect (lines 968-979), extend it to also fetch the current user and message counts:

```tsx
useEffect(() => {
  getPreprodDetail(id).then(detail => {
    if (detail) {
      setProject(detail.project)
      setTasks(detail.tasks)
      setProfiles(detail.profiles)
      setPreprod(detail.project.preprod)
      setProjectLead_(detail.project.project_lead ?? null)
      if (detail.tasks.length > 0) {
        getTaskMessageCounts(detail.tasks.map(t => t.id)).then(setMessageCounts)
      }
    }
    setLoading(false)
  })
  getCurrentUserProfile().then(profile => setCurrentUserId(profile?.id ?? null))
}, [id])
```

- [ ] **Step 3: Pass new props down to `TaskList`**

Change the `TaskList` call site (currently lines 1160-1164):

```tsx
<TaskList
  tasks={tasks}
  profiles={profiles}
  onStatusChange={handleTaskStatusChange}
  currentUserId={currentUserId}
  messageCounts={messageCounts}
  deepLinkTaskId={deepLinkTaskId}
/>
```

- [ ] **Step 4: Update `TaskList` component signature and row rendering**

Change the `TaskList` function signature (currently lines 721-727):

```tsx
function TaskList({
  tasks, profiles, onStatusChange, currentUserId, messageCounts, deepLinkTaskId,
}: {
  tasks: Task[]
  profiles: { id: string; name: string | null; email: string }[]
  onStatusChange: (taskId: string, status: Task['status']) => void
  currentUserId: string | null
  messageCounts: Record<string, number>
  deepLinkTaskId: string | null
}) {
```

Add `flexWrap: 'wrap'` to the row header div's style (currently line 766: `<div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>`), so:

```tsx
<div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', flexWrap: 'wrap' }}>
```

Insert `TaskChatToggle` as a new child right after the "Status label" `<span>` and before that row header div's closing `</div>` (currently lines 815-818):

```tsx
{/* Status label */}
<span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.04em', color: s.color, flexShrink: 0 }}>
  {s.label}
</span>

<TaskChatToggle
  taskId={task.id}
  taskTitle={task.title}
  currentUserId={currentUserId}
  profiles={profiles}
  messageCount={messageCounts[task.id] ?? 0}
  forceOpen={deepLinkTaskId === task.id}
/>
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Manual verification**

`npm run dev`, open `/admin/preprod/<a real pre-prod project id>`. Confirm: each task row shows a chat icon button; clicking it expands a chat panel below that row (wrapping to full width, not squeezing the row); sending a message works; the message count badge appears after sending and persists across a page reload; the assignee "+" picker still works independently.

- [ ] **Step 7: Commit**

```bash
git add "app/admin/preprod/[id]/page.tsx"
git commit -m "feat: add per-task chat to preprod task list"
```

---

### Task 5: Wire task-chat + `ProjectChat` into the project hub

**Files:**
- Modify: `app/admin/projects/[id]/page.tsx`

**Interfaces:**
- Consumes: `TaskChatToggle` (Task 3), `getTaskMessageCounts` (Task 2), `getCurrentUserProfile` (existing), `ProjectChat` from `@/components/project/ProjectChat` (existing, `{ projectId: string }` prop).

- [ ] **Step 1: Add imports**

Extend the existing `@/lib/actions/pipeline` import (line 6) to include `getCurrentUserProfile` and `getTaskMessageCounts`:

```tsx
import { getProjectHub, updateTaskStatus, getAllProfiles, toggleTaskAssignee, updateProjectDeliveryInfo, saveProjectMeetingNotes, analyzeProjectNotes, getContractStatus, setProjectLead, getCurrentUserProfile, getTaskMessageCounts } from '@/lib/actions/pipeline'
```

Add two new imports:

```tsx
import { TaskChatToggle } from '@/components/task/TaskChatToggle'
import { ProjectChat } from '@/components/project/ProjectChat'
```

(`useSearchParams` is already imported at line 4 — no change needed there.)

- [ ] **Step 2: Add state and data loading**

Near the other `useState` declarations (around line 625-627), add:

```tsx
const [currentUserId, setCurrentUserId] = useState<string | null>(null)
const [messageCounts, setMessageCounts] = useState<Record<string, number>>({})
const deepLinkTaskId = searchParams?.get('task') ?? null
```

In `fetchHub` (starts line 629), extend it to also fetch the current user and message counts. Add right after `setProfiles(allProfiles)` (line 653), still inside `fetchHub`, before `setLoading(false)`:

```tsx
if (data && data.tasks.length > 0) {
  getTaskMessageCounts(data.tasks.map(t => t.id)).then(setMessageCounts)
}
```

And separately, outside `fetchHub` but in the same effect that calls it (find `useEffect(() => { fetchHub() }, [projectId])` immediately after the function definition), fetch the current user once:

```tsx
useEffect(() => { fetchHub() }, [projectId])
useEffect(() => {
  getCurrentUserProfile().then(profile => setCurrentUserId(profile?.id ?? null))
}, [])
```

(If an effect already exists for `fetchHub`, just add the second `useEffect` alongside it — do not duplicate the first.)

- [ ] **Step 3: Pass new props to `TaskChecklist`**

Change the `TaskChecklist` call site (currently lines 1197-1205):

```tsx
<TaskChecklist
  tasks={tasks}
  profiles={profiles}
  onToggle={handleTaskToggle}
  onAssigneeToggle={handleAssigneeToggle}
  togglingId={togglingTaskId}
  hasSections={hasSections}
  quote={quote}
  currentUserId={currentUserId}
  messageCounts={messageCounts}
  deepLinkTaskId={deepLinkTaskId}
/>
```

- [ ] **Step 4: Update `TaskChecklist` signature and row rendering**

Change the function signature (currently lines 497-513):

```tsx
function TaskChecklist({
  tasks,
  profiles,
  onToggle,
  onAssigneeToggle,
  togglingId,
  hasSections,
  quote,
  currentUserId,
  messageCounts,
  deepLinkTaskId,
}: {
  tasks: Task[]
  profiles: Profile[]
  onToggle: (id: string, s: Task['status']) => void
  onAssigneeToggle: (taskId: string, profileId: string) => void
  togglingId: string | null
  hasSections: boolean
  quote: Quote | null
  currentUserId: string | null
  messageCounts: Record<string, number>
  deepLinkTaskId: string | null
}) {
```

Add `flexWrap: 'wrap'` to the row's style (currently line 530: `style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: C.surface, border: ..., borderRadius: 6, opacity: isToggling ? 0.5 : 1, transition: 'opacity 0.15s, border-color 0.2s', gap: 8 }}`), so it reads:

```tsx
style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: C.surface, border: `1px solid ${isDone ? 'rgba(76,175,125,0.2)' : C.border}`, borderRadius: 6, opacity: isToggling ? 0.5 : 1, transition: 'opacity 0.15s, border-color 0.2s', gap: 8, flexWrap: 'wrap' }}
```

Insert `TaskChatToggle` inside the row's second inner div (currently lines 552-557, the one holding `AssigneePicker` and the status label), as a new child right before that div's closing `</div>`:

```tsx
<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
  <AssigneePicker task={task} profiles={profiles} onToggle={onAssigneeToggle} />
  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: isDone ? C.success : task.status === 'in_progress' ? '#F0A500' : C.text3 }}>
    {isDone ? 'Ferdig' : task.status === 'in_progress' ? 'Pågår' : 'Todo'}
  </span>
  <TaskChatToggle
    taskId={task.id}
    taskTitle={task.title}
    currentUserId={currentUserId}
    profiles={profiles}
    messageCount={messageCounts[task.id] ?? 0}
    forceOpen={deepLinkTaskId === task.id}
  />
</div>
```

- [ ] **Step 5: Mount `ProjectChat` on the hub page**

Near the end of the component's returned JSX — right before the final closing `</div></div>)}` at the end of the file (after the "lost modal" block's closing `)}` and before the outermost two closing `</div>` tags) — add:

```tsx
<ProjectChat projectId={projectId} />
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Manual verification**

`npm run dev`, open `/admin/projects/<a real project id>` (a project NOT in post_prod, e.g. one in `pre_prod` or `produksjon`). Confirm: each task row's chat toggle works identically to preprod's; a floating chat widget (bottom-right, same as on the `/edit` page) now appears and opens the project-level chat; sending works in both.

- [ ] **Step 8: Commit**

```bash
git add "app/admin/projects/[id]/page.tsx"
git commit -m "feat: add per-task chat and ProjectChat to project hub page"
```

---

### Task 6: Deep-linking via `?task=<id>` in postprod

**Files:**
- Modify: `app/admin/postprod/[id]/page.tsx`

**Interfaces:**
- Produces: postprod page auto-selects the task named by the `?task=` query param on initial load.

- [ ] **Step 1: Add `useSearchParams` import**

Change line 4 from `import { useParams, useRouter } from 'next/navigation'` to:

```tsx
import { useParams, useRouter, useSearchParams } from 'next/navigation'
```

- [ ] **Step 2: Read the query param**

Near the top of the component body (around line 190-192, alongside `const params = useParams()`), add:

```tsx
const searchParams = useSearchParams()
const deepLinkTaskId = searchParams?.get('task') ?? null
```

- [ ] **Step 3: Make `getInitialIdx` accept a preferred task id**

Change the function (currently lines 391-394):

```tsx
function getInitialIdx(taskList: Task[], preferredTaskId?: string | null): number {
  if (preferredTaskId) {
    const preferredIdx = taskList.findIndex(t => t.id === preferredTaskId)
    if (preferredIdx !== -1) return preferredIdx
  }
  const idx = taskList.findIndex(t => t.status !== 'done')
  return idx === -1 ? 0 : idx
}
```

- [ ] **Step 4: Pass the deep-link id at the two initial-load call sites only**

In `fetchAll` (the effect that runs once per `projectId` on mount), change line 335 from `setSelectedIdx(getInitialIdx(seeded))` to:

```tsx
setSelectedIdx(getInitialIdx(seeded, deepLinkTaskId))
```

and change line 344 from `setSelectedIdx(getInitialIdx(projectTasks))` to:

```tsx
setSelectedIdx(getInitialIdx(projectTasks, deepLinkTaskId))
```

Leave the other three call sites (tab switching, manual reseed, delivery completion — originally around lines 595, 620, 643) unchanged; they represent in-session re-selection after the initial deep link has already been honored.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Manual verification**

`npm run dev`, find a task id for a post_prod project's task (query it via Supabase dashboard or by inspecting `getTasksForProject` output), open `/admin/postprod/<projectId>?task=<taskId>`. Confirm: that specific task is pre-selected on load instead of the default "first not-done" task.

- [ ] **Step 7: Commit**

```bash
git add "app/admin/postprod/[id]/page.tsx"
git commit -m "feat: honor ?task= deep link on postprod initial load"
```

---

### Task 7: Fix notification routing for task messages

**Files:**
- Modify: `lib/actions/notifications.ts`
- Modify: `app/admin/varsler/VarslerClient.tsx`

**Interfaces:**
- Produces: `Notification.tasks` gains `pipeline_stage: PipelineStage | null` so the click handler can route without an extra round-trip.

- [ ] **Step 1: Extend the `Notification` type and query in `lib/actions/notifications.ts`**

Change the `tasks` field in the `Notification` type (currently line 17: `tasks: { title: string } | null`) to:

```ts
tasks: { title: string; pipeline_stage: import('@/lib/types').PipelineStage | null } | null
```

Change the `getNotifications` query (currently line 28: `.select('*, projects(title), tasks(title), leads(name, company)')`) to:

```ts
.select('*, projects(title), tasks(title, pipeline_stage), leads(name, company)')
```

- [ ] **Step 2: Fix `handleClick` routing in `VarslerClient.tsx`**

Replace the current `handleClick` function (lines 76-89):

```tsx
async function handleClick(n: Notification) {
  if (!n.read) {
    startTransition(async () => { await markAsRead(n.id) })
  }
  if (n.type === 'lead_assigned') {
    router.push(n.project_id ? `/admin/projects/${n.project_id}/contact` : `/admin/leads/${n.lead_id}`)
  } else if (n.type === 'task_assigned' || n.type === 'project_message' || n.type === 'project_message_mention') {
    router.push(`/admin/projects/${n.project_id}`)
  } else if (n.type === 'quote_mention') {
    router.push(`/admin/projects/${n.project_id}/quote`)
  } else if (n.type === 'task_message' || n.type === 'task_message_mention') {
    const stage = n.tasks?.pipeline_stage
    if (!n.task_id) {
      router.push(`/admin/postprod/${n.project_id}`)
    } else if (stage === 'post_prod') {
      router.push(`/admin/postprod/${n.project_id}?task=${n.task_id}`)
    } else if (stage === 'pre_prod') {
      router.push(`/admin/preprod/${n.project_id}?task=${n.task_id}`)
    } else {
      router.push(`/admin/projects/${n.project_id}?task=${n.task_id}`)
    }
  } else {
    router.push(`/admin/postprod/${n.project_id}`)
  }
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors. If TypeScript complains about the inline `import('@/lib/types').PipelineStage` syntax, instead add a top-of-file import `import type { PipelineStage } from '@/lib/types'` in `lib/actions/notifications.ts` and use `PipelineStage | null` directly in the type.

- [ ] **Step 4: Manual verification**

`npm run dev`, log in as two different users in two browser profiles. In browser A, open a pre-prod task's chat (via Task 4's UI) and send a message that @mentions the user logged in as browser B. In browser B, confirm a notification appears (bell + `/admin/varsler`), and clicking it navigates to `/admin/preprod/<projectId>?task=<taskId>` with that task's chat auto-expanded (per Task 4's `forceOpen`). Repeat for a post_prod task (should land on postprod with the task selected) and a hub-only-stage task (should land on the project hub with that task's chat expanded).

- [ ] **Step 5: Commit**

```bash
git add lib/actions/notifications.ts app/admin/varsler/VarslerClient.tsx
git commit -m "fix: route task-message notifications to the task's actual pipeline stage"
```

---

### Task 8: Fix "Mine oppgaver" task routing

**Files:**
- Modify: `app/admin/tasks/page.tsx`

**Interfaces:**
- Produces: `taskHref` routes every task to a page that can actually show its chat, with `?task=` deep-linking.

- [ ] **Step 1: Replace `taskHref`**

Replace the current function (lines 51-57):

```tsx
function taskHref(task: TaskWithProject): string {
  if (!task.project) return '/admin/projects'
  if (task.project.pipeline_stage === 'post_prod') {
    return `/admin/postprod/${task.project.id}?task=${task.id}`
  }
  if (task.project.pipeline_stage === 'pre_prod') {
    return `/admin/preprod/${task.project.id}?task=${task.id}`
  }
  return `/admin/projects/${task.project.id}?task=${task.id}`
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Manual verification**

`npm run dev`, open `/admin/tasks`, click a task belonging to a pre-prod project — confirm it lands on `/admin/preprod/<id>?task=<taskId>` with that task's chat expanded. Click a task belonging to a project in an earlier stage (e.g. `møte`) — confirm it lands on the hub page with the chat expanded.

- [ ] **Step 4: Commit**

```bash
git add app/admin/tasks/page.tsx
git commit -m "fix: deep-link Mine oppgaver task clicks to the right stage and task"
```

---

### Task 9: Migration 082 — project-message notification fallback + quote_messages realtime

**Files:**
- Create: `supabase/migrations/082_notify_project_message_fallback.sql`

**Interfaces:** none (SQL only, additive).

- [ ] **Step 1: Create the migration file**

```sql
-- 082_notify_project_message_fallback.sql
-- Fikser to hull i chat-varsling:
-- 1) notify_project_message() varsler ingen hvis prosjektet ikke har
--    task_assignees ennå (typisk lead/møte-steg) — fall tilbake til
--    project_lead_id hvis satt.
-- 2) quote_messages manglet i supabase_realtime-publikasjonen, så
--    QuoteChat kunne ikke være realtime (se migrasjon 081 for samme
--    mønster brukt på task_messages/project_messages).

-- IMPORTANT: this replaces the mention-aware version of the function
-- introduced in 081_message_mentions.sql (lines 19-47), NOT the older
-- plain version from 056_notifications.sql. The mention-split behavior
-- (mentioned users get 'project_message_mention', everyone else on a
-- project task gets 'project_message') is preserved verbatim below —
-- only the new `notified`/fallback block at the end is added.
CREATE OR REPLACE FUNCTION notify_project_message()
RETURNS TRIGGER AS $$
DECLARE
  rec      RECORD;
  preview  TEXT;
  notified BOOLEAN := false;
  lead_id  UUID;
BEGIN
  preview := left(NEW.content, 80);

  FOR rec IN
    SELECT DISTINCT m AS profile_id
    FROM unnest(NEW.mentions) AS m
    WHERE m != NEW.user_id
  LOOP
    notified := true;
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
    notified := true;
    INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name)
    VALUES (rec.profile_id, 'project_message', NEW.project_id, preview, COALESCE(NEW.user_name, 'Ukjent'));
  END LOOP;

  IF NOT notified THEN
    SELECT project_lead_id INTO lead_id FROM projects WHERE id = NEW.project_id;
    IF lead_id IS NOT NULL AND lead_id != NEW.user_id THEN
      INSERT INTO notifications (user_id, type, project_id, message_preview, sender_name)
      VALUES (lead_id, 'project_message', NEW.project_id, preview, COALESCE(NEW.user_name, 'Ukjent'));
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger already exists (trg_notify_project_message on project_messages,
-- created in 056_notifications.sql, re-pointed at this function each time
-- it's replaced) — CREATE OR REPLACE FUNCTION above is enough, no need to
-- re-create the trigger.

-- quote_messages realtime (mirrors 081_message_mentions.sql:89-107)
ALTER TABLE quote_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'quote_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE quote_messages;
  END IF;
END $$;
```

- [ ] **Step 2: Do NOT run this migration against Supabase**

This repo's convention (per `CLAUDE.md`'s "Uapplied migrasjoner" section) is that migrations are committed as files and applied separately, manually, by Magnus. Do not run `supabase db push`, `supabase migration up`, or execute this SQL against the live database. Leave it for morning review.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/082_notify_project_message_fallback.sql
git commit -m "feat: migration for project-message notification fallback + quote_messages realtime (not yet applied)"
```

---

### Task 10: Consolidate `QuoteChat` onto the shared mention system + realtime

**Files:**
- Modify: `components/quote/QuoteChat.tsx`
- Modify: `app/admin/projects/[id]/quote/page.tsx`

**Interfaces:**
- Consumes: `MentionTextInput` from `@/components/shared/MentionTextInput`, `extractMentionIds`/`splitMentionSegments`/`MentionableProfile` from `@/lib/mentions` (all pre-existing, unchanged), `supabase` from `@/lib/supabase-client`.
- `QuoteChat`'s `profiles` prop type changes from `{ id: string; name: string | null }[]` to `MentionableProfile[]` (`{ id: string; name: string | null; email: string }[]`) — the caller must be updated to fetch `email` too.

- [ ] **Step 1: Update the profile fetch in `app/admin/projects/[id]/quote/page.tsx`**

Change line 53 from:
```tsx
supabase.from('profiles').select('id, name').returns<{ id: string; name: string | null }[]>(),
```
to:
```tsx
supabase.from('profiles').select('id, name, email').returns<{ id: string; name: string | null; email: string }[]>(),
```

Change the `profiles` state type declaration (line 31) from `useState<{ id: string; name: string | null }[]>([])` to `useState<{ id: string; name: string | null; email: string }[]>([])`.

Change line 66 from:
```tsx
setProfiles((profilesRes.data ?? []) as { id: string; name: string | null }[])
```
to:
```tsx
setProfiles((profilesRes.data ?? []) as { id: string; name: string | null; email: string }[])
```

Change line 116 similarly (the local `const profiles = (profilesRes.data ?? []) as { id: string; name: string | null }[]`) to include `email: string`.

- [ ] **Step 2: Rewrite `QuoteChat.tsx`**

Replace the entire file with:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { getQuoteMessages, sendQuoteMessage } from '@/lib/actions/quotes'
import type { QuoteMessage } from '@/lib/types'
import { C } from '@/lib/admin-theme'
import { extractMentionIds, splitMentionSegments, type MentionableProfile } from '@/lib/mentions'
import { MentionTextInput } from '@/components/shared/MentionTextInput'
import { supabase } from '@/lib/supabase-client'

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('nb-NO', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function QuoteChat({
  quoteId,
  projectId,
  profiles,
}: {
  quoteId: string
  projectId: string
  profiles: MentionableProfile[]
}) {
  const [messages, setMessages] = useState<QuoteMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  async function loadMessages() {
    const msgs = await getQuoteMessages(quoteId)
    setMessages(msgs)
  }

  useEffect(() => {
    loadMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const channel = supabase
      .channel(`quote-messages-${quoteId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'quote_messages', filter: `quote_id=eq.${quoteId}` },
        () => {
          loadMessages()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId])

  async function handleSend() {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      const result = await sendQuoteMessage({
        quoteId,
        projectId,
        message: text.trim(),
        mentionedUserIds: extractMentionIds(text.trim(), profiles),
      })
      if (result.ok) {
        setText('')
        await loadMessages()
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ marginTop: 24 }}>
      <p style={{
        fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600,
        color: C.text2, textTransform: 'uppercase' as const, letterSpacing: '0.08em',
        marginBottom: 12,
      }}>
        Tilbuds-chat
      </p>

      {/* Meldingsliste */}
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6,
        maxHeight: 320, overflowY: 'auto', padding: '12px 16px',
        display: 'flex', flexDirection: 'column', gap: 12,
        minHeight: 80,
      }}>
        {messages.length === 0 && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, fontStyle: 'italic' }}>
            Ingen meldinger ennå. Bruk @navn for å tagge noen.
          </p>
        )}
        {messages.map(msg => (
          <div key={msg.id}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600, color: C.text }}>
                {msg.user?.name ?? msg.user?.email ?? 'Ukjent'}
              </span>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3 }}>
                {formatTime(msg.created_at)}
              </span>
            </div>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text2, margin: 0, lineHeight: 1.5 }}>
              {splitMentionSegments(msg.message).map((seg, i) =>
                seg.isMention
                  ? <span key={i} style={{ color: C.accent, fontWeight: 600 }}>{seg.text}</span>
                  : <span key={i}>{seg.text}</span>
              )}
            </p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ marginTop: 8 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <MentionTextInput
            value={text}
            onChange={setText}
            onEnter={handleSend}
            profiles={profiles}
            as="textarea"
            rows={2}
            placeholder="Skriv en melding... Bruk @navn for å tagge"
            style={{
              flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem',
              padding: '8px 12px', borderRadius: 6, resize: 'vertical',
              background: C.surface, border: `1px solid ${C.border}`,
              color: C.text, outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!text.trim() || sending}
            style={{
              padding: '0 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: C.accent, color: '#fff', fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.78rem', fontWeight: 600,
              opacity: !text.trim() || sending ? 0.5 : 1,
              alignSelf: 'flex-end', height: 36, flexShrink: 0,
            }}
          >
            {sending ? '...' : 'Send'}
          </button>
        </div>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3, marginTop: 4 }}>
          Enter for å sende · Shift+Enter for linjeskift
        </p>
      </div>
    </div>
  )
}
```

Note: `lib/mentions.ts`'s `mentionToken()` builds tokens from first-name (falling back to email prefix), matching what `MentionTextInput`'s autocomplete inserts — so the old free-text `@name`-anywhere matching in the deleted `parseMessage`/`resolveMentions` is now handled consistently the same way `ProjectChat` and `TaskChat` do it.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors. If `MentionTextInput`'s `style` prop type rejects the `resize: 'vertical'` value (it might only be used as `resize: 'none'` elsewhere), check `components/shared/MentionTextInput.tsx`'s prop types — `style?: React.CSSProperties` should already accept it since it's just forwarded to the underlying `<textarea>`.

- [ ] **Step 4: Manual verification**

`npm run dev`, open a project's `/quote` page. Confirm: chat still loads existing messages, sending works, @mention autocomplete now shows a dropdown with keyboard navigation (arrow keys + Enter/Tab), matching `ProjectChat`'s behavior. Open the same page in a second browser profile, send a message from the first — confirm it now appears in the second without a manual refresh (this is the new realtime behavior; it will only actually fire once migration 082 is applied to Supabase — until then, sending still works via the existing refetch-after-send, it just won't show cross-browser in real time).

- [ ] **Step 5: Commit**

```bash
git add components/quote/QuoteChat.tsx "app/admin/projects/[id]/quote/page.tsx"
git commit -m "refactor: consolidate QuoteChat onto shared mention system, add realtime"
```

---

### Task 11: Full review pass

**Files:** none (review only — findings get fixed inline in the files above, no new files)

- [ ] **Step 1: Diff review**

Run `git diff main --stat` and `git diff main` to review the complete set of changes across all 10 tasks. Check specifically for:
- Any leftover unused imports/state in `app/admin/postprod/[id]/page.tsx`, `app/admin/preprod/[id]/page.tsx`, `app/admin/projects/[id]/page.tsx` after the Task 1/4/5 edits (an unused `TaskMessage` import, an unused `sendTaskMessage`/`getTaskMessages` import, etc.).
- That `flexWrap: 'wrap'` additions in Tasks 4 and 5 didn't break existing row layouts at narrow widths (check visually in the browser at ~1024px width).
- That migration 082's `notify_project_message()` replacement (Task 9) still contains the mention-split logic verbatim (compare against `081_message_mentions.sql:19-47`) — it should only add the trailing fallback block, nothing else should differ.
- That `Notification.tasks` typing change in Task 7 doesn't break any other file that reads `Notification.tasks` — search for other usages before finalizing.

- [ ] **Step 2: Final type-check and build**

```bash
npx tsc --noEmit
npm run build
```
Expected: both succeed with no errors.

- [ ] **Step 3: Commit any fixes found during review**

```bash
git add -A
git commit -m "fix: address review findings from task-chat-everywhere pass"
```

(Skip this step if review found nothing to fix.)
