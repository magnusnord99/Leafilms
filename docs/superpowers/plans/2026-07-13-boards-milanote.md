# Boards (intern Milanote-erstatning) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bygge en Milanote-lignende boards-modul (uendelig canvas med kort, kolonner, piler, nestede boards, realtime og delingslenke) knyttet til prosjekter via preprod-modulen, slik at Milanote-abonnementet kan sies opp.

**Architecture:** React Flow (`@xyflow/react`) som canvas-motor der hvert kort er en custom node. Data i tre Supabase-tabeller (`boards`, `board_cards`, `board_edges`) med staff-RLS, lagring via server actions (optimistisk UI), live-oppdateringer via Supabase Realtime `postgres_changes`, offentlig read-only-deling via `share_token` og service-klient.

**Tech Stack:** Next.js 16 App Router, React 19, `@xyflow/react` v12, Supabase (Postgres + RLS + Realtime + Storage), TypeScript strict, inline-styles med palettkonstanter (ikke Tailwind-klasser i admin-komponentene — følger eksisterende admin-stil).

**Spec:** `docs/superpowers/specs/2026-07-13-boards-milanote-design.md` — les den først.

## Global Constraints

- Migrasjonsnummer: `098_boards.sql` — verifiser med `ls supabase/migrations | tail -3` at 098 fortsatt er ledig før du lager filen.
- All UI-tekst på norsk.
- Admin-sider bruker paletten `C` fra `lib/admin-theme.ts` (`#181920`/`#7C5CFC`); den offentlige delingssiden `/b/[token]` bruker `S` fra `lib/client-theme.ts` (`#0C0B09`/`#C49434`). Aldri bland dem — kortkomponentene får farger via `BoardThemeContext` slik at samme komponent kan brukes begge steder.
- Admin-komponenter styles med inline `style`-objekter og palettkonstanter, som `app/admin/preprod/page.tsx` gjør. Fonter: `var(--font-dm-sans)` for brødtekst.
- Alle nye tabeller får RLS (mønster: `supabase/migrations/059_selection_galleries.sql`).
- Nye typer legges i `lib/types.ts`.
- Repoet har ingen testrunner. Verifisering per task = `npx tsc --noEmit` + `npm run lint` + manuell sjekk i browser (`npm run dev`, logg inn i admin). ALDRI testskriving mot ekte prosjektdata — opprett/bruk et eget testprosjekt («ZZZ Boards-test») i pipeline-stadiet `pre_prod` og gjør alle write-operasjoner der.
- Commit hyppig, meldinger på norsk med conventional prefix (`feat:`, `fix:`), avslutt alltid med `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Server actions følger mønsteret i `lib/actions/preprod.ts`: `'use server'`, `createClient` fra `@/lib/supabase-server`, try/catch med `console.error` og null/false-retur ved feil.

---

### Task 1: Migrasjon 098 + typer

**Files:**
- Create: `supabase/migrations/098_boards.sql`
- Modify: `lib/types.ts` (legg til nederst)

**Interfaces:**
- Produces (DB): tabellene `boards`, `board_cards`, `board_edges`, bucket `board-images`, realtime-publikasjon for `board_cards`/`board_edges`.
- Produces (TS): typene `Board`, `BoardCard`, `BoardCardType`, `BoardEdge`, `BoardCardContent` m/ undertyper — brukes av alle senere tasks.

- [ ] **Step 1: Skriv migrasjonen**

```sql
-- 098_boards.sql
-- Boards: intern Milanote-erstatning for preproduksjon.
-- Spec: docs/superpowers/specs/2026-07-13-boards-milanote-design.md
-- Tre tabeller (boards, board_cards, board_edges), staff-RLS, realtime og
-- storage-bucket for opplastede bilder/video.

CREATE TABLE IF NOT EXISTS boards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_board_id UUID REFERENCES boards(id) ON DELETE CASCADE,
  title           TEXT NOT NULL DEFAULT 'Board',
  share_token     TEXT UNIQUE,
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ett rotboard per prosjekt
CREATE UNIQUE INDEX IF NOT EXISTS idx_boards_root_per_project
  ON boards(project_id) WHERE parent_board_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_boards_parent ON boards(parent_board_id);
CREATE INDEX IF NOT EXISTS idx_boards_share_token ON boards(share_token) WHERE share_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS board_cards (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id   UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('note','image','video','link','color','todo','column','board')),
  x          DOUBLE PRECISION NOT NULL DEFAULT 0,
  y          DOUBLE PRECISION NOT NULL DEFAULT 0,
  width      DOUBLE PRECISION,
  z_index    INTEGER NOT NULL DEFAULT 0,
  column_id  UUID REFERENCES board_cards(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  content    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_board_cards_board  ON board_cards(board_id);
CREATE INDEX IF NOT EXISTS idx_board_cards_column ON board_cards(column_id) WHERE column_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS board_edges (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id     UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  from_card_id UUID NOT NULL REFERENCES board_cards(id) ON DELETE CASCADE,
  to_card_id   UUID NOT NULL REFERENCES board_cards(id) ON DELETE CASCADE,
  label        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_board_edges_board ON board_edges(board_id);

-- ---------------------------------------------------------------------------
-- RLS: staff (authenticated) har full tilgang. Offentlig deling leses
-- server-side med service-klient, så ingen anon-policies.
-- ---------------------------------------------------------------------------
ALTER TABLE boards      ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_edges ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'boards' AND policyname = 'authenticated full access boards') THEN
    EXECUTE 'CREATE POLICY "authenticated full access boards" ON boards FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'board_cards' AND policyname = 'authenticated full access board_cards') THEN
    EXECUTE 'CREATE POLICY "authenticated full access board_cards" ON board_cards FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'board_edges' AND policyname = 'authenticated full access board_edges') THEN
    EXECUTE 'CREATE POLICY "authenticated full access board_edges" ON board_edges FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- Realtime (mønster: 064_notifications_realtime.sql / 094_direct_messages.sql)
-- REPLICA IDENTITY FULL kreves for at DELETE-events skal bære board_id-filteret.
-- ---------------------------------------------------------------------------
ALTER TABLE board_cards REPLICA IDENTITY FULL;
ALTER TABLE board_edges REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'board_cards') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE board_cards;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'board_edges') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE board_edges;
  END IF;
END$$;

-- ---------------------------------------------------------------------------
-- Storage: offentlig bucket for bilder/video på boards (50 MB per fil)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'board-images', 'board-images', true, 52428800,
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'board images auth insert') THEN
    EXECUTE 'CREATE POLICY "board images auth insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = ''board-images'')';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'board images auth delete') THEN
    EXECUTE 'CREATE POLICY "board images auth delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = ''board-images'')';
  END IF;
END$$;
```

- [ ] **Step 2: Legg til typer i `lib/types.ts`** (nederst i filen)

```ts
// ---------------------------------------------------------------------------
// Boards (intern Milanote-erstatning) — 098_boards.sql
// ---------------------------------------------------------------------------

export type BoardCardType = 'note' | 'image' | 'video' | 'link' | 'color' | 'todo' | 'column' | 'board'

export type NoteContent = { text: string }
export type ImageContent = { url: string; caption?: string }
/** Enten embed_url (YouTube/Vimeo iframe-URL) eller url (opplastet fil i board-images) */
export type VideoContent = { embed_url?: string; url?: string }
export type LinkContent = { url: string; title?: string; description?: string; image_url?: string }
export type ColorContent = { hex: string }
export type TodoItem = { id: string; text: string; checked: boolean }
export type TodoContent = { title?: string; items: TodoItem[] }
export type ColumnContent = { title: string }
/** title er denormalisert fra boards.title for enkel rendering (holdes i sync av renameBoard) */
export type BoardRefContent = { child_board_id: string; title: string }

export type BoardCardContent =
  | NoteContent | ImageContent | VideoContent | LinkContent
  | ColorContent | TodoContent | ColumnContent | BoardRefContent

