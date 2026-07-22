# Board-kommentarer med @mentions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let team members pin a comment thread to a specific card on a board (`app/admin/boards`), reply to it, @mention teammates for notifications, and mark it resolved/reopened — internal team only, real-time.

**Architecture:** Two new tables (`board_comment_threads`, one per card; `board_comments`, the messages in it) plus a Postgres trigger that mirrors the existing `notify_task_message()` pattern to emit `board_comment_mention` / `board_comment_reply` notifications. On the frontend, comment state lives in a new React context (`boardCommentsContext`) fed by `BoardCanvas.tsx`'s existing realtime-subscription hook (`useBoardRealtime`, extended with two new callbacks). The comment thread itself renders via `@xyflow/react`'s built-in `NodeToolbar` — a first-class React Flow primitive for anchoring a floating panel to a specific node that automatically follows pan/zoom — so no manual screen-space math or new node type is needed. `CardShell.tsx` (already wrapping all 9 non-column card types) gets a small 💬 badge and the toolbar; nothing about drag/column/z-index logic changes because comments are not `board_cards` rows.

**Tech Stack:** Next.js App Router, Supabase (Postgres + Realtime + RLS), `@xyflow/react` v12 (`NodeToolbar`), TypeScript, inline-style React (existing codebase convention).

## Global Constraints

- **No test runner exists in this repo** (no jest/vitest/playwright — verified via `package.json`). Verification is manual: `npm run lint`, `npm run build`, direct SQL checks, and browser checks. This matches every other feature in this codebase (see the `2026-07-01-chat-realtime-mentions.md` plan's identical constraint). Do not introduce a test framework.
- All UI copy is Norwegian (Bokmål), matching existing strings in `BoardCanvas.tsx`, `VarslerClient.tsx`, `ProjectChat.tsx`.
- Next migration number is `118` (last applied is `117_customer_contacts.sql`). Run with `npm run migrate:single supabase/migrations/118_board_comments.sql`.
- **Internal team only** — comments never appear on `/b/[token]` (the public share view). Every comment UI element in `CardShell.tsx` is gated on `!readOnly`, exactly like the existing drag handles in that same file.
- Comments attach to a **card** (`board_cards.id`), never a free canvas point. One thread per card (`board_comment_threads.card_id` is `UNIQUE`), created lazily on first comment.
- Mention parsing/rendering reuses `lib/mentions.ts` and `components/shared/MentionTextInput.tsx` as-is — do not fork or modify them.
- Follow `docs/superpowers/specs/2026-07-22-board-comments-design.md` for all product decisions; this plan implements it task-by-task.

---

### Task 1: Migration — tables, RLS, realtime, notification trigger

**Files:**
- Create: `supabase/migrations/118_board_comments.sql`

**Interfaces:**
- Produces: tables `board_comment_threads`, `board_comments`; columns `notifications.board_id`, `notifications.board_card_id`; notification types `board_comment_mention`, `board_comment_reply`; trigger `trg_notify_board_comment`.

- [ ] **Step 1: Write the migration file**

```sql
-- 118_board_comments.sql
-- Kommentartråder festet til board_cards, med @mentions og varsler.
-- Spec: docs/superpowers/specs/2026-07-22-board-comments-design.md

CREATE TABLE IF NOT EXISTS board_comment_threads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id    UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  card_id     UUID NOT NULL REFERENCES board_cards(id) ON DELETE CASCADE,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved    BOOLEAN NOT NULL DEFAULT false,
  resolved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Én tråd per kort — legges lazy ved første kommentar (se postBoardComment)
CREATE UNIQUE INDEX IF NOT EXISTS idx_board_comment_threads_card ON board_comment_threads(card_id);
CREATE INDEX IF NOT EXISTS idx_board_comment_threads_board ON board_comment_threads(board_id);

CREATE TABLE IF NOT EXISTS board_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  UUID NOT NULL REFERENCES board_comment_threads(id) ON DELETE CASCADE,
  board_id   UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  author_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  content    TEXT NOT NULL,
  mentions   UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_board_comments_thread ON board_comments(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_board_comments_board ON board_comments(board_id);

-- RLS: samme "authenticated full access"-mønster som boards/board_cards/board_edges (098_boards.sql)
ALTER TABLE board_comment_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_comments        ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'board_comment_threads' AND policyname = 'authenticated full access board_comment_threads') THEN
    EXECUTE 'CREATE POLICY "authenticated full access board_comment_threads" ON board_comment_threads FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'board_comments' AND policyname = 'authenticated full access board_comments') THEN
    EXECUTE 'CREATE POLICY "authenticated full access board_comments" ON board_comments FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END$$;

-- Realtime (mønster: 098_boards.sql)
ALTER TABLE board_comment_threads REPLICA IDENTITY FULL;
ALTER TABLE board_comments        REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'board_comment_threads') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE board_comment_threads;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'board_comments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE board_comments;
  END IF;
END$$;

-- Varsler: nye kolonner + typer
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS board_id UUID REFERENCES boards(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS board_card_id UUID REFERENCES board_cards(id) ON DELETE CASCADE;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'project_message', 'task_message', 'selection_submitted',
    'task_assigned', 'lead_assigned', 'quote_assigned', 'invoice_assigned',
    'quote_mention', 'project_message_mention', 'task_message_mention',
    'quote_message', 'feedback_reply', 'contract_signed',
    'project_message_reaction', 'task_message_reaction', 'quote_message_reaction',
    'resale_assigned', 'direct_message',
    'board_comment_mention', 'board_comment_reply'
  ));

-- Trigger: mentions + varsel til tråd-starter ved svar (speiler notify_task_message, 056_notifications.sql)
CREATE OR REPLACE FUNCTION notify_board_comment()
RETURNS TRIGGER AS $$
DECLARE
  rec       RECORD;
  preview   TEXT;
  thr       RECORD;
  proj_id   UUID;
  sndr_name TEXT;
BEGIN
  preview := left(NEW.content, 80);
  SELECT t.id, t.created_by, t.card_id, b.project_id
    INTO thr
    FROM board_comment_threads t
    JOIN boards b ON b.id = t.board_id
    WHERE t.id = NEW.thread_id;
  proj_id := thr.project_id;
  SELECT COALESCE(name, email, 'Ukjent') INTO sndr_name FROM profiles WHERE id = NEW.author_id;

  -- Mentions (uansett om personen også er tråd-starter)
  FOR rec IN
    SELECT DISTINCT m AS profile_id FROM unnest(NEW.mentions) AS m
    WHERE m != NEW.author_id
  LOOP
    INSERT INTO notifications (user_id, type, project_id, board_id, board_card_id, message_preview, sender_name)
    VALUES (rec.profile_id, 'board_comment_mention', proj_id, NEW.board_id, thr.card_id, preview, sndr_name);
  END LOOP;

  -- Tråd-starter, hvis ikke allerede varslet via mention over
  IF thr.created_by IS NOT NULL AND thr.created_by != NEW.author_id
     AND thr.created_by != ALL(NEW.mentions) THEN
    INSERT INTO notifications (user_id, type, project_id, board_id, board_card_id, message_preview, sender_name)
    VALUES (thr.created_by, 'board_comment_reply', proj_id, NEW.board_id, thr.card_id, preview, sndr_name);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_board_comment ON board_comments;
CREATE TRIGGER trg_notify_board_comment
AFTER INSERT ON board_comments
FOR EACH ROW EXECUTE FUNCTION notify_board_comment();
```

- [ ] **Step 2: Run the migration**

Run: `npm run migrate:single supabase/migrations/118_board_comments.sql`
Expected: `✨ Migration completed successfully!`

- [ ] **Step 3: Verify tables, columns and trigger exist**

Run `npm run migrate:show` or open the Supabase SQL editor and run:
```sql
SELECT table_name FROM information_schema.tables WHERE table_name IN ('board_comment_threads', 'board_comments');
SELECT column_name FROM information_schema.columns WHERE table_name = 'notifications' AND column_name IN ('board_id', 'board_card_id');
SELECT tgname FROM pg_trigger WHERE tgname = 'trg_notify_board_comment';
```
Expected: both tables listed, both columns present, trigger present.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/118_board_comments.sql
git commit -m "feat(db): add board comment threads/messages tables, RLS, realtime, notify trigger"
```

---

### Task 2: Types — row shapes and notification type

**Files:**
- Modify: `lib/types.ts` (after the `BoardEdge` type, ~line 691)
- Modify: `lib/actions/notifications.ts:7-22` (`Notification` type)

**Interfaces:**
- Produces: `BoardCommentThread`, `BoardComment` types in `lib/types.ts`; `Notification.type` including `'board_comment_mention' | 'board_comment_reply'`; `Notification.board_id: string | null`, `Notification.board_card_id: string | null`.
- Consumed by: Task 3 (`lib/actions/boardComments.ts`), Task 10 (`VarslerClient.tsx`).

- [ ] **Step 1: Add `BoardCommentThread` and `BoardComment` to `lib/types.ts`**

Insert directly after the closing `}` of `BoardEdge` (currently ending at line 691):

```typescript
export type BoardCommentThread = {
  id: string
  board_id: string
  card_id: string
  created_by: string | null
  resolved: boolean
  resolved_by: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export type BoardComment = {
  id: string
  thread_id: string
  board_id: string
  author_id: string | null
  content: string
  mentions: string[]
  created_at: string
}
```

- [ ] **Step 2: Update `Notification` type in `lib/actions/notifications.ts`**

Replace:

```typescript
export type Notification = {
  id: string
  type: 'project_message' | 'task_message' | 'selection_submitted' | 'task_assigned' | 'lead_assigned' | 'quote_assigned' | 'invoice_assigned' | 'quote_mention' | 'project_message_mention' | 'task_message_mention' | 'quote_message' | 'feedback_reply' | 'contract_signed' | 'project_message_reaction' | 'task_message_reaction' | 'quote_message_reaction' | 'resale_assigned' | 'direct_message'
  project_id: string | null
  task_id: string | null
  lead_id: string | null
  conversation_id: string | null
  message_id: string | null
  message_preview: string
  sender_name: string
  read: boolean
  created_at: string
  projects: { title: string } | null
  tasks: { title: string; pipeline_stage: PipelineStage | null } | null
  leads: { name: string; company: string | null } | null
}
```

with:

```typescript
export type Notification = {
  id: string
  type: 'project_message' | 'task_message' | 'selection_submitted' | 'task_assigned' | 'lead_assigned' | 'quote_assigned' | 'invoice_assigned' | 'quote_mention' | 'project_message_mention' | 'task_message_mention' | 'quote_message' | 'feedback_reply' | 'contract_signed' | 'project_message_reaction' | 'task_message_reaction' | 'quote_message_reaction' | 'resale_assigned' | 'direct_message' | 'board_comment_mention' | 'board_comment_reply'
  project_id: string | null
  task_id: string | null
  lead_id: string | null
  conversation_id: string | null
  message_id: string | null
  board_id: string | null
  board_card_id: string | null
  message_preview: string
  sender_name: string
  read: boolean
  created_at: string
  projects: { title: string } | null
  tasks: { title: string; pipeline_stage: PipelineStage | null } | null
  leads: { name: string; company: string | null } | null
}
```

- [ ] **Step 3: Verify with typecheck**

Run: `npm run lint`
Expected: No new errors. (`getNotifications()`'s `.select('*, ...)` already returns all columns, so the two new fields populate automatically — no query changes needed.)

- [ ] **Step 4: Commit**

```bash
git add lib/types.ts lib/actions/notifications.ts
git commit -m "feat(types): add board comment row types and notification fields"
```

---

### Task 3: Server actions — `lib/actions/boardComments.ts` + wire into `getBoardData`

**Files:**
- Create: `lib/actions/boardComments.ts`
- Modify: `lib/actions/boards.ts:9-17` (`BoardData` type), `lib/actions/boards.ts:162-189` (`getBoardData`)

**Interfaces:**
- Consumes: `BoardCommentThread`, `BoardComment` (Task 2).
- Produces: `BoardCommentsByCard = Record<string, { thread: BoardCommentThread; comments: BoardComment[] }>`; `getBoardComments(boardId)`, `postBoardComment(cardId, boardId, content, mentions)`, `toggleThreadResolved(threadId, resolved)`, `deleteBoardComment(id)`; `BoardData.comments?: BoardCommentsByCard`.
- Consumed by: Task 8 (`BoardCanvas.tsx`), Task 4/6/7 (context + UI, via Task 8's wiring).

- [ ] **Step 1: Write `lib/actions/boardComments.ts`**

```typescript
'use server'

import { createClient } from '@/lib/supabase-server'
import type { BoardComment, BoardCommentThread } from '@/lib/types'

export type BoardCommentsByCard = Record<string, { thread: BoardCommentThread; comments: BoardComment[] }>

export async function getBoardComments(boardId: string): Promise<BoardCommentsByCard> {
  try {
    const supabase = await createClient()
    const { data: threads } = await supabase
      .from('board_comment_threads').select('*').eq('board_id', boardId)
    if (!threads || threads.length === 0) return {}

    const threadIds = threads.map(t => t.id)
    const { data: comments } = await supabase
      .from('board_comments').select('*').in('thread_id', threadIds).order('created_at')

    const result: BoardCommentsByCard = {}
    for (const t of threads as BoardCommentThread[]) {
      result[t.card_id] = {
        thread: t,
        comments: ((comments ?? []) as BoardComment[]).filter(c => c.thread_id === t.id),
      }
    }
    return result
  } catch (err) {
    console.error('getBoardComments:', err)
    return {}
  }
}

// Oppretter tråden lazy ved første kommentar på kortet (unik indeks på card_id
// forhindrer duplikat ved samtidig førstegangs-kommentering — samme race-mønster
// som getOrCreateRootBoard i boards.ts).
export async function postBoardComment(
  cardId: string, boardId: string, content: string, mentions: string[]
): Promise<{ thread: BoardCommentThread; comment: BoardComment } | null> {
  try {
    const trimmed = content.trim()
    if (!trimmed) return null
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    let thread: BoardCommentThread | null = null
    const { data: existing } = await supabase
      .from('board_comment_threads').select('*').eq('card_id', cardId).maybeSingle()
    if (existing) {
      thread = existing as BoardCommentThread
    } else {
      const { data: created, error } = await supabase
        .from('board_comment_threads')
        .insert({ board_id: boardId, card_id: cardId, created_by: user.id })
        .select('*').single()
      if (error || !created) {
        // Race mot unik indeks: hent tråden som vant
        const { data: retry } = await supabase
          .from('board_comment_threads').select('*').eq('card_id', cardId).maybeSingle()
        if (!retry) { console.error('postBoardComment (thread):', error); return null }
        thread = retry as BoardCommentThread
      } else {
        thread = created as BoardCommentThread
      }
    }

    const { data: comment, error: commentError } = await supabase
      .from('board_comments')
      .insert({ thread_id: thread.id, board_id: boardId, author_id: user.id, content: trimmed, mentions })
      .select('*').single()
    if (commentError || !comment) { console.error('postBoardComment (comment):', commentError); return null }

    return { thread, comment: comment as BoardComment }
  } catch (err) {
    console.error('postBoardComment:', err)
    return null
  }
}

export async function toggleThreadResolved(threadId: string, resolved: boolean): Promise<BoardCommentThread | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const patch = resolved
      ? { resolved: true, resolved_by: user?.id ?? null, resolved_at: new Date().toISOString(), updated_at: new Date().toISOString() }
      : { resolved: false, resolved_by: null, resolved_at: null, updated_at: new Date().toISOString() }
    const { data, error } = await supabase
      .from('board_comment_threads').update(patch).eq('id', threadId).select('*').single()
    if (error || !data) { console.error('toggleThreadResolved:', error); return null }
    return data as BoardCommentThread
  } catch (err) {
    console.error('toggleThreadResolved:', err)
    return null
  }
}

export async function deleteBoardComment(id: string): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false
    const { data: existing } = await supabase.from('board_comments').select('author_id').eq('id', id).single()
    if (!existing || existing.author_id !== user.id) return false
    const { error } = await supabase.from('board_comments').delete().eq('id', id)
    return !error
  } catch (err) {
    console.error('deleteBoardComment:', err)
    return false
  }
}
```

- [ ] **Step 2: Add `comments` to `BoardData` and populate it in `getBoardData`**

In `lib/actions/boards.ts`, replace the `BoardData` type (lines 9-17):

```typescript
export type BoardData = {
  board: Board
  cards: BoardCard[]
  edges: BoardEdge[]
  breadcrumbs: { id: string; title: string }[]
  projectId: string
  projectTitle: string
  childMeta: Record<string, ChildBoardMeta>
  // Fraværende (undefined) for delt/offentlig board-visning (getSharedBoard) —
  // kommentarer er internt-only (se 2026-07-22-board-comments-design.md).
  comments?: BoardCommentsByCard
}
```

Add the import at the top of `lib/actions/boards.ts` (alongside the existing type-only imports):

```typescript
import { getBoardComments, type BoardCommentsByCard } from '@/lib/actions/boardComments'
```

Replace the body of `getBoardData` (lines 162-189):

```typescript
export async function getBoardData(boardId: string): Promise<BoardData | null> {
  try {
    const supabase = await createClient()
    const { data: board } = await supabase.from('boards').select('*').eq('id', boardId).single()
    if (!board) return null

    const [{ data: cards }, { data: edges }, { data: project }, comments] = await Promise.all([
      supabase.from('board_cards').select('*').eq('board_id', boardId).order('z_index'),
      supabase.from('board_edges').select('*').eq('board_id', boardId),
      supabase.from('projects').select('id, title').eq('id', board.project_id).single(),
      getBoardComments(boardId),
    ])
    const breadcrumbs = await buildBreadcrumbs(supabase, board)
    const childMeta = await loadChildMeta(supabase, (cards ?? []) as BoardCard[])

    return {
      board: board as Board,
      cards: (cards ?? []) as BoardCard[],
      edges: (edges ?? []) as BoardEdge[],
      breadcrumbs,
      projectId: board.project_id,
      projectTitle: project?.title ?? '',
      childMeta,
      comments,
    }
  } catch (err) {
    console.error('getBoardData:', err)
    return null
  }
}
```

- [ ] **Step 3: Verify with typecheck**

Run: `npm run lint`
Expected: No errors. `SharedBoardData` (`Omit<BoardData, 'projectId' | 'projectTitle'>`) still compiles because `comments` is optional — `SharedBoardClient.tsx`'s existing `{ ...data, projectId: '', projectTitle: '' }` spread needs no changes.

- [ ] **Step 4: Manual verification**

With `npm run dev` running, open any existing board in the admin (`/admin/boards/<id>`) — it should load exactly as before (no visible change yet, this task is backend-only). Confirm no server errors in the terminal.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/boardComments.ts lib/actions/boards.ts
git commit -m "feat: add board comment server actions, wire into getBoardData"
```

---

### Task 4: Comments context — `boardCommentsContext.tsx`

**Files:**
- Create: `components/boards/boardCommentsContext.tsx`

**Interfaces:**
- Consumes: `BoardCommentsByCard`, `BoardComment`, `BoardCommentThread` (Tasks 2-3).
- Produces: `BoardCommentsProvider`, `useBoardComments()` returning `{ threadsByCard, openCardId, openThread, closeThread, postComment, toggleResolved }`.
- Consumed by: Task 6 (`CommentThread.tsx`), Task 7 (`CardShell.tsx`), Task 8 (`BoardCanvas.tsx`, which supplies the real implementation via the Provider's `value`).

- [ ] **Step 1: Write `components/boards/boardCommentsContext.tsx`**

```tsx
'use client'

import { createContext, useContext } from 'react'
import type { BoardCommentsByCard } from '@/lib/actions/boardComments'

type BoardCommentsApi = {
  threadsByCard: BoardCommentsByCard
  openCardId: string | null
  openThread: (cardId: string) => void
  closeThread: () => void
  postComment: (cardId: string, content: string, mentions: string[]) => Promise<void>
  toggleResolved: (cardId: string) => Promise<void>
}

const BoardCommentsContext = createContext<BoardCommentsApi>({
  threadsByCard: {},
  openCardId: null,
  openThread: () => {},
  closeThread: () => {},
  postComment: async () => {},
  toggleResolved: async () => {},
})

export const BoardCommentsProvider = BoardCommentsContext.Provider
export const useBoardComments = () => useContext(BoardCommentsContext)
```

- [ ] **Step 2: Verify with typecheck**

Run: `npm run lint`
Expected: No errors (file has no consumers yet, which is fine — it's not dead-code-eliminated by lint since it's an exported module).

- [ ] **Step 3: Commit**

```bash
git add components/boards/boardCommentsContext.tsx
git commit -m "feat: add boardCommentsContext"
```

---

### Task 5: Extend `useBoardRealtime` with comment table subscriptions

**Files:**
- Modify: `hooks/useBoardRealtime.ts`

**Interfaces:**
- Consumes: `BoardCommentThread`, `BoardComment` (Task 2).
- Produces: `useBoardRealtime` gains optional `onCommentThread` / `onComment` callbacks in its `opts` parameter; existing callers (which don't pass them) are unaffected.
- Consumed by: Task 8 (`BoardCanvas.tsx`).

- [ ] **Step 1: Replace `hooks/useBoardRealtime.ts` in full**

```typescript
'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase-client'
import type { BoardCard, BoardComment, BoardCommentThread, BoardEdge } from '@/lib/types'

type Evt = 'INSERT' | 'UPDATE' | 'DELETE'

// Lytter på postgres_changes for board_cards/board_edges (migrasjon 098) og
// board_comment_threads/board_comments (migrasjon 118), og videresender
// ikke-lokale endringer til BoardCanvas. isLocalOp filtrerer bort vårt eget
// echo (se localOps/markLocalOp i BoardCanvas.tsx). Kommentar-callbacks er
// valgfrie — delte/read-only visninger (som ikke bruker kommentarer) lar dem stå.
export function useBoardRealtime(boardId: string, opts: {
  enabled: boolean
  isLocalOp: (rowId: string) => boolean
  onCard: (evt: Evt, row: Partial<BoardCard> & { id: string }) => void
  onEdge: (evt: Evt, row: Partial<BoardEdge> & { id: string }) => void
  onCommentThread?: (evt: Evt, row: Partial<BoardCommentThread> & { id: string }) => void
  onComment?: (evt: Evt, row: Partial<BoardComment> & { id: string }) => void
}) {
  const { enabled, isLocalOp, onCard, onEdge, onCommentThread, onComment } = opts
  useEffect(() => {
    if (!enabled) return
    let channel = supabase
      .channel(`board-${boardId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'board_cards', filter: `board_id=eq.${boardId}` },
        payload => {
          const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Partial<BoardCard> & { id: string }
          if (!row?.id || isLocalOp(row.id)) return
          onCard(payload.eventType as Evt, row)
        })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'board_edges', filter: `board_id=eq.${boardId}` },
        payload => {
          const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Partial<BoardEdge> & { id: string }
          if (!row?.id || isLocalOp(row.id)) return
          onEdge(payload.eventType as Evt, row)
        })

    if (onCommentThread) {
      channel = channel.on('postgres_changes',
        { event: '*', schema: 'public', table: 'board_comment_threads', filter: `board_id=eq.${boardId}` },
        payload => {
          const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Partial<BoardCommentThread> & { id: string }
          if (!row?.id || isLocalOp(row.id)) return
          onCommentThread(payload.eventType as Evt, row)
        })
    }
    if (onComment) {
      channel = channel.on('postgres_changes',
        { event: '*', schema: 'public', table: 'board_comments', filter: `board_id=eq.${boardId}` },
        payload => {
          const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as Partial<BoardComment> & { id: string }
          if (!row?.id || isLocalOp(row.id)) return
          onComment(payload.eventType as Evt, row)
        })
    }

    channel.subscribe()
    return () => { supabase.removeChannel(channel) }
    // onCard/onEdge/onCommentThread/onComment er stabile via useCallback i BoardCanvas
  }, [boardId, enabled, isLocalOp, onCard, onEdge, onCommentThread, onComment])
}
```

- [ ] **Step 2: Verify with typecheck**

Run: `npm run lint`
Expected: No errors. The existing call site in `BoardCanvas.tsx` (`useBoardRealtime(boardId, { enabled: !readOnly, isLocalOp, onCard: onRemoteCard, onEdge: onRemoteEdge })`) still compiles unchanged since the two new callbacks are optional.

- [ ] **Step 3: Commit**

```bash
git add hooks/useBoardRealtime.ts
git commit -m "feat: extend useBoardRealtime with comment table subscriptions"
```

---

### Task 6: `CommentThread.tsx` — the popover panel

**Files:**
- Create: `components/boards/CommentThread.tsx`

**Interfaces:**
- Consumes: `useBoardUi()` (`components/boards/boardContext.tsx`), `useBoardComments()` (Task 4), `getAllProfiles()` (`lib/actions/pipeline.ts`), `extractMentionIds`/`splitMentionSegments`/`MentionableProfile` (`lib/mentions.ts`), `MentionTextInput` (`components/shared/MentionTextInput.tsx`).
- Produces: `CommentThread` component with props `{ cardId: string; onClose: () => void }`.
- Consumed by: Task 7 (`CardShell.tsx`).

- [ ] **Step 1: Write `components/boards/CommentThread.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { getAllProfiles } from '@/lib/actions/pipeline'
import { extractMentionIds, splitMentionSegments, type MentionableProfile } from '@/lib/mentions'
import { MentionTextInput } from '@/components/shared/MentionTextInput'
import { useBoardUi } from './boardContext'
import { useBoardComments } from './boardCommentsContext'

export default function CommentThread({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  const { palette: P } = useBoardUi()
  const { threadsByCard, postComment, toggleResolved } = useBoardComments()
  const [profiles, setProfiles] = useState<MentionableProfile[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => { getAllProfiles().then(setProfiles) }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const entry = threadsByCard[cardId]
  const comments = entry?.comments ?? []
  const resolved = entry?.thread.resolved ?? false

  async function send() {
    if (!draft.trim() || sending) return
    setSending(true)
    const mentions = extractMentionIds(draft, profiles)
    await postComment(cardId, draft, mentions)
    setDraft('')
    setSending(false)
  }

  const nameFor = (authorId: string | null) => profiles.find(p => p.id === authorId)?.name || 'Ukjent'

  return (
    <div
      className="nodrag nopan"
      onClick={e => e.stopPropagation()}
      style={{
        width: 280, maxHeight: 360, display: 'flex', flexDirection: 'column',
        background: P.surface, border: `1px solid ${P.border}`, borderRadius: 10,
        boxShadow: '0 12px 32px rgba(0,0,0,0.5)', fontFamily: 'var(--font-dm-sans)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderBottom: `1px solid ${P.border}` }}>
        <button
          onClick={() => toggleResolved(cardId)}
          disabled={comments.length === 0}
          style={{
            fontSize: '0.68rem', fontWeight: 600, padding: '4px 8px', borderRadius: 6,
            background: resolved ? 'transparent' : `${P.accent}22`,
            color: resolved ? P.text2 : P.accent,
            border: `1px solid ${resolved ? P.border : P.accent}`,
            cursor: comments.length === 0 ? 'default' : 'pointer',
            opacity: comments.length === 0 ? 0.5 : 1,
          }}
        >
          {resolved ? 'Gjenåpne' : 'Merk som løst'}
        </button>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: P.text2, cursor: 'pointer', fontSize: '0.9rem', lineHeight: 1 }}>✕</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {comments.length === 0 && (
          <p style={{ fontSize: '0.72rem', color: P.text2, textAlign: 'center', margin: '12px 0' }}>Ingen kommentarer ennå</p>
        )}
        {comments.map(c => (
          <div key={c.id}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginBottom: 2 }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 600, color: P.text }}>{nameFor(c.author_id)}</span>
              <span style={{ fontSize: '0.6rem', color: P.text2 }}>
                {new Date(c.created_at).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p style={{ fontSize: '0.75rem', color: P.text, lineHeight: 1.5, margin: 0, wordBreak: 'break-word' }}>
              {splitMentionSegments(c.content, c.mentions, profiles).map((seg, i) =>
                seg.isMention
                  ? <span key={i} style={{ color: P.accent, fontWeight: 600 }}>{seg.text}</span>
                  : <span key={i}>{seg.text}</span>
              )}
            </p>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderTop: `1px solid ${P.border}` }}>
        <MentionTextInput
          value={draft}
          onChange={setDraft}
          onEnter={send}
          profiles={profiles}
          as="textarea"
          rows={1}
          placeholder="Skriv en kommentar..."
          disabled={sending}
          style={{
            flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: P.text,
            background: P.surface2, border: `1px solid ${P.border}`, borderRadius: 6,
            padding: '6px 8px', outline: 'none', resize: 'none', lineHeight: 1.4, width: '100%',
          }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify with typecheck**

Run: `npm run lint`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add components/boards/CommentThread.tsx
git commit -m "feat: add CommentThread popover panel"
```

---

### Task 7: `CardShell.tsx` — comment badge + toolbar, wired into all 9 card types

**Files:**
- Modify: `components/boards/nodes/CardShell.tsx`
- Modify: `components/boards/nodes/NoteNode.tsx:55`, `ImageNode.tsx:69`, `VideoNode.tsx:9,13`, `LinkNode.tsx:10,21`, `ColorNode.tsx:32`, `TodoNode.tsx:37`, `BoardNode.tsx:32`, `ScheduleNode.tsx:67`, `StorylineNode.tsx:32`

**Interfaces:**
- Consumes: `useBoardComments()` (Task 4), `CommentThread` (Task 6), `NodeToolbar`/`Position` from `@xyflow/react`.
- Produces: `CardShell` requires a new `cardId: string` prop. All callers updated in this same task (required prop — the codebase would not typecheck otherwise).

- [ ] **Step 1: Replace `components/boards/nodes/CardShell.tsx` in full**

```tsx
'use client'

import { useState } from 'react'
import { Handle, NodeToolbar, Position } from '@xyflow/react'
import { useBoardUi } from './boardContext'
import { useBoardComments } from '../boardCommentsContext'
import CommentThread from '../CommentThread'

export default function CardShell({ cardId, selected, dropActive, children, padding = 12 }: {
  cardId: string
  selected: boolean
  // Vises som mottaksklar under drag når et kort svever over dette kortet (kun board/storyline).
  dropActive?: boolean
  children: React.ReactNode
  padding?: number
}) {
  const { palette: P, readOnly } = useBoardUi()
  const { threadsByCard, openCardId, openThread, closeThread } = useBoardComments()
  const [hovered, setHovered] = useState(false)

  const entry = threadsByCard[cardId]
  const commentCount = entry?.comments.length ?? 0
  const resolved = entry?.thread.resolved ?? false
  const isOpen = openCardId === cardId

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%',
        position: 'relative',
        background: P.surface,
        border: `1px solid ${dropActive || selected ? P.accent : P.border}`,
        borderRadius: 8,
        padding,
        fontFamily: 'var(--font-dm-sans)',
        color: P.text,
        boxShadow: dropActive
          ? `0 0 0 3px ${P.accent}55, 0 10px 26px rgba(0,0,0,0.45)`
          : selected ? `0 0 0 1px ${P.accent}` : '0 2px 10px rgba(0,0,0,0.3)',
        transform: dropActive ? 'scale(1.06)' : 'scale(1)',
        transition: 'transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease',
      }}
    >
      {!readOnly && (
        <>
          <Handle type="target" position={Position.Left} style={{ width: 8, height: 8, background: P.border, border: 'none' }} />
          <Handle type="source" position={Position.Right} style={{ width: 8, height: 8, background: P.accent, border: 'none' }} />
        </>
      )}
      {!readOnly && (commentCount > 0 || hovered) && (
        <button
          className="nodrag"
          onClick={e => { e.stopPropagation(); isOpen ? closeThread() : openThread(cardId) }}
          title={commentCount > 0 ? `${commentCount} kommentar${commentCount === 1 ? '' : 'er'}` : 'Kommenter'}
          style={{
            position: 'absolute', top: -10, right: -10, zIndex: 5,
            display: 'flex', alignItems: 'center', gap: 3,
            background: isOpen ? P.accent : P.surface2,
            color: resolved && commentCount > 0 ? P.text2 : (isOpen ? '#fff' : P.text),
            border: `1px solid ${P.border}`, borderRadius: 12,
            padding: '2px 7px', fontSize: '0.65rem', fontWeight: 600, cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
          }}
        >
          💬{commentCount > 0 ? ` ${commentCount}` : ''}
        </button>
      )}
      {!readOnly && (
        <NodeToolbar nodeId={cardId} isVisible={isOpen} position={Position.Right} align="start" offset={14}>
          <CommentThread cardId={cardId} onClose={closeThread} />
        </NodeToolbar>
      )}
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Pass `cardId` at every `<CardShell>` call site**

In each file below, add `cardId={id}` to the existing `<CardShell ...>` opening tag. Where the component doesn't currently destructure `id` from its `NodeProps<CardNode>` parameter, add it.

`components/boards/nodes/NoteNode.tsx:55` — replace:
```tsx
    <CardShell selected={!!selected}>
```
with:
```tsx
    <CardShell cardId={id} selected={!!selected}>
```
(`id` is already destructured on line 24.)

`components/boards/nodes/ImageNode.tsx:69` — replace:
```tsx
      <CardShell selected={!!selected} padding={0}>
```
with:
```tsx
      <CardShell cardId={id} selected={!!selected} padding={0}>
```
(`id` is already destructured on line 13.)

`components/boards/nodes/VideoNode.tsx` — this component does not currently destructure `id`. Replace line 9:
```tsx
export default function VideoNode({ data, selected }: NodeProps<CardNode>) {
```
with:
```tsx
export default function VideoNode({ id, data, selected }: NodeProps<CardNode>) {
```
Then replace line 13:
```tsx
    <CardShell selected={!!selected} padding={6}>
```
with:
```tsx
    <CardShell cardId={id} selected={!!selected} padding={6}>
```

`components/boards/nodes/LinkNode.tsx` — this component does not currently destructure `id`. Replace line 10:
```tsx
export default function LinkNode({ data, selected }: NodeProps<CardNode>) {
```
with:
```tsx
export default function LinkNode({ id, data, selected }: NodeProps<CardNode>) {
```
Then replace line 21:
```tsx
    <CardShell selected={!!selected} padding={0}>
```
with:
```tsx
    <CardShell cardId={id} selected={!!selected} padding={0}>
```

`components/boards/nodes/ColorNode.tsx:32` — replace:
```tsx
    <CardShell selected={!!selected} padding={6}>
```
with:
```tsx
    <CardShell cardId={id} selected={!!selected} padding={6}>
```
(`id` is already destructured on line 11.)

`components/boards/nodes/TodoNode.tsx:37` — replace:
```tsx
    <CardShell selected={!!selected}>
```
with:
```tsx
    <CardShell cardId={id} selected={!!selected}>
```
(`id` is already destructured on line 11.)

`components/boards/nodes/BoardNode.tsx:32` — replace:
```tsx
    <CardShell selected={!!selected} dropActive={!!data.dropTarget}>
```
with:
```tsx
    <CardShell cardId={id} selected={!!selected} dropActive={!!data.dropTarget}>
```
(`id` is already destructured on line 12.)

`components/boards/nodes/ScheduleNode.tsx:67` — replace:
```tsx
      <CardShell selected={!!selected}>
```
with:
```tsx
      <CardShell cardId={id} selected={!!selected}>
```
(`id` is already destructured on line 21.)

`components/boards/nodes/StorylineNode.tsx:32` — replace:
```tsx
    <CardShell selected={!!selected} dropActive={!!data.dropTarget}>
```
with:
```tsx
    <CardShell cardId={id} selected={!!selected} dropActive={!!data.dropTarget}>
```
(`id` is already destructured on line 12.)

- [ ] **Step 3: Verify with typecheck and build**

Run: `npm run lint && npm run build`
Expected: Both succeed — this is the step that proves every `CardShell` call site was updated (a missing `cardId` prop is a TypeScript error, not a silent gap).

- [ ] **Step 4: Commit**

```bash
git add components/boards/nodes/CardShell.tsx components/boards/nodes/NoteNode.tsx components/boards/nodes/ImageNode.tsx components/boards/nodes/VideoNode.tsx components/boards/nodes/LinkNode.tsx components/boards/nodes/ColorNode.tsx components/boards/nodes/TodoNode.tsx components/boards/nodes/BoardNode.tsx components/boards/nodes/ScheduleNode.tsx components/boards/nodes/StorylineNode.tsx
git commit -m "feat: add comment badge + toolbar to CardShell, wire cardId through all card types"
```

---

### Task 8: `BoardCanvas.tsx` — provider, state, realtime, focus-from-notification

**Files:**
- Modify: `components/boards/BoardCanvas.tsx`

**Interfaces:**
- Consumes: `BoardCommentsProvider` (Task 4), `postBoardComment`/`toggleThreadResolved` (Task 3), extended `useBoardRealtime` (Task 5).
- Produces: `BoardCanvas` gains an optional `focusCardId?: string` prop.
- Consumed by: Task 9 (`BoardPageClient.tsx`).

- [ ] **Step 1: Add imports**

At the top of `components/boards/BoardCanvas.tsx`, add to the existing `@/lib/actions/boards` import line and add two new import lines. Replace:

```typescript
import {
  createBoardCard, createSubBoard, createStorylineBoard, addStorylineCard, addStorylineRow, widenStorylineGrid, createBoardEdge, deleteBoardCards, deleteBoardEdges, saveCardPositions, fetchLinkMetadata, updateCardContent, updateBoardEdgeLabel, updateBoardEdgeEndpoints, moveCardToBoard,
  type BoardData, type CardPositionPatch,
} from '@/lib/actions/boards'
import { BoardUiProvider, ADMIN_BOARD_PALETTE, type BoardPalette } from './boardContext'
```

with:

```typescript
import {
  createBoardCard, createSubBoard, createStorylineBoard, addStorylineCard, addStorylineRow, widenStorylineGrid, createBoardEdge, deleteBoardCards, deleteBoardEdges, saveCardPositions, fetchLinkMetadata, updateCardContent, updateBoardEdgeLabel, updateBoardEdgeEndpoints, moveCardToBoard,
  type BoardData, type CardPositionPatch,
} from '@/lib/actions/boards'
import { postBoardComment, toggleThreadResolved, type BoardCommentsByCard } from '@/lib/actions/boardComments'
import type { BoardComment, BoardCommentThread } from '@/lib/types'
import { BoardUiProvider, ADMIN_BOARD_PALETTE, type BoardPalette } from './boardContext'
import { BoardCommentsProvider } from './boardCommentsContext'
```

- [ ] **Step 2: Add `focusCardId` to `Props`**

Replace:

```typescript
type Props = {
  boardId: string
  initial: BoardData
  readOnly?: boolean
  palette?: BoardPalette
  onOpenBoard: (childBoardId: string) => void
}
```

with:

```typescript
type Props = {
  boardId: string
  initial: BoardData
  readOnly?: boolean
  palette?: BoardPalette
  onOpenBoard: (childBoardId: string) => void
  // Kort å panorere til + åpne kommentartråden for automatisk ved mount —
  // satt fra ?comment=<cardId> når man klikker et boardkommentar-varsel.
  focusCardId?: string
}
```

- [ ] **Step 3: Destructure `focusCardId` in `Canvas` and add comment state**

Replace:

```typescript
function Canvas({ boardId, initial, readOnly = false, palette = ADMIN_BOARD_PALETTE, onOpenBoard }: Props) {
  const rf = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState<CardNode>(cardsToNodes(initial.cards, initial.childMeta))
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(edgesToFlow(initial.edges))
  const [pendingType, setPendingType] = useState<BoardCardType | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
```

with:

```typescript
function Canvas({ boardId, initial, readOnly = false, palette = ADMIN_BOARD_PALETTE, onOpenBoard, focusCardId }: Props) {
  const rf = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState<CardNode>(cardsToNodes(initial.cards, initial.childMeta))
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(edgesToFlow(initial.edges))
  const [pendingType, setPendingType] = useState<BoardCardType | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [threadsByCard, setThreadsByCard] = useState<BoardCommentsByCard>(initial.comments ?? {})
  const [openCardId, setOpenCardId] = useState<string | null>(null)
```

- [ ] **Step 4: Add comment handlers**

Add this block directly after the existing `markLocalOp`/`isLocalOp` declarations (right after the `isLocalOp` `useCallback`, before `const maxZ = ...`):

```typescript
  const openThread = useCallback((cardId: string) => setOpenCardId(cardId), [])
  const closeThread = useCallback(() => setOpenCardId(null), [])

  const postComment = useCallback(async (cardId: string, content: string, mentions: string[]) => {
    const res = await postBoardComment(cardId, boardId, content, mentions)
    if (!res) { setSaveError(SAVE_ERROR_MSG); return }
    markLocalOp(res.thread.id)
    markLocalOp(res.comment.id)
    setThreadsByCard(prev => {
      const existing = prev[cardId]
      return { ...prev, [cardId]: { thread: res.thread, comments: [...(existing?.comments ?? []), res.comment] } }
    })
  }, [boardId, markLocalOp])

  const toggleResolved = useCallback(async (cardId: string) => {
    const entry = threadsByCard[cardId]
    if (!entry) return
    const updated = await toggleThreadResolved(entry.thread.id, !entry.thread.resolved)
    if (!updated) { setSaveError(SAVE_ERROR_MSG); return }
    markLocalOp(updated.id)
    setThreadsByCard(prev => ({ ...prev, [cardId]: { ...prev[cardId], thread: updated } }))
  }, [threadsByCard, markLocalOp])

  // Realtime: reflekter kommentartråd-/meldingsendringer fra andre klienter.
  // isLocalOp filtrerer bort vårt eget echo (samme mønster som onRemoteCard/onRemoteEdge).
  const onRemoteCommentThread = useCallback((evt: 'INSERT' | 'UPDATE' | 'DELETE', row: Partial<BoardCommentThread> & { id: string }) => {
    setThreadsByCard(prev => {
      const cardId = row.card_id ?? Object.keys(prev).find(k => prev[k].thread.id === row.id)
      if (!cardId) return prev
      if (evt === 'DELETE') { const { [cardId]: _removed, ...rest } = prev; return rest }
      const existing = prev[cardId]
      return { ...prev, [cardId]: { thread: row as BoardCommentThread, comments: existing?.comments ?? [] } }
    })
  }, [])

  const onRemoteComment = useCallback((evt: 'INSERT' | 'UPDATE' | 'DELETE', row: Partial<BoardComment> & { id: string }) => {
    setThreadsByCard(prev => {
      const cardId = Object.keys(prev).find(k => prev[k].thread.id === row.thread_id)
      if (!cardId) return prev
      const entry = prev[cardId]
      if (evt === 'DELETE') {
        return { ...prev, [cardId]: { ...entry, comments: entry.comments.filter(c => c.id !== row.id) } }
      }
      const exists = entry.comments.some(c => c.id === row.id)
      const comments = exists
        ? entry.comments.map(c => c.id === row.id ? row as BoardComment : c)
        : [...entry.comments, row as BoardComment]
      return { ...prev, [cardId]: { ...entry, comments } }
    })
  }, [])
```

- [ ] **Step 5: Wire the extended realtime hook**

Replace:

```typescript
  useBoardRealtime(boardId, { enabled: !readOnly, isLocalOp, onCard: onRemoteCard, onEdge: onRemoteEdge })
```

with:

```typescript
  useBoardRealtime(boardId, {
    enabled: !readOnly, isLocalOp, onCard: onRemoteCard, onEdge: onRemoteEdge,
    onCommentThread: onRemoteCommentThread, onComment: onRemoteComment,
  })
```

- [ ] **Step 6: Close the open thread when clicking the empty canvas**

In `onPaneClick`, add a line at the very start of the callback (before the `pendingType`/`readOnly` early return) so clicking empty canvas closes any open comment thread:

Replace:

```typescript
  const onPaneClick = useCallback(async (event: React.MouseEvent) => {
    if (!pendingType || readOnly) return
```

with:

```typescript
  const onPaneClick = useCallback(async (event: React.MouseEvent) => {
    closeThread()
    if (!pendingType || readOnly) return
```

Add `closeThread` to `onPaneClick`'s dependency array (append it to the existing list ending in `maxZ`).

- [ ] **Step 7: Focus + auto-open a card from a notification deep-link**

Add this `useEffect` directly after the existing "Realtime" `useBoardRealtime` call:

```typescript
  // Deep-link fra et boardkommentar-varsel (?comment=<cardId>, se BoardPageClient) —
  // panorer til kortet og åpne tråden automatisk. Kjører kun én gang per mount.
  useEffect(() => {
    if (!focusCardId) return
    if (!nodes.some(n => n.id === focusCardId)) return
    rf.fitView({ nodes: [{ id: focusCardId }], duration: 400, maxZoom: 1 })
    setOpenCardId(focusCardId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusCardId])
```

- [ ] **Step 8: Wrap the render output in `BoardCommentsProvider`**

Replace the component's `return` statement's opening:

```typescript
  return (
    <BoardUiProvider value={{ palette, readOnly, markLocalOp, onCardResize }}>
```

with:

```typescript
  return (
    <BoardCommentsProvider value={{ threadsByCard, openCardId, openThread, closeThread, postComment, toggleResolved }}>
    <BoardUiProvider value={{ palette, readOnly, markLocalOp, onCardResize }}>
```

And replace the final closing of that same return statement:

```typescript
    </BoardUiProvider>
  )
}
```

with:

```typescript
    </BoardUiProvider>
    </BoardCommentsProvider>
  )
}
```

- [ ] **Step 9: Verify with typecheck and build**

Run: `npm run lint && npm run build`
Expected: Both succeed with no errors.

- [ ] **Step 10: Manual browser verification**

Run `npm run dev`, open a board, hover a card — the 💬 button should appear. Click it, type a comment, send it (Enter). Confirm it appears in the thread and the badge now shows `💬 1`. Open the same board in a second browser window (or incognito, second team member) — confirm the badge/thread update live without reload. Click "Merk som løst" — confirm the badge dims in both windows.

- [ ] **Step 11: Commit**

```bash
git add components/boards/BoardCanvas.tsx
git commit -m "feat: wire board comments state, realtime, and notification deep-link into BoardCanvas"
```

---

### Task 9: `BoardPageClient.tsx` — read `?comment=` and pass it through

**Files:**
- Modify: `app/admin/boards/[boardId]/BoardPageClient.tsx`

**Interfaces:**
- Consumes: `BoardCanvas`'s new `focusCardId` prop (Task 8).

- [ ] **Step 1: Add `useSearchParams` and pass `focusCardId`**

Replace:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { C } from '@/lib/admin-theme'
import { renameBoard, type BoardData } from '@/lib/actions/boards'
import BoardCanvas from '@/components/boards/BoardCanvas'
import ShareDialog from '@/components/boards/ShareDialog'

export default function BoardPageClient({ initial }: { initial: BoardData }) {
  const router = useRouter()
  const [title, setTitle] = useState(initial.board.title)
  const [shareOpen, setShareOpen] = useState(false)
```

with:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { C } from '@/lib/admin-theme'
import { renameBoard, type BoardData } from '@/lib/actions/boards'
import BoardCanvas from '@/components/boards/BoardCanvas'
import ShareDialog from '@/components/boards/ShareDialog'

export default function BoardPageClient({ initial }: { initial: BoardData }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const focusCardId = searchParams.get('comment') ?? undefined
  const [title, setTitle] = useState(initial.board.title)
  const [shareOpen, setShareOpen] = useState(false)
```

- [ ] **Step 2: Pass `focusCardId` to `BoardCanvas`**

Replace:

```tsx
        <BoardCanvas
          boardId={initial.board.id}
          initial={initial}
          onOpenBoard={id => router.push(`/admin/boards/${id}`)}
        />
```

with:

```tsx
        <BoardCanvas
          boardId={initial.board.id}
          initial={initial}
          onOpenBoard={id => router.push(`/admin/boards/${id}`)}
          focusCardId={focusCardId}
        />
```

- [ ] **Step 3: Verify with typecheck and build**

Run: `npm run lint && npm run build`
Expected: Both succeed.

- [ ] **Step 4: Manual verification**

Run `npm run dev`, open `/admin/boards/<boardId>?comment=<any existing card id on that board>` directly in the browser. Confirm the canvas pans/zooms to that card and its comment thread opens automatically.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/boards/[boardId]/BoardPageClient.tsx"
git commit -m "feat: read ?comment= deep-link param in BoardPageClient"
```

---

### Task 10: `VarslerClient.tsx` — notification display + navigation

**Files:**
- Modify: `app/admin/varsler/VarslerClient.tsx`

**Interfaces:**
- Consumes: `Notification.type` including `'board_comment_mention' | 'board_comment_reply'`, `Notification.board_id`, `Notification.board_card_id` (Task 2).

- [ ] **Step 1: Add navigation for the two new types**

In `navigateTo`, replace:

```tsx
    } else if (n.type === 'task_message' || n.type === 'task_message_mention' || n.type === 'task_message_reaction') {
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
```

with:

```tsx
    } else if (n.type === 'task_message' || n.type === 'task_message_mention' || n.type === 'task_message_reaction') {
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
    } else if (n.type === 'board_comment_mention' || n.type === 'board_comment_reply') {
      router.push(`/admin/boards/${n.board_id}?comment=${n.board_card_id}`)
    } else {
      router.push(`/admin/postprod/${n.project_id}`)
    }
```

- [ ] **Step 2: Add the icon for the two new types**

Replace:

```tsx
                      ) : n.type === 'project_message_mention' || n.type === 'task_message_mention' || n.type === 'quote_mention' ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="4" />
                          <path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-4 7.5" />
                        </svg>
                      ) : n.type === 'project_message' || n.type === 'quote_message' || n.type === 'direct_message' ? (
```

with:

```tsx
                      ) : n.type === 'project_message_mention' || n.type === 'task_message_mention' || n.type === 'quote_mention' || n.type === 'board_comment_mention' ? (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="4" />
                          <path d="M16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-4 7.5" />
                        </svg>
                      ) : n.type === 'project_message' || n.type === 'quote_message' || n.type === 'direct_message' || n.type === 'board_comment_reply' ? (
```

- [ ] **Step 3: Add label text for the two new types**

Replace:

```tsx
                          {n.type === 'project_message' ? 'i prosjekt-chatten'
                            : n.type === 'project_message_mention' ? 'nevnte deg i prosjekt-chatten'
                            : n.type === 'task_message_mention' ? 'nevnte deg i en oppgave'
                            : n.type === 'task_assigned' ? 'tildelte deg en oppgave'
                            : n.type === 'lead_assigned' ? 'satte deg som ansvarlig for en lead'
                            : n.type === 'resale_assigned' ? 'satte deg som ansvarlig for videresalg'
                            : n.type === 'selection_submitted' ? 'sendte inn bildevalg'
                            : n.type === 'quote_mention' ? 'tagget deg i tilbud'
                            : n.type === 'quote_message' ? 'i tilbudschatten'
                            : n.type === 'feedback_reply' ? 'svarte på tilbakemeldingen din'
                            : n.type === 'contract_signed' ? 'signerte kontrakten'
                            : n.type === 'direct_message' ? 'sendte deg en direktemelding'
                            : n.type === 'project_message_reaction' ? 'reagerte på meldingen din i prosjekt-chatten'
                            : n.type === 'task_message_reaction' ? 'reagerte på meldingen din i en oppgave'
                            : n.type === 'quote_message_reaction' ? 'reagerte på meldingen din i tilbudschatten'
                            : 'i en oppgave'}
```

with:

```tsx
                          {n.type === 'project_message' ? 'i prosjekt-chatten'
                            : n.type === 'project_message_mention' ? 'nevnte deg i prosjekt-chatten'
                            : n.type === 'task_message_mention' ? 'nevnte deg i en oppgave'
                            : n.type === 'task_assigned' ? 'tildelte deg en oppgave'
                            : n.type === 'lead_assigned' ? 'satte deg som ansvarlig for en lead'
                            : n.type === 'resale_assigned' ? 'satte deg som ansvarlig for videresalg'
                            : n.type === 'selection_submitted' ? 'sendte inn bildevalg'
                            : n.type === 'quote_mention' ? 'tagget deg i tilbud'
                            : n.type === 'quote_message' ? 'i tilbudschatten'
                            : n.type === 'feedback_reply' ? 'svarte på tilbakemeldingen din'
                            : n.type === 'contract_signed' ? 'signerte kontrakten'
                            : n.type === 'direct_message' ? 'sendte deg en direktemelding'
                            : n.type === 'project_message_reaction' ? 'reagerte på meldingen din i prosjekt-chatten'
                            : n.type === 'task_message_reaction' ? 'reagerte på meldingen din i en oppgave'
                            : n.type === 'quote_message_reaction' ? 'reagerte på meldingen din i tilbudschatten'
                            : n.type === 'board_comment_mention' ? 'nevnte deg i en boardkommentar'
                            : n.type === 'board_comment_reply' ? 'svarte på kommentaren din på boardet'
                            : 'i en oppgave'}
```

(`channelFor` needs no change — its `default: return null` already makes `board_comment_mention`/`board_comment_reply` non-repliable/non-reactable from this page, matching the spec's "Ikke inkludert": svare på boardkommentar-varsler direkte fra varselsiden er utenfor scope.)

- [ ] **Step 4: Verify with typecheck and build**

Run: `npm run lint && npm run build`
Expected: Both succeed.

- [ ] **Step 5: Manual verification**

With two logged-in team members (two browser windows), have one @mention the other in a board comment (from Task 8's manual test). On the mentioned user's `/admin/varsler`, confirm a new row appears with the "nevnte deg i en boardkommentar" text and the @-circle icon, live (no reload). Click it — confirm it navigates to `/admin/boards/<board_id>?comment=<card_id>` and the thread opens there (Task 9's behavior).

- [ ] **Step 6: Commit**

```bash
git add app/admin/varsler/VarslerClient.tsx
git commit -m "feat: display and navigate board comment notifications on the varsler page"
```

---

### Task 11: End-to-end verification against the spec's test list

**Files:** none (verification only)

- [ ] **Step 1: Full build/lint pass**

Run: `npm run lint && npm run build`
Expected: Both succeed with zero errors.

- [ ] **Step 2: Run every manual test from the spec**

Using `npm run dev` and two logged-in team members (two browser windows or one window + incognito), work through each check from `docs/superpowers/specs/2026-07-22-board-comments-design.md`'s "Testing" section:

1. Comment on a card → 💬 badge with correct count appears for both windows live.
2. @mention someone → they get `board_comment_mention`, clicking it opens the right board + card + thread.
3. Reply without tagging anyone → thread starter gets `board_comment_reply`; the replier gets no notification for their own message.
4. Thread starter is also tagged in the reply → they get exactly one notification (mention), not two.
5. Mark a thread resolved → badge dims live in both windows; reopening un-dims it.
6. Delete your own comment → disappears for everyone; deleting someone else's comment (test via direct call, e.g. browser console `fetch` is not applicable to server actions — instead confirm in code review that `deleteBoardComment` checks `author_id === user.id` before deleting, since no UI button for delete exists in this plan's scope) is rejected.

- [ ] **Step 3: Confirm the public share view is untouched**

Open a board's `/b/[token]` share link (or create one via the "Del"-button if none exists). Confirm no comment badges, buttons, or threads appear anywhere on that page — comments must stay fully internal.

- [ ] **Step 4: Report results**

No commit for this task — it's a verification pass. If any check fails, fix the root cause in the relevant earlier task's files and re-run the full `npm run lint && npm run build` plus the specific failing manual check before considering the plan complete.

---

## Summary of files touched

| File | Change |
|---|---|
| `supabase/migrations/118_board_comments.sql` | New — tables, RLS, realtime, notify trigger |
| `lib/types.ts` | `BoardCommentThread`, `BoardComment` types |
| `lib/actions/notifications.ts` | `Notification` gains 2 types + 2 fields |
| `lib/actions/boardComments.ts` | New — server actions |
| `lib/actions/boards.ts` | `BoardData.comments?`, populated in `getBoardData` |
| `components/boards/boardCommentsContext.tsx` | New — context |
| `hooks/useBoardRealtime.ts` | Optional comment-table callbacks |
| `components/boards/CommentThread.tsx` | New — popover panel |
| `components/boards/nodes/CardShell.tsx` | Comment badge + `NodeToolbar` |
| `components/boards/nodes/{Note,Image,Video,Link,Color,Todo,Board,Schedule,Storyline}Node.tsx` | Pass `cardId={id}` to `CardShell` |
| `components/boards/BoardCanvas.tsx` | Provider, state, realtime wiring, focus deep-link |
| `app/admin/boards/[boardId]/BoardPageClient.tsx` | Read `?comment=`, pass `focusCardId` |
| `app/admin/varsler/VarslerClient.tsx` | Display + navigate 2 new notification types |