export type Board = {
  id: string
  project_id: string
  parent_board_id: string | null
  title: string
  share_token: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type BoardCard = {
  id: string
  board_id: string
  type: BoardCardType
  x: number
  y: number
  width: number | null
  z_index: number
  column_id: string | null
  sort_order: number
  content: BoardCardContent
  created_at: string
  updated_at: string
}

export type BoardEdge = {
  id: string
  board_id: string
  from_card_id: string
  to_card_id: string
  label: string | null
  created_at: string
}
```

- [ ] **Step 3: Kjør migrasjonen**

Les først `scripts/migrate-single.sh` (`cat scripts/migrate-single.sh`) for å se argumentformatet, kjør deretter tilsvarende `npm run migrate:single -- 098_boards.sql` (eller det formatet scriptet forventer). Hvis scriptet feiler på tilkobling: bruk pooler-hosten `aws-1-eu-north-1.pooler.supabase.com` med bruker `postgres.<ref>` (DATABASE_URL er IPv6-only og feiler lokalt — kjent problem, se scripts/run-migrations-psql.sh).

Verifiser: `npm run migrate:show` (eller psql `\dt boards*`) viser at `boards`, `board_cards`, `board_edges` finnes.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit` — Expected: ingen feil.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/098_boards.sql lib/types.ts
git commit -m "feat: migrasjon 098 boards + typer for boards-modulen"
```

---

### Task 2: Installer @xyflow/react

**Files:**
- Modify: `package.json` (via npm)

**Interfaces:**
- Produces: `@xyflow/react` v12 tilgjengelig for import i alle senere tasks.

- [ ] **Step 1: Installer**

Run: `npm install @xyflow/react`
Expected: `@xyflow/react` ^12.x i dependencies, ingen peer-dependency-feil mot React 19.

- [ ] **Step 2: Verifiser build-kompatibilitet**

Run: `npx tsc --noEmit` — Expected: ingen feil.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: legg til @xyflow/react for boards-canvas"
```

---

### Task 3: Server actions for boards

**Files:**
- Create: `lib/actions/boards.ts`

**Interfaces:**
- Consumes: typene fra Task 1 (`@/lib/types`), `createClient`/`createServiceClient` fra `@/lib/supabase-server`.
- Produces (brukes av Task 4–13 — eksakte signaturer):

```ts
export type ChildBoardMeta = { title: string; cardCount: number }
export type BoardData = {
  board: Board
  cards: BoardCard[]
  edges: BoardEdge[]
  breadcrumbs: { id: string; title: string }[]   // rot først, aktivt board sist
  projectId: string
  projectTitle: string
  childMeta: Record<string, ChildBoardMeta>       // key = child_board_id
}
export type CardPositionPatch = {
  id: string; x: number; y: number
  z_index?: number; column_id?: string | null; sort_order?: number; width?: number | null
}

export async function getOrCreateRootBoard(projectId: string): Promise<string | null>
export async function getBoardData(boardId: string): Promise<BoardData | null>
export async function createBoardCard(input: {
  board_id: string; type: BoardCardType; x: number; y: number
  content: BoardCardContent; width?: number; z_index?: number
  column_id?: string | null; sort_order?: number
}): Promise<BoardCard | null>
export async function updateCardContent(id: string, content: BoardCardContent): Promise<boolean>
export async function saveCardPositions(patches: CardPositionPatch[]): Promise<boolean>
export async function deleteBoardCards(ids: string[]): Promise<boolean>
export async function createBoardEdge(input: { board_id: string; from_card_id: string; to_card_id: string }): Promise<BoardEdge | null>
export async function updateBoardEdgeLabel(id: string, label: string | null): Promise<boolean>
export async function deleteBoardEdges(ids: string[]): Promise<boolean>
export async function createSubBoard(parentBoardId: string, title: string, x: number, y: number): Promise<{ boardId: string; card: BoardCard } | null>
export async function renameBoard(boardId: string, title: string): Promise<boolean>
```

(Share-actions og `fetchLinkMetadata` legges til i Task 7 og 13 i samme fil.)

- [ ] **Step 1: Implementer filen**

```ts
'use server'

import { createClient } from '@/lib/supabase-server'
import type { Board, BoardCard, BoardCardContent, BoardCardType, BoardEdge, BoardRefContent } from '@/lib/types'

export type ChildBoardMeta = { title: string; cardCount: number }

export type BoardData = {
  board: Board
  cards: BoardCard[]
  edges: BoardEdge[]
  breadcrumbs: { id: string; title: string }[]
  projectId: string
  projectTitle: string
  childMeta: Record<string, ChildBoardMeta>
}

export type CardPositionPatch = {
  id: string; x: number; y: number
  z_index?: number; column_id?: string | null; sort_order?: number; width?: number | null
}

const now = () => new Date().toISOString()

export async function getOrCreateRootBoard(projectId: string): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data: existing } = await supabase
      .from('boards').select('id')
      .eq('project_id', projectId).is('parent_board_id', null).maybeSingle()
    if (existing) return existing.id

    const { data: { user } } = await supabase.auth.getUser()
    const { data: proj } = await supabase.from('projects').select('title').eq('id', projectId).single()
    const { data, error } = await supabase
      .from('boards')
      .insert({ project_id: projectId, title: proj?.title ?? 'Board', created_by: user?.id ?? null })
      .select('id').single()
    if (error) {
      // Race mot unik indeks (to brukere åpner samtidig): hent den som vant
      const { data: retry } = await supabase
        .from('boards').select('id')
        .eq('project_id', projectId).is('parent_board_id', null).maybeSingle()
      return retry?.id ?? null
    }
    return data.id
  } catch (err) {
    console.error('getOrCreateRootBoard:', err)
    return null
  }
}

async function buildBreadcrumbs(
  supabase: Awaited<ReturnType<typeof createClient>>,
  board: Board
): Promise<{ id: string; title: string }[]> {
  const crumbs = [{ id: board.id, title: board.title }]
  let parentId = board.parent_board_id
  let guard = 0
  while (parentId && guard++ < 20) {
    const { data } = await supabase.from('boards')
      .select('id, title, parent_board_id').eq('id', parentId).single()
    if (!data) break
    crumbs.unshift({ id: data.id, title: data.title })
    parentId = data.parent_board_id
  }
  return crumbs
}

async function loadChildMeta(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cards: BoardCard[]
): Promise<Record<string, ChildBoardMeta>> {
  const childIds = cards
    .filter(c => c.type === 'board')
    .map(c => (c.content as BoardRefContent).child_board_id)
    .filter(Boolean)
  if (childIds.length === 0) return {}
  const [{ data: children }, { data: counts }] = await Promise.all([
    supabase.from('boards').select('id, title').in('id', childIds),
    supabase.from('board_cards').select('board_id').in('board_id', childIds),
  ])
  const meta: Record<string, ChildBoardMeta> = {}
  for (const ch of children ?? []) meta[ch.id] = { title: ch.title, cardCount: 0 }
  for (const row of counts ?? []) if (meta[row.board_id]) meta[row.board_id].cardCount++
  return meta
}

export async function getBoardData(boardId: string): Promise<BoardData | null> {
  try {
    const supabase = await createClient()
    const { data: board } = await supabase.from('boards').select('*').eq('id', boardId).single()
    if (!board) return null

    const [{ data: cards }, { data: edges }, { data: project }] = await Promise.all([
      supabase.from('board_cards').select('*').eq('board_id', boardId).order('z_index'),
      supabase.from('board_edges').select('*').eq('board_id', boardId),
      supabase.from('projects').select('id, title').eq('id', board.project_id).single(),
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
    }
  } catch (err) {
    console.error('getBoardData:', err)
    return null
  }
}

export async function createBoardCard(input: {
  board_id: string; type: BoardCardType; x: number; y: number
  content: BoardCardContent; width?: number; z_index?: number
  column_id?: string | null; sort_order?: number
}): Promise<BoardCard | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.from('board_cards').insert({
      board_id: input.board_id,
      type: input.type,
      x: input.x,
      y: input.y,
      width: input.width ?? null,
      z_index: input.z_index ?? 0,
      column_id: input.column_id ?? null,
      sort_order: input.sort_order ?? 0,
      content: input.content,
    }).select('*').single()
    if (error) { console.error('createBoardCard:', error); return null }
    return data as BoardCard
  } catch (err) {
    console.error('createBoardCard:', err)
    return null
  }
}

export async function updateCardContent(id: string, content: BoardCardContent): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('board_cards')
      .update({ content, updated_at: now() }).eq('id', id)
    return !error
  } catch (err) {
    console.error('updateCardContent:', err)
    return false
  }
}

export async function saveCardPositions(patches: CardPositionPatch[]): Promise<boolean> {
  try {
    const supabase = await createClient()
    const results = await Promise.all(patches.map(p => {
      const { id, ...fields } = p
      return supabase.from('board_cards').update({ ...fields, updated_at: now() }).eq('id', id)
    }))
    return results.every(r => !r.error)
  } catch (err) {
    console.error('saveCardPositions:', err)
    return false
  }
}

export async function deleteBoardCards(ids: string[]): Promise<boolean> {
  try {
    if (ids.length === 0) return true
    const supabase = await createClient()
    const { data: cards } = await supabase.from('board_cards')
      .select('id, type, content, x, y').in('id', ids)
    if (!cards) return false

    // Kolonner som slettes: løsriv barna til absolutt posisjon ved kolonnen
    const columns = cards.filter(c => c.type === 'column')
    if (columns.length > 0) {
      const { data: children } = await supabase.from('board_cards')
        .select('id, x, y, column_id').in('column_id', columns.map(c => c.id))
      for (const ch of children ?? []) {
        const col = columns.find(c => c.id === ch.column_id)
        if (!col) continue
        await supabase.from('board_cards').update({
          column_id: null, sort_order: 0,
          x: col.x + ch.x + 24, y: col.y + ch.y,
          updated_at: now(),
        }).eq('id', ch.id)
      }
    }

    // Board-kort som slettes: slett underboardet (cascade tar kort/edges/underboards)
    const childBoardIds = cards
      .filter(c => c.type === 'board')
      .map(c => (c.content as BoardRefContent).child_board_id)
      .filter(Boolean)
    if (childBoardIds.length > 0) {
      await supabase.from('boards').delete().in('id', childBoardIds)
    }

    const { error } = await supabase.from('board_cards').delete().in('id', ids)
    return !error
  } catch (err) {
    console.error('deleteBoardCards:', err)
    return false
  }
}

export async function createBoardEdge(input: {
  board_id: string; from_card_id: string; to_card_id: string
}): Promise<BoardEdge | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.from('board_edges')
      .insert(input).select('*').single()
    if (error) { console.error('createBoardEdge:', error); return null }
    return data as BoardEdge
  } catch (err) {
    console.error('createBoardEdge:', err)
    return null
  }
}

export async function updateBoardEdgeLabel(id: string, label: string | null): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('board_edges').update({ label }).eq('id', id)
    return !error
  } catch (err) {
    console.error('updateBoardEdgeLabel:', err)
    return false
  }
}

export async function deleteBoardEdges(ids: string[]): Promise<boolean> {
  try {
    if (ids.length === 0) return true
    const supabase = await createClient()
    const { error } = await supabase.from('board_edges').delete().in('id', ids)
    return !error
  } catch (err) {
    console.error('deleteBoardEdges:', err)
    return false
  }
}

export async function createSubBoard(
  parentBoardId: string, title: string, x: number, y: number
): Promise<{ boardId: string; card: BoardCard } | null> {
  try {
    const supabase = await createClient()
    const { data: parent } = await supabase.from('boards')
      .select('id, project_id').eq('id', parentBoardId).single()
    if (!parent) return null
    const { data: { user } } = await supabase.auth.getUser()

    const { data: child, error } = await supabase.from('boards').insert({
      project_id: parent.project_id,
      parent_board_id: parentBoardId,
      title,
      created_by: user?.id ?? null,
    }).select('id').single()
    if (error || !child) { console.error('createSubBoard:', error); return null }

    const card = await createBoardCard({
      board_id: parentBoardId, type: 'board', x, y,
      content: { child_board_id: child.id, title },
    })
    if (!card) return null
    return { boardId: child.id, card }
  } catch (err) {
    console.error('createSubBoard:', err)
    return null
  }
}

export async function renameBoard(boardId: string, title: string): Promise<boolean> {
  try {
    const supabase = await createClient()
    const trimmed = title.trim()
    if (!trimmed) return false
    const { error } = await supabase.from('boards')
      .update({ title: trimmed, updated_at: now() }).eq('id', boardId)
    if (error) return false
    // Hold denormalisert tittel på board-kortet i foreldre-boardet i sync
    const { data: refCards } = await supabase.from('board_cards')
      .select('id, content').eq('type', 'board').contains('content', { child_board_id: boardId })
    for (const rc of refCards ?? []) {
      await supabase.from('board_cards')
        .update({ content: { ...(rc.content as BoardRefContent), title: trimmed }, updated_at: now() })
        .eq('id', rc.id)
    }
    return true
  } catch (err) {
    console.error('renameBoard:', err)
    return false
  }
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint` — Expected: ingen feil.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/boards.ts
git commit -m "feat: server actions for boards (CRUD kort/piler/underboards)"
```

---

### Task 4: Canvas-grunnmur + notatkort på /admin/boards/[boardId]

**Files:**
- Create: `components/boards/boardContext.tsx`
- Create: `components/boards/toFlow.ts`
- Create: `components/boards/nodes/CardShell.tsx`
- Create: `components/boards/nodes/NoteNode.tsx`
- Create: `components/boards/nodes/index.ts`
- Create: `components/boards/Toolbar.tsx`
- Create: `components/boards/BoardCanvas.tsx`
- Create: `app/admin/boards/[boardId]/page.tsx`
- Create: `app/admin/boards/[boardId]/BoardPageClient.tsx`

**Interfaces:**
- Consumes: `getBoardData`, `createBoardCard`, `updateCardContent`, `saveCardPositions`, `deleteBoardCards` fra Task 3; typer fra Task 1.
- Produces:
  - `BoardCanvas`-props: `{ boardId: string; initial: BoardData; readOnly?: boolean; palette?: BoardPalette; onOpenBoard: (childBoardId: string) => void }`
  - `BoardPalette = { surface: string; surface2: string; border: string; text: string; text2: string; accent: string; canvasBg: string }`
  - `useBoardUi(): { palette: BoardPalette; readOnly: boolean; markLocalOp: (rowId: string) => void }` (context)
  - `CardNode = Node<{ card: BoardCard; meta?: ChildBoardMeta }>` (React Flow-nodetype)
  - `cardsToNodes(cards: BoardCard[], childMeta: Record<string, ChildBoardMeta>): CardNode[]` og `edgesToFlow(edges: BoardEdge[]): Edge[]` fra `toFlow.ts`
  - Konstanter i `toFlow.ts`: `CARD_WIDTH = 260`, `COLUMN_WIDTH = 280`, `COLUMN_PAD = 10`, `COLUMN_HEADER = 44`, `COLUMN_GAP = 8`

- [ ] **Step 1: `components/boards/boardContext.tsx`**

```tsx
'use client'

import { createContext, useContext } from 'react'
import { C } from '@/lib/admin-theme'

export type BoardPalette = {
  surface: string; surface2: string; border: string
  text: string; text2: string; accent: string; canvasBg: string
}

export const ADMIN_BOARD_PALETTE: BoardPalette = {
  surface: C.surface, surface2: C.surface2, border: C.border,
  text: C.text, text2: C.text2, accent: C.accent, canvasBg: C.bg,
}

type BoardUi = {
  palette: BoardPalette
  readOnly: boolean
  markLocalOp: (rowId: string) => void
}

const BoardUiContext = createContext<BoardUi>({
  palette: ADMIN_BOARD_PALETTE,
  readOnly: true,
  markLocalOp: () => {},
})

export const BoardUiProvider = BoardUiContext.Provider
export const useBoardUi = () => useContext(BoardUiContext)
```

- [ ] **Step 2: `components/boards/toFlow.ts`**

```ts
import type { Edge, Node } from '@xyflow/react'
import { MarkerType } from '@xyflow/react'
import type { BoardCard, BoardEdge } from '@/lib/types'
import type { ChildBoardMeta } from '@/lib/actions/boards'

export const CARD_WIDTH = 260
export const COLUMN_WIDTH = 280
export const COLUMN_PAD = 10
export const COLUMN_HEADER = 44
export const COLUMN_GAP = 8

export type CardNodeData = { card: BoardCard; meta?: ChildBoardMeta }
export type CardNode = Node<CardNodeData>

export function cardToNode(card: BoardCard, childMeta: Record<string, ChildBoardMeta>): CardNode {
  const isColumn = card.type === 'column'
  return {
    id: card.id,
    type: card.type,
    position: { x: card.x, y: card.y },
    data: {
      card,
      meta: card.type === 'board'
        ? childMeta[(card.content as { child_board_id: string }).child_board_id]
        : undefined,
    },
    zIndex: isColumn ? 0 : card.z_index + 1,
    ...(card.column_id ? { parentId: card.column_id, extent: 'parent' as const } : {}),
    style: {
      width: card.width ?? (isColumn ? COLUMN_WIDTH : CARD_WIDTH),
      ...(card.column_id ? { width: COLUMN_WIDTH - COLUMN_PAD * 2 } : {}),
    },
  }
}

export function cardsToNodes(cards: BoardCard[], childMeta: Record<string, ChildBoardMeta>): CardNode[] {
  // Kolonner må ligge før barna sine i arrayet (React Flow-krav for parentId)
  const columns = cards.filter(c => c.type === 'column')
  const rest = cards.filter(c => c.type !== 'column')
  return [...columns, ...rest].map(c => cardToNode(c, childMeta))
}

export function edgeToFlow(e: BoardEdge): Edge {
  return {
    id: e.id,
    source: e.from_card_id,
    target: e.to_card_id,
    label: e.label ?? undefined,
    markerEnd: { type: MarkerType.ArrowClosed },
  }
}

export function edgesToFlow(edges: BoardEdge[]): Edge[] {
  return edges.map(edgeToFlow)
}
```

- [ ] **Step 3: `components/boards/nodes/CardShell.tsx`**

```tsx
'use client'

import { Handle, Position } from '@xyflow/react'
import { useBoardUi } from '../boardContext'

export default function CardShell({ selected, children, padding = 12 }: {
  selected: boolean
  children: React.ReactNode
  padding?: number
}) {
  const { palette: P, readOnly } = useBoardUi()
  return (
    <div style={{
      width: '100%',
      background: P.surface,
      border: `1px solid ${selected ? P.accent : P.border}`,
      borderRadius: 8,
      padding,
      fontFamily: 'var(--font-dm-sans)',
      color: P.text,
      boxShadow: selected ? `0 0 0 1px ${P.accent}` : '0 2px 10px rgba(0,0,0,0.3)',
    }}>
      {!readOnly && (
        <>
          <Handle type="target" position={Position.Left} style={{ width: 8, height: 8, background: P.border, border: 'none' }} />
          <Handle type="source" position={Position.Right} style={{ width: 8, height: 8, background: P.accent, border: 'none' }} />
        </>
      )}
      {children}
    </div>
  )
}
```

- [ ] **Step 4: `components/boards/nodes/NoteNode.tsx`**

Notat med dobbeltklikk-redigering og lettvekts formatering (`# ` overskrift, `- ` punkt, `**fet**`):

```tsx
'use client'

import { useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { NoteContent } from '@/lib/types'
import { updateCardContent } from '@/lib/actions/boards'
import { useBoardUi } from '../boardContext'
import CardShell from './CardShell'
import type { CardNode } from '../toFlow'

function renderInline(text: string, key: number) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <span key={key}>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**')
          ? <strong key={i}>{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>
      )}
    </span>
  )
}

export default function NoteNode({ id, data, selected }: NodeProps<CardNode>) {
  const { palette: P, readOnly, markLocalOp } = useBoardUi()
  const content = data.card.content as NoteContent
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(content.text)

  const save = () => {
    setEditing(false)
    if (draft !== content.text) {
      content.text = draft
      markLocalOp(id)
      updateCardContent(id, { text: draft })
    }
  }

  const lines = (editing ? draft : content.text || 'Dobbeltklikk for å skrive …').split('\n')

  return (
    <CardShell selected={!!selected}>
      {editing ? (
        <textarea
          autoFocus
          className="nodrag"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={save}
          rows={Math.max(4, draft.split('\n').length)}
          style={{ width: '100%', background: P.surface2, color: P.text, border: `1px solid ${P.border}`, borderRadius: 6, padding: 8, fontSize: '0.82rem', fontFamily: 'var(--font-dm-sans)', resize: 'vertical', outline: 'none' }}
        />
      ) : (
        <div
          onDoubleClick={() => { if (!readOnly) { setDraft(content.text); setEditing(true) } }}
          style={{ fontSize: '0.82rem', lineHeight: 1.55, color: content.text ? P.text : P.text2, minHeight: 20, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        >
          {lines.map((line, i) => {
            if (line.startsWith('# ')) return <div key={i} style={{ fontSize: '1rem', fontWeight: 700, margin: '2px 0 4px' }}>{renderInline(line.slice(2), i)}</div>
            if (line.startsWith('- ')) return <div key={i} style={{ paddingLeft: 14, position: 'relative' }}><span style={{ position: 'absolute', left: 2 }}>•</span>{renderInline(line.slice(2), i)}</div>
            return <div key={i}>{line ? renderInline(line, i) : <br />}</div>
          })}
        </div>
      )}
    </CardShell>
  )
}
```

- [ ] **Step 5: `components/boards/nodes/index.ts`** (utvides i senere tasks)

```ts
import type { NodeTypes } from '@xyflow/react'
import NoteNode from './NoteNode'

export const nodeTypes: NodeTypes = {
  note: NoteNode,
}
```

- [ ] **Step 6: `components/boards/Toolbar.tsx`**

Vertikal verktøylinje langs venstre kant. Knappene aktiverer «plasseringsmodus» — neste klikk på canvas oppretter kortet. (Typene `image`, `video`, `link`, `color`, `todo`, `column`, `board` aktiveres i senere tasks; knappene defineres nå og filtreres mot `enabledTypes`.)

```tsx
'use client'

import type { BoardCardType } from '@/lib/types'
import { useBoardUi } from './boardContext'

const TOOLS: { type: BoardCardType; label: string; icon: string }[] = [
  { type: 'note',   label: 'Notat',   icon: 'T'  },
  { type: 'image',  label: 'Bilde',   icon: '🖼' },
  { type: 'video',  label: 'Video',   icon: '▶'  },
  { type: 'link',   label: 'Lenke',   icon: '🔗' },
  { type: 'color',  label: 'Farge',   icon: 'swatch' },
  { type: 'todo',   label: 'To-do',   icon: '☑'  },
  { type: 'column', label: 'Kolonne', icon: '▤'  },
  { type: 'board',  label: 'Board',   icon: '▦'  },
]

export default function Toolbar({ pending, onPick, enabledTypes }: {
  pending: BoardCardType | null
  onPick: (t: BoardCardType | null) => void
  enabledTypes: BoardCardType[]
}) {
  const { palette: P } = useBoardUi()
  return (
    <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 10, padding: 6 }}>
      {TOOLS.filter(t => enabledTypes.includes(t.type)).map(t => (
        <button
          key={t.type}
          title={t.label}
          onClick={() => onPick(pending === t.type ? null : t.type)}
          style={{
            width: 38, height: 38, borderRadius: 8, cursor: 'pointer', fontSize: '0.95rem',
            background: pending === t.type ? P.accent : 'transparent',
            color: pending === t.type ? '#fff' : P.text2,
            border: 'none',
          }}
        >
          {t.icon === 'swatch' ? <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 7, background: P.accent }} /> : t.icon}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 7: `components/boards/BoardCanvas.tsx`**

Kjernen. I denne tasken: rendering, pan/zoom/minimap, opprette notat via toolbar-klikk, flytte kort (lagre posisjon på slipp), slette med Delete, bringe til front ved dragstart. Kolonne-/board-/edge-logikk og realtime kobles på i Task 9–12 — men strukturen (localOps, `applyRemoteCard`) legges nå.

```tsx
'use client'

import { useCallback, useRef, useState } from 'react'
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap,
  useNodesState, useEdgesState, useReactFlow,
  type Edge, type OnNodeDrag, type OnBeforeDelete,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { BoardCard, BoardCardContent, BoardCardType } from '@/lib/types'
import {
  createBoardCard, deleteBoardCards, deleteBoardEdges, saveCardPositions,
  type BoardData, type CardPositionPatch,
} from '@/lib/actions/boards'
import { BoardUiProvider, ADMIN_BOARD_PALETTE, type BoardPalette } from './boardContext'
import { cardsToNodes, cardToNode, edgesToFlow, CARD_WIDTH, type CardNode } from './toFlow'
import { nodeTypes } from './nodes'
import Toolbar from './Toolbar'

const ENABLED_TYPES: BoardCardType[] = ['note'] // utvides per task

function defaultContent(type: BoardCardType): BoardCardContent {
  switch (type) {
    case 'note': return { text: '' }
    case 'color': return { hex: '#C49434' }
    case 'todo': return { items: [] }
    case 'column': return { title: 'Kolonne' }
    default: return { text: '' }
  }
}

type Props = {
  boardId: string
  initial: BoardData
  readOnly?: boolean
  palette?: BoardPalette
  onOpenBoard: (childBoardId: string) => void
}

function Canvas({ boardId, initial, readOnly = false, palette = ADMIN_BOARD_PALETTE, onOpenBoard }: Props) {
  const rf = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState<CardNode>(cardsToNodes(initial.cards, initial.childMeta))
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(edgesToFlow(initial.edges))
  const [pendingType, setPendingType] = useState<BoardCardType | null>(null)
  const [saveError, setSaveError] = useState(false)

  // Egen skriving siste 5 s → ignorer realtime-echo (Task 12)
  const localOps = useRef<Map<string, number>>(new Map())
  const markLocalOp = useCallback((rowId: string) => {
    localOps.current.set(rowId, Date.now())
  }, [])
  const isLocalOp = useCallback((rowId: string) => {
    const ts = localOps.current.get(rowId)
    return !!ts && Date.now() - ts < 5000
  }, [])

  const maxZ = () => Math.max(0, ...nodes.map(n => n.data.card.z_index))

  const persist = useCallback(async (patches: CardPositionPatch[]) => {
    patches.forEach(p => markLocalOp(p.id))
    const ok = await saveCardPositions(patches)
    setSaveError(!ok)
  }, [markLocalOp])

  // Opprette kort ved klikk på canvas i plasseringsmodus
  const onPaneClick = useCallback(async (event: React.MouseEvent) => {
    if (!pendingType || readOnly) return
    const type = pendingType
    setPendingType(null)
    const pos = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY })
    const card = await createBoardCard({
      board_id: boardId, type, x: pos.x, y: pos.y,
      content: defaultContent(type), z_index: maxZ() + 1,
    })
    if (!card) { setSaveError(true); return }
    markLocalOp(card.id)
    setNodes(ns => [...ns, cardToNode(card, initial.childMeta)])
  }, [pendingType, readOnly, rf, boardId, setNodes, markLocalOp, initial.childMeta, nodes])

  // Flytt til front ved dragstart, lagre posisjoner ved slipp
  const onNodeDragStart: OnNodeDrag<CardNode> = useCallback((_e, node) => {
    const z = maxZ() + 1
    node.data.card.z_index = z
    setNodes(ns => ns.map(n => n.id === node.id ? { ...n, zIndex: n.data.card.type === 'column' ? 0 : z + 1 } : n))
  }, [setNodes, nodes])

  const onNodeDragStop: OnNodeDrag<CardNode> = useCallback((_e, node, dragged) => {
    const moved = dragged.length > 0 ? dragged : [node]
    persist(moved.map(n => ({
      id: n.id, x: n.position.x, y: n.position.y,
      z_index: (n as CardNode).data.card.z_index,
    })))
  }, [persist])

  // Slett valgte med Delete-tast (bekreftelse for board-kort kommer i Task 10)
  const onBeforeDelete: OnBeforeDelete<CardNode, Edge> = useCallback(async ({ nodes: delNodes, edges: delEdges }) => {
    if (readOnly) return false
    return { nodes: delNodes, edges: delEdges }
  }, [readOnly])

  const onNodesDelete = useCallback((deleted: CardNode[]) => {
    deleted.forEach(n => markLocalOp(n.id))
    deleteBoardCards(deleted.map(n => n.id)).then(ok => setSaveError(!ok))
  }, [markLocalOp])

  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    deleted.forEach(e => markLocalOp(e.id))
    deleteBoardEdges(deleted.map(e => e.id)).then(ok => setSaveError(!ok))
  }, [markLocalOp])

  return (
    <BoardUiProvider value={{ palette, readOnly, markLocalOp }}>
      <div style={{ width: '100%', height: '100%', position: 'relative', background: palette.canvasBg }}>
        {!readOnly && (
          <Toolbar pending={pendingType} onPick={setPendingType} enabledTypes={ENABLED_TYPES} />
        )}
        {saveError && (
          <div style={{ position: 'absolute', bottom: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 20, background: '#3a1d1d', color: '#f0b0b0', border: '1px solid #E05555', borderRadius: 8, padding: '8px 14px', fontSize: '0.78rem', fontFamily: 'var(--font-dm-sans)' }}>
            Kunne ikke lagre siste endring — sjekk nettverket og prøv igjen.
            <button onClick={() => setSaveError(false)} style={{ marginLeft: 10, background: 'none', border: 'none', color: '#f0b0b0', cursor: 'pointer' }}>✕</button>
          </div>
        )}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onPaneClick={onPaneClick}
          onNodeDragStart={readOnly ? undefined : onNodeDragStart}
          onNodeDragStop={readOnly ? undefined : onNodeDragStop}
          onBeforeDelete={onBeforeDelete}
          onNodesDelete={onNodesDelete}
          onEdgesDelete={onEdgesDelete}
          nodesDraggable={!readOnly}
          nodesConnectable={false /* aktiveres i Task 11 */}
          elementsSelectable={!readOnly}
          deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
          fitView
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          style={{ cursor: pendingType ? 'crosshair' : undefined }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color={palette.border} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeColor={() => palette.surface2} maskColor="rgba(0,0,0,0.5)" style={{ background: palette.surface }} />
        </ReactFlow>
      </div>
    </BoardUiProvider>
  )
}

export default function BoardCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  )
}
```

Merk: `onOpenBoard` brukes fra Task 10 (dobbeltklikk på board-kort); den er med i props fra start så signaturen er stabil.

- [ ] **Step 8: `app/admin/boards/[boardId]/page.tsx` + `BoardPageClient.tsx`**

```tsx
// page.tsx
import { notFound } from 'next/navigation'
import { getBoardData } from '@/lib/actions/boards'
import BoardPageClient from './BoardPageClient'

export default async function BoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params
  const data = await getBoardData(boardId)
  if (!data) notFound()
  return <BoardPageClient initial={data} />
}
```

```tsx
// BoardPageClient.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { C } from '@/lib/admin-theme'
import { renameBoard, type BoardData } from '@/lib/actions/boards'
import BoardCanvas from '@/components/boards/BoardCanvas'

export default function BoardPageClient({ initial }: { initial: BoardData }) {
  const router = useRouter()
  const [title, setTitle] = useState(initial.board.title)

  const saveTitle = () => {
    const t = title.trim()
    if (t && t !== initial.board.title) renameBoard(initial.board.id, t)
    if (!t) setTitle(initial.board.title)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 0px)', background: C.bg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: `1px solid ${C.border}`, fontFamily: 'var(--font-dm-sans)' }}>
        <Link href={`/admin/preprod/${initial.projectId}`} style={{ color: C.text3, fontSize: '0.8rem', textDecoration: 'none' }}>
          {initial.projectTitle}
        </Link>
        {initial.breadcrumbs.map((b, i) => (
          <span key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: C.text3 }}>/</span>
            {i === initial.breadcrumbs.length - 1 ? (
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                style={{ background: 'transparent', border: 'none', outline: 'none', color: C.text, fontSize: '0.85rem', fontWeight: 600, width: Math.max(60, title.length * 8) }}
              />
            ) : (
              <Link href={`/admin/boards/${b.id}`} style={{ color: C.text2, fontSize: '0.8rem', textDecoration: 'none' }}>{b.title}</Link>
            )}
          </span>
        ))}
        <div style={{ flex: 1 }} />
        {/* Del-knapp kommer i Task 13 */}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <BoardCanvas
          boardId={initial.board.id}
          initial={initial}
          onOpenBoard={id => router.push(`/admin/boards/${id}`)}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 9: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint` — Expected: ingen feil. (React Flow v12-typenavn kan avvike litt — sjekk `node_modules/@xyflow/react/dist/esm/index.d.ts` ved tvil, f.eks. `OnBeforeDelete`.)

- [ ] **Step 10: Manuell verifisering**

1. `npm run dev`, logg inn i admin.
2. Finn id-en til testprosjektet «ZZZ Boards-test» (opprett det i admin om det ikke finnes), kjør i browser-konsollen på en admin-side: ingen — bruk i stedet en midlertidig URL: opprett rotboardet ved å gå til `/admin/preprod`, men siden preprod-knappen først kommer i Task 5: opprett boardet manuelt i SQL (psql mot pooler): `INSERT INTO boards (project_id, title) VALUES ('<testprosjekt-id>', 'ZZZ test') RETURNING id;`
3. Gå til `/admin/boards/<id>`: canvas rendres med prikk-bakgrunn, minimap og controls.
4. Klikk notat-verktøyet, klikk på canvas → notatkort opprettes. Dobbeltklikk → skriv tekst med `# `, `- ` og `**fet**` → klikk utenfor → formatert visning.
5. Dra kortet, refresh siden → posisjonen er bevart. Marker kort + Delete → borte etter refresh.

- [ ] **Step 11: Commit**

```bash
git add components/boards app/admin/boards
git commit -m "feat: boards-canvas med notatkort, flytting og sletting"
```

---

### Task 5: Inngang fra preprod-siden

**Files:**
- Modify: `app/admin/preprod/[id]/page.tsx` (finn Millanote-blokken med `grep -n millanote app/admin/preprod/\[id\]/page.tsx`)
- Modify: `app/admin/preprod/page.tsx` (kortvisningen viser `millanote_done` — la den stå, men endre etiketten hvis den refererer Millanote direkte)

**Interfaces:**
- Consumes: `getOrCreateRootBoard(projectId)` fra Task 3.

- [ ] **Step 1: Lag klientkomponenten `app/admin/preprod/[id]/BoardsButton.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getOrCreateRootBoard } from '@/lib/actions/boards'
import { C } from '@/lib/admin-theme'

export default function BoardsButton({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  return (
    <button
      onClick={async () => {
        setLoading(true)
        const boardId = await getOrCreateRootBoard(projectId)
        if (boardId) router.push(`/admin/boards/${boardId}`)
        else setLoading(false)
      }}
      disabled={loading}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.accentBg, color: C.accent, border: `1px solid ${C.accent}40`, borderRadius: 8, padding: '9px 16px', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'var(--font-dm-sans)', cursor: 'pointer', opacity: loading ? 0.6 : 1 }}
    >
      ▦ {loading ? 'Åpner …' : 'Åpne boards'}
    </button>
  )
}
```

- [ ] **Step 2: Bytt ut Millanote-UI-en på prosjektsiden**

I `app/admin/preprod/[id]/page.tsx`: finn seksjonen som viser/redigerer `millanote_url`/`millanote_done`. Erstatt URL-inputen med `<BoardsButton projectId={project.id} />`. Behold en liten sekundær lenke `Åpne gammel Millanote ↗` KUN når `preprod.millanote_url` er ikke-tom (bakoverkompatibilitet for gamle prosjekter). `millanote_done`-checkboxen beholdes men omdøpes i UI til «Moodboard/planlegging ferdig». Ikke endre `PreprodData`-typen (feltnavnene i JSONB må bestå for gamle rader).

- [ ] **Step 3: Typecheck + lint + manuell verifisering**

Run: `npx tsc --noEmit && npm run lint`
Manuelt: åpne `/admin/preprod/<testprosjekt-id>` → «Åpne boards» → havner på rotboardet (opprettes ved første klikk). Klikk igjen fra preprod → samme board (ingen duplikat).

- [ ] **Step 4: Commit**

```bash
git add app/admin/preprod
git commit -m "feat: boards-inngang fra preprod erstatter Millanote-lenken"
```

---

### Task 6: Bilde- og videokort (opplasting + embed)

**Files:**
- Create: `components/boards/nodes/ImageNode.tsx`
- Create: `components/boards/nodes/VideoNode.tsx`
- Create: `components/boards/videoUrl.ts`
- Create: `components/boards/upload.ts`
- Modify: `components/boards/nodes/index.ts` (registrer `image`, `video`)
- Modify: `components/boards/BoardCanvas.tsx` (ENABLED_TYPES + drop-opplasting + spesialoppretting for image/video)

**Interfaces:**
- Consumes: bucket `board-images` (Task 1), `createBoardCard`/`updateCardContent` (Task 3), `supabase` singleton fra `@/lib/supabase-client`.
- Produces:
  - `uploadBoardFile(boardId: string, file: File): Promise<{ url: string } | { error: string }>` fra `upload.ts`
  - `parseVideoEmbed(raw: string): string | null` fra `videoUrl.ts`

- [ ] **Step 1: `components/boards/upload.ts`**

```ts
import { supabase } from '@/lib/supabase-client'

const MAX_BYTES = 52428800 // 50 MB — matcher bucketens file_size_limit
const ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm']

export async function uploadBoardFile(boardId: string, file: File): Promise<{ url: string } | { error: string }> {
  if (!ALLOWED.includes(file.type)) return { error: `Filtypen ${file.type || 'ukjent'} støttes ikke` }
  if (file.size > MAX_BYTES) return { error: 'Filen er større enn 50 MB' }
  const ext = file.name.split('.').pop() ?? 'bin'
  const path = `${boardId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('board-images').upload(path, file, { contentType: file.type })
  if (error) return { error: 'Opplasting feilet: ' + error.message }
  const { data } = supabase.storage.from('board-images').getPublicUrl(path)
  return { url: data.publicUrl }
}
```

- [ ] **Step 2: `components/boards/videoUrl.ts`**

```ts
export function parseVideoEmbed(raw: string): string | null {
  const yt = raw.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{11})/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  const vimeo = raw.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`
  return null
}
```

- [ ] **Step 3: `components/boards/nodes/ImageNode.tsx`**

Bilde med caption (dobbeltklikk på teksten), lightbox (dobbeltklikk på bildet) og horisontal resize:

```tsx
'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { NodeResizer, type NodeProps } from '@xyflow/react'
import type { ImageContent } from '@/lib/types'
import { updateCardContent, saveCardPositions } from '@/lib/actions/boards'
import { useBoardUi } from '../boardContext'
import CardShell from './CardShell'
import type { CardNode } from '../toFlow'

export default function ImageNode({ id, data, selected, positionAbsoluteX, positionAbsoluteY }: NodeProps<CardNode>) {
  const { palette: P, readOnly, markLocalOp } = useBoardUi()
  const content = data.card.content as ImageContent
  const [lightbox, setLightbox] = useState(false)
  const [editingCaption, setEditingCaption] = useState(false)
  const [caption, setCaption] = useState(content.caption ?? '')

  const saveCaption = () => {
    setEditingCaption(false)
    if (caption !== (content.caption ?? '')) {
      content.caption = caption
      markLocalOp(id)
      updateCardContent(id, { url: content.url, caption })
    }
  }

  return (
    <>
      {!readOnly && (
        <NodeResizer
          isVisible={!!selected}
          minWidth={120}
          keepAspectRatio={false}
          onResizeEnd={(_e, params) => {
            markLocalOp(id)
            saveCardPositions([{ id, x: params.x, y: params.y, width: params.width }])
          }}
        />
      )}
      <CardShell selected={!!selected} padding={6}>
        <img
          src={content.url}
          alt={content.caption ?? ''}
          onDoubleClick={() => setLightbox(true)}
          style={{ width: '100%', display: 'block', borderRadius: 4 }}
          draggable={false}
        />
        {(content.caption || editingCaption || !readOnly) && (
          editingCaption ? (
            <input
              autoFocus
              className="nodrag"
              value={caption}
              onChange={e => setCaption(e.target.value)}
              onBlur={saveCaption}
              onKeyDown={e => e.key === 'Enter' && saveCaption()}
              placeholder="Bildetekst"
              style={{ width: '100%', marginTop: 6, background: P.surface2, color: P.text, border: `1px solid ${P.border}`, borderRadius: 4, padding: '4px 6px', fontSize: '0.72rem', outline: 'none' }}
            />
          ) : (
            <div
              onDoubleClick={() => !readOnly && setEditingCaption(true)}
              style={{ marginTop: content.caption ? 6 : 2, fontSize: '0.72rem', color: content.caption ? P.text2 : 'transparent', minHeight: 12 }}
            >
              {content.caption || '·'}
            </div>
          )
        )}
      </CardShell>
      {lightbox && createPortal(
        <div
          onClick={() => setLightbox(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}
        >
          <img src={content.url} alt="" style={{ maxWidth: '92vw', maxHeight: '92vh', borderRadius: 6 }} />
        </div>,
        document.body
      )}
    </>
  )
}
```

- [ ] **Step 4: `components/boards/nodes/VideoNode.tsx`**

```tsx
'use client'

import type { NodeProps } from '@xyflow/react'
import type { VideoContent } from '@/lib/types'
import { useBoardUi } from '../boardContext'
import CardShell from './CardShell'
import type { CardNode } from '../toFlow'

export default function VideoNode({ data, selected }: NodeProps<CardNode>) {
  const { palette: P } = useBoardUi()
  const content = data.card.content as VideoContent
  return (
    <CardShell selected={!!selected} padding={6}>
      <div className="nodrag" style={{ width: '100%', aspectRatio: '16 / 9', borderRadius: 4, overflow: 'hidden', background: '#000' }}>
        {content.embed_url ? (
          <iframe
            src={content.embed_url}
            style={{ width: '100%', height: '100%', border: 'none' }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : content.url ? (
          <video src={content.url} controls style={{ width: '100%', height: '100%' }} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: P.text2, fontSize: '0.75rem' }}>Ingen video</div>
        )}
      </div>
    </CardShell>
  )
}
```

- [ ] **Step 5: Koble på i canvas**

I `components/boards/nodes/index.ts`: legg `image: ImageNode, video: VideoNode` inn i `nodeTypes`.

I `BoardCanvas.tsx`:
1. `ENABLED_TYPES` → `['note', 'image', 'video']`.
2. I `onPaneClick`: `image` og `video` skal IKKE bruke `defaultContent` — intercept før `createBoardCard`:
   - `image`: åpne skjult `<input type="file" accept="image/*">` (ref i komponenten). Ved valg: `uploadBoardFile(boardId, file)` → ved `{ error }`: vis feilen i `saveError`-toasten (endre state til `string | null` og vis meldingen); ved `{ url }`: `createBoardCard({ …, type: 'image', content: { url } })` på lagret klikkposisjon (lagre `pendingPosRef.current = pos` før filvelgeren åpnes).
   - `video`: `const url = window.prompt('Lim inn YouTube/Vimeo-lenke (eller Avbryt for å laste opp fil):')` — hvis URL: `parseVideoEmbed(url)`; `null` → toast «Fant ikke gyldig YouTube/Vimeo-lenke»; ellers `createBoardCard` med `{ embed_url }`. Hvis prompt avbrytes: åpne filvelger med `accept="video/mp4,video/quicktime,video/webm"` og last opp som for bilde, content `{ url }`.
3. Drop fra filsystem: sett `onDrop`/`onDragOver` på wrapper-diven rundt `<ReactFlow>`:

```tsx
const onDrop = useCallback(async (e: React.DragEvent) => {
  e.preventDefault()
  if (readOnly) return
  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
  let pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
  for (const file of files) {
    const res = await uploadBoardFile(boardId, file)
    if ('error' in res) { setSaveError(res.error); continue }
    const isVideo = file.type.startsWith('video/')
    const card = await createBoardCard({
      board_id: boardId, type: isVideo ? 'video' : 'image', x: pos.x, y: pos.y,
      content: isVideo ? { url: res.url } : { url: res.url }, z_index: maxZ() + 1,
    })
    if (card) { markLocalOp(card.id); setNodes(ns => [...ns, cardToNode(card, initial.childMeta)]) }
    pos = { x: pos.x + 40, y: pos.y + 40 }
  }
}, [readOnly, rf, boardId, setNodes, markLocalOp, initial.childMeta])
```

(`<div onDrop={onDrop} onDragOver={e => e.preventDefault()} …>`; `setSaveError` endres til `useState<string | null>(null)` og toasten viser strengen.)

- [ ] **Step 6: Typecheck + lint + manuell verifisering**

Run: `npx tsc --noEmit && npm run lint`
Manuelt på testboardet: last opp bilde via toolbar og via drag-and-drop fra Finder; resize bildet; dobbeltklikk → lightbox; bildetekst. Videokort med YouTube-URL spiller. Dra inn en .txt-fil → feilmelding, ingen kort. Refresh → alt bevart.

- [ ] **Step 7: Commit**

```bash
git add components/boards
git commit -m "feat: bilde- og videokort med opplasting, embed, lightbox og resize"
```

---

### Task 7: Lenkekort med metadata

**Files:**
- Modify: `lib/actions/boards.ts` (legg til `fetchLinkMetadata`)
- Create: `components/boards/nodes/LinkNode.tsx`
- Modify: `components/boards/nodes/index.ts`, `components/boards/BoardCanvas.tsx`

**Interfaces:**
- Produces: `fetchLinkMetadata(url: string): Promise<LinkContent>` (server action, feiler aldri — faller tilbake til hostname).

- [ ] **Step 1: Legg til i `lib/actions/boards.ts`**

```ts
export async function fetchLinkMetadata(url: string): Promise<LinkContent> {
  const safeHost = (() => { try { return new URL(url).hostname } catch { return url } })()
  const fallback: LinkContent = { url, title: safeHost }
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) return fallback
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeafilmsBoards/1.0)' },
    })
    if (!res.ok) return fallback
    const html = (await res.text()).slice(0, 300_000)
    const pick = (re: RegExp) => re.exec(html)?.[1]?.trim()
    const og = (prop: string) =>
      pick(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]*content=["']([^"']+)["']`, 'i')) ??
      pick(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:${prop}["']`, 'i'))
    return {
      url,
      title: og('title') ?? pick(/<title[^>]*>([^<]+)<\/title>/i) ?? safeHost,
      description: og('description'),
      image_url: og('image'),
    }
  } catch {
    return fallback
  }
}
```

(Import av `LinkContent` fra `@/lib/types` finnes allerede via type-importene — utvid import-linjen.)

- [ ] **Step 2: `components/boards/nodes/LinkNode.tsx`**

```tsx
'use client'

import type { NodeProps } from '@xyflow/react'
import type { LinkContent } from '@/lib/types'
import { useBoardUi } from '../boardContext'
import CardShell from './CardShell'
import type { CardNode } from '../toFlow'

export default function LinkNode({ data, selected }: NodeProps<CardNode>) {
  const { palette: P } = useBoardUi()
  const content = data.card.content as LinkContent
  const host = (() => { try { return new URL(content.url).hostname } catch { return content.url } })()
  return (
    <CardShell selected={!!selected} padding={0}>
      <a href={content.url} target="_blank" rel="noopener noreferrer" className="nodrag" style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
        {content.image_url && (
          <img src={content.image_url} alt="" style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: '7px 7px 0 0', display: 'block' }} draggable={false} />
        )}
        <div style={{ padding: 10 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: P.text, marginBottom: 3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {content.title ?? host}
          </div>
          {content.description && (
            <div style={{ fontSize: '0.7rem', color: P.text2, marginBottom: 4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {content.description}
            </div>
          )}
          <div style={{ fontSize: '0.66rem', color: P.accent }}>🔗 {host}</div>
        </div>
      </a>
    </CardShell>
  )
}
```

- [ ] **Step 3: Koble på i canvas**

`nodeTypes`: `link: LinkNode`. `ENABLED_TYPES` + `'link'`. I `onPaneClick`-intercepten: for `link`: `window.prompt('Lim inn lenke:')` → opprett kort umiddelbart med `content: { url }`, deretter fire-and-forget:

```ts
fetchLinkMetadata(url).then(meta => {
  markLocalOp(card.id)
  updateCardContent(card.id, meta)
  setNodes(ns => ns.map(n => n.id === card.id
    ? { ...n, data: { ...n.data, card: { ...n.data.card, content: meta } } }
    : n))
})
```

- [ ] **Step 4: Typecheck + lint + manuell verifisering**

Run: `npx tsc --noEmit && npm run lint`
Manuelt: lim inn en artikkelside → tittel/beskrivelse/bilde dukker opp etter ~1 s; lim inn en død URL (`https://finnes-ikke-abc123.no`) → kortet viser bare hostname; klikk åpner ny fane.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/boards.ts components/boards
git commit -m "feat: lenkekort med og:-metadata og fallback til hostname"
```

---

### Task 8: Farge- og to-do-kort

**Files:**
- Create: `components/boards/nodes/ColorNode.tsx`
- Create: `components/boards/nodes/TodoNode.tsx`
- Modify: `components/boards/nodes/index.ts`, `components/boards/BoardCanvas.tsx` (`ENABLED_TYPES` + `'color', 'todo'` — begge bruker `defaultContent`, ingen intercept)

**Interfaces:**
- Consumes: `updateCardContent` fra Task 3.

- [ ] **Step 1: `components/boards/nodes/ColorNode.tsx`**

```tsx
'use client'

import { useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { ColorContent } from '@/lib/types'
import { updateCardContent } from '@/lib/actions/boards'
import { useBoardUi } from '../boardContext'
import CardShell from './CardShell'
import type { CardNode } from '../toFlow'

export default function ColorNode({ id, data, selected }: NodeProps<CardNode>) {
  const { palette: P, readOnly, markLocalOp } = useBoardUi()
  const content = data.card.content as ColorContent
  const [hex, setHex] = useState(content.hex)

  const save = (value: string) => {
    setHex(value)
    content.hex = value
    markLocalOp(id)
    updateCardContent(id, { hex: value })
  }

  return (
    <CardShell selected={!!selected} padding={6}>
      <div style={{ position: 'relative', width: '100%', height: 90, borderRadius: 5, background: hex, border: `1px solid ${P.border}` }}>
        {!readOnly && (
          <input
            type="color"
            className="nodrag"
            value={hex}
            onChange={e => setHex(e.target.value)}
            onBlur={e => save(e.target.value)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
          />
        )}
      </div>
      <div style={{ marginTop: 6, fontSize: '0.72rem', color: P.text2, textAlign: 'center', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{hex}</div>
    </CardShell>
  )
}
```

- [ ] **Step 2: `components/boards/nodes/TodoNode.tsx`**

```tsx
'use client'

import { useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { TodoContent, TodoItem } from '@/lib/types'
import { updateCardContent } from '@/lib/actions/boards'
import { useBoardUi } from '../boardContext'
import CardShell from './CardShell'
import type { CardNode } from '../toFlow'

export default function TodoNode({ id, data, selected }: NodeProps<CardNode>) {
  const { palette: P, readOnly, markLocalOp } = useBoardUi()
  const initial = data.card.content as TodoContent
  const [items, setItems] = useState<TodoItem[]>(initial.items ?? [])
  const [title, setTitle] = useState(initial.title ?? '')
  const [newText, setNewText] = useState('')

  const persist = (nextItems: TodoItem[], nextTitle = title) => {
    setItems(nextItems)
    const content: TodoContent = { title: nextTitle || undefined, items: nextItems }
    data.card.content = content
    markLocalOp(id)
    updateCardContent(id, content)
  }

  return (
    <CardShell selected={!!selected}>
      <input
        className="nodrag"
        value={title}
        readOnly={readOnly}
        placeholder="To-do"
        onChange={e => setTitle(e.target.value)}
        onBlur={() => persist(items)}
        style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: P.text, fontSize: '0.82rem', fontWeight: 700, marginBottom: 6 }}
      />
      {items.map(item => (
        <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0' }}>
          <input
            type="checkbox"
            className="nodrag"
            checked={item.checked}
            disabled={readOnly}
            onChange={() => persist(items.map(i => i.id === item.id ? { ...i, checked: !i.checked } : i))}
            style={{ accentColor: P.accent, cursor: 'pointer' }}
          />
          <span style={{ flex: 1, fontSize: '0.78rem', color: item.checked ? P.text2 : P.text, textDecoration: item.checked ? 'line-through' : 'none' }}>
            {item.text}
          </span>
          {!readOnly && (
            <button
              className="nodrag"
              onClick={() => persist(items.filter(i => i.id !== item.id))}
              style={{ background: 'none', border: 'none', color: P.text2, cursor: 'pointer', fontSize: '0.7rem' }}
            >✕</button>
          )}
        </div>
      ))}
      {!readOnly && (
        <input
          className="nodrag"
          value={newText}
          placeholder="+ Legg til punkt"
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && newText.trim()) {
              persist([...items, { id: crypto.randomUUID(), text: newText.trim(), checked: false }])
              setNewText('')
            }
          }}
          style={{ width: '100%', marginTop: 6, background: P.surface2, border: `1px solid ${P.border}`, borderRadius: 5, padding: '5px 8px', color: P.text, fontSize: '0.75rem', outline: 'none' }}
        />
      )}
    </CardShell>
  )
}
```

- [ ] **Step 3: Registrer + verifiser + commit**

`nodeTypes` + `color: ColorNode, todo: TodoNode`; `ENABLED_TYPES` + `'color', 'todo'`.
Run: `npx tsc --noEmit && npm run lint`. Manuelt: fargekort med fargevelger (verdi bevares etter refresh); todo med add/check/delete av punkter.

```bash
git add components/boards
git commit -m "feat: farge- og todo-kort"
```

---

### Task 9: Kolonner med stabling

**Files:**
- Create: `components/boards/nodes/ColumnNode.tsx`
- Create: `components/boards/columnLayout.ts`
- Modify: `components/boards/nodes/index.ts`, `components/boards/BoardCanvas.tsx`

**Interfaces:**
- Produces: `restackColumn(columnId: string, nodes: CardNode[], getHeight: (n: CardNode) => number): { nodes: CardNode[]; patches: CardPositionPatch[] }` fra `columnLayout.ts`.

- [ ] **Step 1: `components/boards/columnLayout.ts`**

```ts
import type { CardPositionPatch } from '@/lib/actions/boards'
import { COLUMN_GAP, COLUMN_HEADER, COLUMN_PAD, type CardNode } from './toFlow'

/**
 * Stabler barna til en kolonne vertikalt (sortert på nåværende y) og setter
 * kolonnens høyde. Returnerer nye node-objekter + patches for persistering.
 */
export function restackColumn(
  columnId: string,
  nodes: CardNode[],
  getHeight: (n: CardNode) => number
): { nodes: CardNode[]; patches: CardPositionPatch[] } {
  const children = nodes
    .filter(n => n.parentId === columnId)
    .sort((a, b) => a.position.y - b.position.y)

  const patches: CardPositionPatch[] = []
  const updated = new Map<string, CardNode>()
  let y = COLUMN_HEADER + COLUMN_GAP

  children.forEach((ch, i) => {
    updated.set(ch.id, { ...ch, position: { x: COLUMN_PAD, y } })
    patches.push({ id: ch.id, x: COLUMN_PAD, y, column_id: columnId, sort_order: i })
    y += getHeight(ch) + COLUMN_GAP
  })

  const height = Math.max(140, y + COLUMN_PAD)
  return {
    nodes: nodes.map(n => {
      if (updated.has(n.id)) return updated.get(n.id)!
      if (n.id === columnId) return { ...n, style: { ...n.style, height } }
      return n
    }),
    patches,
  }
}
```

- [ ] **Step 2: `components/boards/nodes/ColumnNode.tsx`**

```tsx
'use client'

import { useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { ColumnContent } from '@/lib/types'
import { updateCardContent } from '@/lib/actions/boards'
import { useBoardUi } from '../boardContext'
import type { CardNode } from '../toFlow'

export default function ColumnNode({ id, data, selected }: NodeProps<CardNode>) {
  const { palette: P, readOnly, markLocalOp } = useBoardUi()
  const content = data.card.content as ColumnContent
  const [title, setTitle] = useState(content.title)

  const save = () => {
    const t = title.trim() || 'Kolonne'
    setTitle(t)
    if (t !== content.title) {
      content.title = t
      markLocalOp(id)
      updateCardContent(id, { title: t })
    }
  }

  return (
    <div style={{
      width: '100%', height: '100%', minHeight: 140,
      background: `${P.surface}99`,
      border: `1px ${selected ? 'solid' : 'dashed'} ${selected ? P.accent : P.border}`,
      borderRadius: 10, fontFamily: 'var(--font-dm-sans)',
    }}>
      <input
        className="nodrag"
        value={title}
        readOnly={readOnly}
        onChange={e => setTitle(e.target.value)}
        onBlur={save}
        onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: P.text, fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '12px 12px 4px', textAlign: 'center' }}
      />
    </div>
  )
}
```

- [ ] **Step 3: Kolonnelogikk i `BoardCanvas.tsx`**

1. `nodeTypes` + `column: ColumnNode`; `ENABLED_TYPES` + `'column'`.
2. Hjelpere i `Canvas`:

```ts
const nodeHeight = useCallback((n: CardNode) => n.measured?.height ?? 100, [])
const absPos = useCallback((nodeId: string) => {
  const internal = rf.getInternalNode(nodeId)
  return internal ? internal.internals.positionAbsolute : { x: 0, y: 0 }
}, [rf])
```

3. Utvid `onNodeDragStop` — full erstatning:

```ts
const onNodeDragStop: OnNodeDrag<CardNode> = useCallback((_e, node, dragged) => {
  const moved = (dragged.length > 0 ? dragged : [node]) as CardNode[]
  let next = rf.getNodes() as CardNode[]
  const patches: CardPositionPatch[] = []
  const dirtyColumns = new Set<string>()

  for (const m of moved) {
    const current = next.find(n => n.id === m.id)
    if (!current) continue
    const type = current.data.card.type
    const canJoinColumn = type !== 'column' && type !== 'board'

    const intersectingColumn = canJoinColumn
      ? (rf.getIntersectingNodes(current) as CardNode[]).find(n => n.data.card.type === 'column')
      : undefined

    if (intersectingColumn && current.parentId !== intersectingColumn.id) {
      // Fest til kolonne: posisjon relativt til kolonnen, restack etterpå
      const a = absPos(current.id)
      const colA = absPos(intersectingColumn.id)
      next = next.map(n => n.id === current.id ? {
        ...n,
        parentId: intersectingColumn.id,
        extent: 'parent' as const,
        position: { x: a.x - colA.x, y: a.y - colA.y },
        style: { ...n.style, width: COLUMN_WIDTH - COLUMN_PAD * 2 },
      } : n)
      dirtyColumns.add(intersectingColumn.id)
      if (current.parentId) dirtyColumns.add(current.parentId)
    } else if (current.parentId && !intersectingColumn) {
      // Dratt ut av kolonnen: tilbake til absolutt posisjon
      const a = absPos(current.id)
      next = next.map(n => n.id === current.id ? {
        ...n,
        parentId: undefined,
        extent: undefined,
        position: a,
        style: { ...n.style, width: current.data.card.width ?? CARD_WIDTH },
      } : n)
      patches.push({ id: current.id, x: a.x, y: a.y, column_id: null, sort_order: 0 })
      dirtyColumns.add(current.parentId)
    } else if (current.data.card.type === 'column') {
      patches.push({ id: current.id, x: current.position.x, y: current.position.y })
    } else {
      patches.push({
        id: current.id, x: current.position.x, y: current.position.y,
        z_index: current.data.card.z_index,
        ...(current.parentId ? { column_id: current.parentId } : {}),
      })
    }
  }

  for (const colId of dirtyColumns) {
    const result = restackColumn(colId, next, nodeHeight)
    next = result.nodes
    result.patches.forEach(p => {
      const idx = patches.findIndex(q => q.id === p.id)
      if (idx >= 0) patches[idx] = { ...patches[idx], ...p }
      else patches.push(p)
    })
  }

  setNodes(next)
  if (patches.length) persist(patches)
}, [rf, absPos, nodeHeight, persist, setNodes])
```

4. `extent: 'parent'` gjør at kort i kolonne må dras raskt ut? Nei — `extent: 'parent'` LÅSER kortet inne. For å kunne dra ut: IKKE sett `extent` ved attach og fjern `extent: 'parent'` fra `cardToNode` i `toFlow.ts` (behold kun `parentId`). Gjør den endringen i `toFlow.ts` i denne tasken.
5. Etter innlasting må kolonnehøyder beregnes: legg i `Canvas` en `useEffect` som kjører én gang etter første måling:

```ts
const restackedOnce = useRef(false)
useEffect(() => {
  if (restackedOnce.current) return
  const all = rf.getNodes() as CardNode[]
  if (all.some(n => !n.measured?.height)) return // vent til målt
  restackedOnce.current = true
  let next = all
  for (const col of all.filter(n => n.data.card.type === 'column')) {
    next = restackColumn(col.id, next, nodeHeight).nodes // uten persist — bare visuelt
  }
  setNodes(next)
}, [nodes, rf, nodeHeight, setNodes])
```

- [ ] **Step 4: Typecheck + lint + manuell verifisering**

Run: `npx tsc --noEmit && npm run lint`
Manuelt: opprett kolonne; dra tre notater inn → de stables pent og kolonnen vokser; dra ett ut → fri plassering igjen; dra kolonnen → innholdet følger med; endre rekkefølge ved å slippe et kort mellom to andre; refresh → stabling og rekkefølge bevart; slett kolonnen → kortene ligger løst ved kolonnens plass (deleteBoardCards-logikken fra Task 3).

- [ ] **Step 5: Commit**

```bash
git add components/boards
git commit -m "feat: kolonner med stabling og dra inn/ut"
```

---

### Task 10: Nestede boards

**Files:**
- Create: `components/boards/nodes/BoardNode.tsx`
- Modify: `components/boards/nodes/index.ts`, `components/boards/BoardCanvas.tsx`

**Interfaces:**
- Consumes: `createSubBoard` fra Task 3, `onOpenBoard`-prop fra Task 4.

- [ ] **Step 1: `components/boards/nodes/BoardNode.tsx`**

```tsx
'use client'

import type { NodeProps } from '@xyflow/react'
import type { BoardRefContent } from '@/lib/types'
import { useBoardUi } from '../boardContext'
import CardShell from './CardShell'
import type { CardNode } from '../toFlow'

export default function BoardNode({ data, selected }: NodeProps<CardNode>) {
  const { palette: P } = useBoardUi()
  const content = data.card.content as BoardRefContent
  const count = data.meta?.cardCount
  return (
    <CardShell selected={!!selected}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: P.accent + '22', border: `1px solid ${P.accent}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: P.accent, fontSize: '1rem', flexShrink: 0 }}>▦</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: P.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {data.meta?.title ?? content.title}
          </div>
          <div style={{ fontSize: '0.68rem', color: P.text2 }}>
            {count !== undefined ? `${count} kort` : 'Underboard'} · dobbeltklikk for å åpne
          </div>
        </div>
      </div>
    </CardShell>
  )
}
```

- [ ] **Step 2: Koble på i canvas**

1. `nodeTypes` + `board: BoardNode`; `ENABLED_TYPES` + `'board'`.
2. `onPaneClick`-intercept for `board`: `const title = window.prompt('Navn på nytt board:')` → `createSubBoard(boardId, title.trim(), pos.x, pos.y)` → `markLocalOp(card.id)` + legg til node (`data.meta = { title, cardCount: 0 }`).
3. Dobbeltklikk åpner: legg på `<ReactFlow onNodeDoubleClick={(_e, n) => { const c = (n as CardNode).data.card; if (c.type === 'board') onOpenBoard((c.content as BoardRefContent).child_board_id) }}>`.
4. Bekreftelse ved sletting — utvid `onBeforeDelete`:

```ts
const onBeforeDelete: OnBeforeDelete<CardNode, Edge> = useCallback(async ({ nodes: delNodes, edges: delEdges }) => {
  if (readOnly) return false
  const boardCards = delNodes.filter(n => n.data.card.type === 'board')
  if (boardCards.length > 0) {
    const names = boardCards.map(n => (n.data.card.content as BoardRefContent).title).join(', ')
    if (!window.confirm(`Slette underboard(ene) «${names}» med alt innhold? Dette kan ikke angres.`)) return false
  }
  return { nodes: delNodes, edges: delEdges }
}, [readOnly])
```

- [ ] **Step 3: Typecheck + lint + manuell verifisering**

Run: `npx tsc --noEmit && npm run lint`
Manuelt: opprett underboard → dobbeltklikk inn → brødsmulesti viser `Prosjekt / Rotboard / Underboard`; legg kort der; tilbake via brødsmule; board-kortet viser riktig antall etter refresh; gi boardet nytt navn inne på det → foreldre-boardets kort viser nytt navn etter refresh; slett board-kortet → bekreftelsesdialog → underboard borte (sjekk at `/admin/boards/<slettet-id>` gir 404).

- [ ] **Step 4: Commit**

```bash
git add components/boards
git commit -m "feat: nestede boards med brødsmulesti og trygg sletting"
```

---

### Task 11: Piler mellom kort

**Files:**
- Modify: `components/boards/BoardCanvas.tsx`

**Interfaces:**
- Consumes: `createBoardEdge`, `updateBoardEdgeLabel`, `deleteBoardEdges` fra Task 3 (delete er allerede koblet i Task 4).

- [ ] **Step 1: Aktiver tilkobling**

I `<ReactFlow>`: `nodesConnectable={!readOnly}`, og legg til `defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: palette.border, strokeWidth: 1.5 } }}` samt:

```ts
const onConnect = useCallback(async (conn: Connection) => {
  if (!conn.source || !conn.target || conn.source === conn.target) return
  const edge = await createBoardEdge({ board_id: boardId, from_card_id: conn.source, to_card_id: conn.target })
  if (!edge) { setSaveError('Kunne ikke lagre pilen'); return }
  markLocalOp(edge.id)
  setEdges(es => [...es, edgeToFlow(edge)])
}, [boardId, setEdges, markLocalOp])

const onEdgeDoubleClick = useCallback((_e: React.MouseEvent, edge: Edge) => {
  if (readOnly) return
  const label = window.prompt('Tekst på pilen (tom for å fjerne):', (edge.label as string) ?? '')
  if (label === null) return
  markLocalOp(edge.id)
  updateBoardEdgeLabel(edge.id, label.trim() || null)
  setEdges(es => es.map(e => e.id === edge.id ? { ...e, label: label.trim() || undefined } : e))
}, [readOnly, setEdges, markLocalOp])
```

(Importer `Connection`, `MarkerType` og `edgeToFlow`; `onConnect={onConnect}` og `onEdgeDoubleClick={onEdgeDoubleClick}` på `<ReactFlow>`.)

- [ ] **Step 2: Typecheck + lint + manuell verifisering**

Run: `npx tsc --noEmit && npm run lint`
Manuelt: dra fra høyre håndtak på ett kort til venstre håndtak på et annet → pil med spiss; dobbeltklikk → label; marker pil + Delete → borte; alt bevart etter refresh.

- [ ] **Step 3: Commit**

```bash
git add components/boards
git commit -m "feat: piler mellom kort med labels"
```

---

### Task 12: Realtime

**Files:**
- Create: `hooks/useBoardRealtime.ts`
- Modify: `components/boards/BoardCanvas.tsx`

**Interfaces:**
- Produces: `useBoardRealtime(boardId, opts)` — se koden; brukes kun av `BoardCanvas`.

- [ ] **Step 1: `hooks/useBoardRealtime.ts`**

```ts
'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase-client'
import type { BoardCard, BoardEdge } from '@/lib/types'

type Evt = 'INSERT' | 'UPDATE' | 'DELETE'

export function useBoardRealtime(boardId: string, opts: {
  enabled: boolean
  isLocalOp: (rowId: string) => boolean
  onCard: (evt: Evt, row: Partial<BoardCard> & { id: string }) => void
  onEdge: (evt: Evt, row: Partial<BoardEdge> & { id: string }) => void
}) {
  const { enabled, isLocalOp, onCard, onEdge } = opts
  useEffect(() => {
    if (!enabled) return
    const channel = supabase
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
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // onCard/onEdge er stabile via useCallback i BoardCanvas
  }, [boardId, enabled, isLocalOp, onCard, onEdge])
}
```

- [ ] **Step 2: Koble på i `BoardCanvas.tsx`**

```ts
const onRemoteCard = useCallback((evt: 'INSERT' | 'UPDATE' | 'DELETE', row: Partial<BoardCard> & { id: string }) => {
  if (evt === 'DELETE') {
    setNodes(ns => ns.filter(n => n.id !== row.id))
    return
  }
  const card = row as BoardCard
  setNodes(ns => {
    const exists = ns.some(n => n.id === card.id)
    const fresh = cardToNode(card, initial.childMeta)
    if (card.type === 'board' && !initial.childMeta[(card.content as BoardRefContent).child_board_id]) {
      fresh.data.meta = { title: (card.content as BoardRefContent).title, cardCount: 0 }
    }
    if (!exists) return [...ns, fresh]
    return ns.map(n => n.id === card.id ? { ...fresh, selected: n.selected } : n)
  })
}, [setNodes, initial.childMeta])

const onRemoteEdge = useCallback((evt: 'INSERT' | 'UPDATE' | 'DELETE', row: Partial<BoardEdge> & { id: string }) => {
  if (evt === 'DELETE') { setEdges(es => es.filter(e => e.id !== row.id)); return }
  const edge = row as BoardEdge
  setEdges(es => {
    const flow = edgeToFlow(edge)
    return es.some(e => e.id === edge.id) ? es.map(e => e.id === edge.id ? flow : e) : [...es, flow]
  })
}, [setEdges])

useBoardRealtime(boardId, { enabled: !readOnly, isLocalOp, onCard: onRemoteCard, onEdge: onRemoteEdge })
```

Merk: etter remote-endringer på kort i kolonner vil stablingen justeres av samme `useEffect`-restack som i Task 9 — sett `restackedOnce.current = false` i `onRemoteCard` når `card.column_id` er satt, slik at kolonnen restackes visuelt.

- [ ] **Step 3: Typecheck + lint + manuell verifisering**

Run: `npx tsc --noEmit && npm run lint`
Manuelt: to browservinduer på samme board (samme bruker er ok). Opprett/flytt/rediger/slett kort i vindu A → dukker opp i vindu B innen ~2 s. Dra et kort i A → det hopper IKKE tilbake i A (localOps-filteret). Piler synker begge veier.

- [ ] **Step 4: Commit**

```bash
git add hooks/useBoardRealtime.ts components/boards
git commit -m "feat: realtime-sync av boards via supabase postgres_changes"
```

---

### Task 13: Deling — /b/[token]

**Files:**
- Modify: `lib/actions/boards.ts` (share-actions + `getSharedBoard`)
- Create: `components/boards/ShareDialog.tsx`
- Modify: `app/admin/boards/[boardId]/BoardPageClient.tsx` (Del-knapp)
- Create: `app/b/[token]/page.tsx`
- Create: `app/b/[token]/SharedBoardClient.tsx`

**Interfaces:**
- Produces:

```ts
export async function enableBoardShare(boardId: string): Promise<string | null>  // returnerer token
export async function disableBoardShare(boardId: string): Promise<boolean>
export type SharedBoardData = Omit<BoardData, 'projectId' | 'projectTitle'> & { rootBoardId: string }
export async function getSharedBoard(token: string, childBoardId?: string): Promise<SharedBoardData | null>
```

- [ ] **Step 1: Actions i `lib/actions/boards.ts`**

```ts
import { randomBytes } from 'crypto'
import { createServiceClient } from '@/lib/supabase-server'  // utvid eksisterende import

export async function enableBoardShare(boardId: string): Promise<string | null> {
  try {
    const supabase = await createClient()
    const { data: existing } = await supabase.from('boards').select('share_token').eq('id', boardId).single()
    if (existing?.share_token) return existing.share_token
    const token = randomBytes(16).toString('hex')
    const { error } = await supabase.from('boards')
      .update({ share_token: token, updated_at: now() }).eq('id', boardId)
    return error ? null : token
  } catch (err) {
    console.error('enableBoardShare:', err)
    return null
  }
}

export async function disableBoardShare(boardId: string): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('boards')
      .update({ share_token: null, updated_at: now() }).eq('id', boardId)
    return !error
  } catch (err) {
    console.error('disableBoardShare:', err)
    return false
  }
}

export type SharedBoardData = Omit<BoardData, 'projectId' | 'projectTitle'> & { rootBoardId: string }

export async function getSharedBoard(token: string, childBoardId?: string): Promise<SharedBoardData | null> {
  try {
    if (!token || token.length < 16) return null
    const service = createServiceClient()

    const { data: root } = await service.from('boards').select('*').eq('share_token', token).single()
    if (!root) return null

    // Hvilket board skal vises? Rot, eller et underboard som må ligge i rotens tre.
    let target = root as Board
    if (childBoardId && childBoardId !== root.id) {
      const { data: child } = await service.from('boards').select('*').eq('id', childBoardId).single()
      if (!child) return null
      let cursor: Board | null = child as Board
      let ok = false
      let guard = 0
      while (cursor && guard++ < 20) {
        if (cursor.id === root.id) { ok = true; break }
        if (!cursor.parent_board_id) break
        const { data: parent } = await service.from('boards').select('*').eq('id', cursor.parent_board_id).single()
        cursor = parent as Board | null
      }
      if (!ok) return null
      target = child as Board
    }

    const [{ data: cards }, { data: edges }] = await Promise.all([
      service.from('board_cards').select('*').eq('board_id', target.id).order('z_index'),
      service.from('board_edges').select('*').eq('board_id', target.id),
    ])

    // Brødsmuler begrenset til det delte treet (stopp ved root)
    const crumbs = [{ id: target.id, title: target.title }]
    let parentId = target.id === root.id ? null : target.parent_board_id
    let guard2 = 0
    while (parentId && guard2++ < 20) {
      const { data: p } = await service.from('boards').select('id, title, parent_board_id').eq('id', parentId).single()
      if (!p) break
      crumbs.unshift({ id: p.id, title: p.title })
      if (p.id === root.id) break
      parentId = p.parent_board_id
    }

    const childMeta: Record<string, ChildBoardMeta> = {}
    const childIds = ((cards ?? []) as BoardCard[])
      .filter(c => c.type === 'board')
      .map(c => (c.content as BoardRefContent).child_board_id)
    if (childIds.length) {
      const [{ data: children }, { data: counts }] = await Promise.all([
        service.from('boards').select('id, title').in('id', childIds),
        service.from('board_cards').select('board_id').in('board_id', childIds),
      ])
      for (const ch of children ?? []) childMeta[ch.id] = { title: ch.title, cardCount: 0 }
      for (const row of counts ?? []) if (childMeta[row.board_id]) childMeta[row.board_id].cardCount++
    }

    return {
      board: target,
      cards: (cards ?? []) as BoardCard[],
      edges: (edges ?? []) as BoardEdge[],
      breadcrumbs: crumbs,
      childMeta,
      rootBoardId: root.id,
    }
  } catch (err) {
    console.error('getSharedBoard:', err)
    return null
  }
}
```

- [ ] **Step 2: `components/boards/ShareDialog.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { C } from '@/lib/admin-theme'
import { enableBoardShare, disableBoardShare } from '@/lib/actions/boards'

export default function ShareDialog({ boardId, initialToken, onClose }: {
  boardId: string
  initialToken: string | null
  onClose: () => void
}) {
  const [token, setToken] = useState(initialToken)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const url = token ? `${window.location.origin}/b/${token}` : null

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 420, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, fontFamily: 'var(--font-dm-sans)' }}>
        <h3 style={{ color: C.text, fontSize: '1rem', fontWeight: 700, marginBottom: 6 }}>Del board</h3>
        <p style={{ color: C.text2, fontSize: '0.78rem', marginBottom: 16 }}>
          Alle med lenken kan se boardet og underboards — men ikke redigere.
        </p>
        {url ? (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input readOnly value={url} style={{ flex: 1, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 10px', color: C.text, fontSize: '0.75rem', outline: 'none' }} />
              <button
                onClick={() => { navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 7, padding: '8px 14px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
              >{copied ? 'Kopiert ✓' : 'Kopier'}</button>
            </div>
            <button
              disabled={busy}
              onClick={async () => { setBusy(true); if (await disableBoardShare(boardId)) setToken(null); setBusy(false) }}
              style={{ background: 'transparent', color: C.danger, border: `1px solid ${C.danger}55`, borderRadius: 7, padding: '8px 14px', fontSize: '0.75rem', cursor: 'pointer' }}
            >Slå av deling</button>
          </>
        ) : (
          <button
            disabled={busy}
            onClick={async () => { setBusy(true); setToken(await enableBoardShare(boardId)); setBusy(false) }}
            style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 7, padding: '9px 16px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}
          >{busy ? 'Genererer …' : 'Lag delingslenke'}</button>
        )}
      </div>
    </div>
  )
}
```

I `BoardPageClient.tsx`: legg til state `const [shareOpen, setShareOpen] = useState(false)`, en «Del»-knapp der Task 4 la kommentaren (stil som BoardsButton fra Task 5), og `{shareOpen && <ShareDialog boardId={initial.board.id} initialToken={initial.board.share_token} onClose={() => setShareOpen(false)} />}`.

- [ ] **Step 3: `app/b/[token]/page.tsx` + `SharedBoardClient.tsx`**

```tsx
// page.tsx
import { notFound } from 'next/navigation'
import { getSharedBoard } from '@/lib/actions/boards'
import SharedBoardClient from './SharedBoardClient'

export default async function SharedBoardPage({ params, searchParams }: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ board?: string }>
}) {
  const { token } = await params
  const { board } = await searchParams
  const data = await getSharedBoard(token, board)
  if (!data) notFound()
  return <SharedBoardClient token={token} data={data} />
}
```

```tsx
// SharedBoardClient.tsx
'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { S } from '@/lib/client-theme'
import type { SharedBoardData } from '@/lib/actions/boards'
import BoardCanvas from '@/components/boards/BoardCanvas'
import type { BoardPalette } from '@/components/boards/boardContext'

const CINEMATIC_PALETTE: BoardPalette = {
  surface: S.surface2, surface2: S.surface3, border: S.border,
  text: S.text, text2: S.text2, accent: S.gold, canvasBg: S.bg,
}

export default function SharedBoardClient({ token, data }: { token: string; data: SharedBoardData }) {
  const router = useRouter()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: S.bg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px', borderBottom: `1px solid ${S.border}` }}>
        <span style={{ fontFamily: 'var(--font-cormorant)', color: S.gold, fontSize: '1.05rem', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Leafilms</span>
        <span style={{ color: S.text3 }}>·</span>
        {data.breadcrumbs.map((b, i) => (
          <span key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem' }}>
            {i > 0 && <span style={{ color: S.text3 }}>/</span>}
            {i === data.breadcrumbs.length - 1
              ? <span style={{ color: S.text, fontWeight: 600 }}>{b.title}</span>
              : <Link href={b.id === data.rootBoardId ? `/b/${token}` : `/b/${token}?board=${b.id}`} style={{ color: S.text2, textDecoration: 'none' }}>{b.title}</Link>}
          </span>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <BoardCanvas
          boardId={data.board.id}
          initial={{ ...data, projectId: '', projectTitle: '' }}
          readOnly
          palette={CINEMATIC_PALETTE}
          onOpenBoard={id => router.push(`/b/${token}?board=${id}`)}
        />
      </div>
    </div>
  )
}
```

Merk: `BoardCanvas` i readOnly må fortsatt tillate dobbeltklikk-navigasjon på board-kort (`onNodeDoubleClick` skal IKKE gates på `readOnly`) og lightbox på bilder — men ingen editering (nodene leser `readOnly` fra context). Sjekk at `onPaneClick` og alle persist-veier allerede er gated (`if (!pendingType || readOnly) return` osv.) — Toolbar rendres ikke i readOnly.

Sjekk også `middleware.ts`: `/b`-ruten må være offentlig (ikke bak auth) — se hvordan `/s`, `/v`, `/d` er unntatt og legg `/b` til på samme måte.

- [ ] **Step 4: Typecheck + lint + manuell verifisering**

Run: `npx tsc --noEmit && npm run lint`
Manuelt: Del-knapp → lenke → åpne i inkognito: cinematisk visning, pan/zoom ok, ingen toolbar, ingen dra-mulighet, dobbeltklikk på board-kort navigerer (`?board=`), brødsmuler tilbake; prøv `?board=<id fra ANNET prosjekt>` → 404; «Slå av deling» → lenken gir 404; tilfeldig token `/b/abc` → 404.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/boards.ts components/boards app/b app/admin/boards middleware.ts
git commit -m "feat: offentlig read-only delingslenke for boards (/b/[token])"
```

---

### Task 14: Full E2E-verifisering + opprydding

**Files:**
- Modify: `CLAUDE.md` (kort omtale av boards-modulen under «Hva vi bygger» hvis naturlig; oppdater migrasjonsnummer-linjen til «neste er 099»)

- [ ] **Step 1: Kjør hele testsjekklisten fra spec-en på testprosjektet**

1. Opprett rotboard fra preprod-siden ✓
2. Alle åtte kort-typer: opprett, rediger, flytt, slett ✓
3. Kolonne-stabling inn/ut, storyboard-flyt (kolonne med 3+ bilder og beskrivelser) ✓
4. Piler mellom kort, med label ✓
5. Underboard: opprett, naviger inn/ut, gi nytt navn, slett med bekreftelse ✓
6. Realtime: to vinduer, endringer flyter begge veier uten hopping ✓
7. Deling: lenke i inkognito, read-only + underboard-navigering, deaktivering → 404 ✓
8. `npm run build` fullfører uten feil ✓

- [ ] **Step 2: Rydd testdata**

Slett alle boards på testprosjektet (`DELETE FROM boards WHERE project_id = '<testprosjekt-id>'` — cascade tar resten), og filer i `board-images`-bucketen fra testen (Supabase dashboard eller `supabase.storage.from('board-images').remove(...)`).

- [ ] **Step 3: Siste commit**

```bash
git add CLAUDE.md
git commit -m "docs: boards-modul ferdig, oppdater migrasjonsteller"
```

---

## Self-review-notater (utført ved planskriving)

- **Spec-dekning:** alle spec-punkter har task (kort-typer T4/6/7/8, kolonner T9, nestede boards T10, piler T11, realtime T12, deling T13, preprod-inngang T5, migrasjon/RLS/bucket T1, feilhåndtering i T4/6/7, testing T14). Avvik fra spec: `BoardRefContent` har fått denormalisert `title` (forenkler realtime og delingsvisning; holdes i sync av `renameBoard`) — dokumentert i typen.
- **Kjente friksjonpunkter for implementør:** React Flow v12-typenavn (`OnBeforeDelete`, `NodeProps<CardNode>`, `getInternalNode(...).internals.positionAbsolute`) kan avvike i minor-versjoner — verifiser mot installert versjon og juster, semantikk står fast. `extent: 'parent'` skal IKKE brukes (låser kort inne i kolonner, se Task 9 step 3.4).
