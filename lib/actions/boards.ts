'use server'

import { randomBytes } from 'crypto'
import { createClient, createServiceClient } from '@/lib/supabase-server'
import type { Board, BoardCard, BoardCardContent, BoardCardType, BoardEdge, BoardRefContent, LinkContent } from '@/lib/types'
import { getBoardComments, type BoardCommentsByCard } from '@/lib/actions/boardComments'

export type ChildBoardMeta = { title: string; cardCount: number }

export type BoardLeadProfile = { id: string; name: string | null; email: string; color: string | null; phone: string | null }
export type BoardCustomerContact = { id: string; name: string; role: string | null; phone: string | null }

export type BoardData = {
  board: Board
  cards: BoardCard[]
  edges: BoardEdge[]
  breadcrumbs: { id: string; title: string }[]
  projectId: string
  projectTitle: string
  projectCustomerId: string | null
  customerName: string
  leadProfile: BoardLeadProfile | null
  customerContact: BoardCustomerContact | null
  childMeta: Record<string, ChildBoardMeta>
  // Prosjektinfo til sidepanelet — hentet direkte fra prosjektet, ikke lagret som kort.
  projectSummary: string | null
  deliveryDescription: string | null
  shootStart: string | null
  shootEnd: string | null
  // Fraværende (undefined) for delt/offentlig board-visning (getSharedBoard) —
  // kommentarer er internt-only (se 2026-07-22-board-comments-design.md).
  comments?: BoardCommentsByCard
}

export type CardPositionPatch = {
  id: string; x: number; y: number
  z_index?: number; column_id?: string | null; sort_order?: number; width?: number | null
}

const now = () => new Date().toISOString()

// Samme tall som COLUMN_WIDTH/COLUMN_PAD/COLUMN_HEADER/COLUMN_GAP i components/boards/toFlow.ts —
// duplisert (i stedet for importert) for å unngå en sirkulær import (toFlow.ts importerer
// allerede ChildBoardMeta herfra, og bruker @xyflow/react som ikke skal inn i server-bundlen).
const INFO_COLUMN_WIDTH = 280
const INFO_COLUMN_PAD = 10
const INFO_COLUMN_HEADER = 44
const INFO_COLUMN_GAP = 8

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
    .filter(c => c.type === 'board' || c.type === 'storyline')
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

    const [{ data: cards }, { data: edges }, { data: project }, { data: leadProfile }, { data: customerContact }, comments] = await Promise.all([
      supabase.from('board_cards').select('*').eq('board_id', boardId).order('z_index'),
      supabase.from('board_edges').select('*').eq('board_id', boardId),
      supabase.from('projects').select('id, title, customer_id, board_summary, delivery_description, shoot_start, shoot_end, customers(name, company)').eq('id', board.project_id).single(),
      board.lead_profile_id
        ? supabase.from('profiles').select('id, name, email, color, phone').eq('id', board.lead_profile_id).maybeSingle()
        : Promise.resolve({ data: null }),
      board.customer_contact_id
        ? supabase.from('customer_contacts').select('id, name, role, phone').eq('id', board.customer_contact_id).maybeSingle()
        : Promise.resolve({ data: null }),
      getBoardComments(boardId),
    ])
    const breadcrumbs = await buildBreadcrumbs(supabase, board)
    const childMeta = await loadChildMeta(supabase, (cards ?? []) as BoardCard[])
    const customer = (project as unknown as { customers?: { name: string | null; company: string | null } | null } | null)?.customers
    const proj = project as unknown as {
      customer_id?: string | null
      board_summary?: string | null
      delivery_description?: string | null
      shoot_start?: string | null
      shoot_end?: string | null
    } | null

    return {
      board: board as Board,
      cards: (cards ?? []) as BoardCard[],
      edges: (edges ?? []) as BoardEdge[],
      breadcrumbs,
      projectId: board.project_id,
      projectTitle: project?.title ?? '',
      projectCustomerId: proj?.customer_id ?? null,
      customerName: customer?.name || customer?.company || 'Ingen kunde satt',
      leadProfile: leadProfile as BoardLeadProfile | null,
      customerContact: customerContact as BoardCustomerContact | null,
      childMeta,
      projectSummary: proj?.board_summary?.trim() || null,
      deliveryDescription: proj?.delivery_description?.trim() || null,
      shootStart: proj?.shoot_start ?? null,
      shootEnd: proj?.shoot_end ?? null,
      comments,
    }
  } catch (err) {
    console.error('getBoardData:', err)
    return null
  }
}

export async function setBoardLead(boardId: string, profileId: string | null): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.from('boards').update({ lead_profile_id: profileId, updated_at: now() }).eq('id', boardId)
  } catch (err) {
    console.error('setBoardLead:', err)
  }
}

export async function setBoardCustomerContact(boardId: string, contactId: string | null): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase.from('boards').update({ customer_contact_id: contactId, updated_at: now() }).eq('id', boardId)
  } catch (err) {
    console.error('setBoardCustomerContact:', err)
  }
}

// Prosjektinfo-teksten i boardets sidepanel — vises også til kunden på delte boards
// (se PublicBoardInfoPanel), derfor egen fritekst-kolonne i stedet for den
// AI-genererte meeting_summary (som kan inneholde internt-only bakgrunnsinfo).
export async function updateBoardProjectSummary(projectId: string, summary: string | null): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase
      .from('projects')
      .update({ board_summary: summary, updated_at: now() })
      .eq('id', projectId)
  } catch (err) {
    console.error('updateBoardProjectSummary:', err)
  }
}

// Samme delivery_description som brukes i pipeline/tilbud (lib/actions/pipeline.ts sin
// updateProjectDeliveryInfo dekker også post_prod_days — unngår den her for ikke å
// nullstille post_prod_days ved lagring fra board-sidepanelet).
export async function updateBoardDeliveryDescription(projectId: string, description: string | null): Promise<void> {
  try {
    const supabase = await createClient()
    await supabase
      .from('projects')
      .update({ delivery_description: description, updated_at: now() })
      .eq('id', projectId)
  } catch (err) {
    console.error('updateBoardDeliveryDescription:', err)
  }
}

export type ScheduleCardPageData = {
  card: BoardCard
  boardId: string
  boardTitle: string
  projectId: string
  projectTitle: string
  customerName: string
  shootStart: string | null
  shootEnd: string | null
}

// Data for den dedikerte /admin/boards/[boardId]/schedule/[cardId]-siden — en enkelt
// schedule-korttype hentet ut for seg selv (i motsetning til getBoardData som henter
// alle kort på boardet), pluss prosjektkontekst til side-header og PDF-eksport.
export async function getScheduleCardData(cardId: string): Promise<ScheduleCardPageData | null> {
  try {
    const supabase = await createClient()
    const { data: card } = await supabase.from('board_cards').select('*').eq('id', cardId).single()
    if (!card || card.type !== 'schedule') return null

    const { data: board } = await supabase.from('boards').select('id, title, project_id').eq('id', card.board_id).single()
    if (!board) return null

    const { data: project } = await supabase
      .from('projects')
      .select('id, title, shoot_start, shoot_end, customers(name, company)')
      .eq('id', board.project_id)
      .single()
    const customer = (project as unknown as { customers?: { name: string | null; company: string | null } | null } | null)?.customers

    return {
      card: card as BoardCard,
      boardId: board.id,
      boardTitle: board.title,
      projectId: board.project_id,
      projectTitle: project?.title ?? '',
      customerName: customer?.name || customer?.company || 'Ingen kunde satt',
      shootStart: (project as { shoot_start?: string | null } | null)?.shoot_start ?? null,
      shootEnd: (project as { shoot_end?: string | null } | null)?.shoot_end ?? null,
    }
  } catch (err) {
    console.error('getScheduleCardData:', err)
    return null
  }
}

// Samme data som getScheduleCardData, men for /b/[token]/schedule/[cardId] — den
// offentlig delte, skrivebeskyttede timeplan-siden. Validerer share_token og at
// kortets board faktisk ligger i det delte treet, samme mønster som getSharedBoard.
export async function getSharedScheduleCard(token: string, cardId: string): Promise<ScheduleCardPageData | null> {
  try {
    if (!token || token.length < 16) return null
    const service = createServiceClient()

    const { data: root } = await service.from('boards').select('*').eq('share_token', token).single()
    if (!root) return null

    const { data: card } = await service.from('board_cards').select('*').eq('id', cardId).single()
    if (!card || card.type !== 'schedule') return null

    const { data: board } = await service.from('boards').select('id, title, project_id, parent_board_id').eq('id', card.board_id).single()
    if (!board) return null

    type BoardCursor = { id: string; parent_board_id: string | null }
    let cursor: BoardCursor | null = board
    let ok = cursor.id === root.id
    let guard = 0
    while (!ok && cursor?.parent_board_id && guard++ < 20) {
      const { data: parent } = await service.from('boards').select('id, parent_board_id').eq('id', cursor.parent_board_id).single()
      cursor = parent as BoardCursor | null
      if (cursor?.id === root.id) ok = true
    }
    if (!ok) return null

    const { data: project } = await service
      .from('projects')
      .select('id, title, shoot_start, shoot_end, customers(name, company)')
      .eq('id', root.project_id)
      .single()
    const customer = (project as unknown as { customers?: { name: string | null; company: string | null } | null } | null)?.customers

    return {
      card: card as BoardCard,
      boardId: board.id,
      boardTitle: board.title,
      projectId: board.project_id,
      projectTitle: project?.title ?? '',
      customerName: customer?.name || customer?.company || 'Ingen kunde satt',
      shootStart: (project as { shoot_start?: string | null } | null)?.shoot_start ?? null,
      shootEnd: (project as { shoot_end?: string | null } | null)?.shoot_end ?? null,
    }
  } catch (err) {
    console.error('getSharedScheduleCard:', err)
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

    // Board-/storyline-kort som slettes: slett underboardet (cascade tar kort/edges/underboards)
    const childBoardIds = cards
      .filter(c => c.type === 'board' || c.type === 'storyline')
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

export async function updateBoardEdgeEndpoints(id: string, from_card_id: string, to_card_id: string): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { error } = await supabase.from('board_edges').update({ from_card_id, to_card_id }).eq('id', id)
    return !error
  } catch (err) {
    console.error('updateBoardEdgeEndpoints:', err)
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

// ---------------------------------------------------------------------------
// Kopier/lim inn (Cmd/Ctrl+C/V) og angre sletting (Cmd/Ctrl+Z) av board-/
// storyline-kort — begge trenger å kunne klone et helt nøstet underboard
// (kort, piler, og eventuelt enda dypere nøstede underboards) rekursivt.
// snapshotBoardTree leser treet, insertBoardTree skriver det inn igjen et
// annet sted — enten med FRISKE id-er (kopier/lim inn) eller med de
// OPPRINNELIGE id-ene gjenbrukt (gjenopprett etter sletting, siden id-ene
// garantert er ledige rett etter at radene ble slettet).
// ---------------------------------------------------------------------------
export type BoardTreeSnapshot = {
  board: { id: string; title: string; kind: 'storyline' | null; storyline_columns: number | null }
  cards: BoardCard[]
  edges: BoardEdge[]
  children: Record<string, BoardTreeSnapshot>
}

async function snapshotBoardTree(
  supabase: Awaited<ReturnType<typeof createClient>>,
  boardId: string
): Promise<BoardTreeSnapshot | null> {
  const { data: board } = await supabase.from('boards')
    .select('id, title, kind, storyline_columns').eq('id', boardId).single()
  if (!board) return null

  const [{ data: cards }, { data: edges }] = await Promise.all([
    supabase.from('board_cards').select('*').eq('board_id', boardId),
    supabase.from('board_edges').select('*').eq('board_id', boardId),
  ])

  const children: Record<string, BoardTreeSnapshot> = {}
  for (const c of (cards ?? []) as BoardCard[]) {
    if (c.type !== 'board' && c.type !== 'storyline') continue
    const childId = (c.content as BoardRefContent).child_board_id
    if (!childId) continue
    const nested = await snapshotBoardTree(supabase, childId)
    if (nested) children[c.id] = nested
  }

  return {
    board: board as BoardTreeSnapshot['board'],
    cards: (cards ?? []) as BoardCard[],
    edges: (edges ?? []) as BoardEdge[],
    children,
  }
}

async function insertBoardTree(
  supabase: Awaited<ReturnType<typeof createClient>>,
  snapshot: BoardTreeSnapshot,
  parentBoardId: string,
  projectId: string,
  userId: string | null,
  opts: { reuseIds: boolean; titleSuffix?: string }
): Promise<string> {
  const boardInsert: Record<string, unknown> = {
    project_id: projectId,
    parent_board_id: parentBoardId,
    title: snapshot.board.title + (opts.titleSuffix ?? ''),
    kind: snapshot.board.kind,
    storyline_columns: snapshot.board.storyline_columns,
    created_by: userId,
  }
  if (opts.reuseIds) boardInsert.id = snapshot.board.id
  const { data: newBoard, error: boardErr } = await supabase.from('boards').insert(boardInsert).select('id').single()
  if (boardErr || !newBoard) throw new Error(boardErr?.message ?? 'insertBoardTree: kunne ikke opprette board')

  // Pass 1: sett inn alle kort uten column_id (barnet kan komme før forelderen
  // i listen), og løs opp nøstede board-/storyline-referanser rekursivt underveis.
  const idMap = new Map<string, string>()
  for (const c of snapshot.cards) {
    let content = c.content
    if ((c.type === 'board' || c.type === 'storyline') && snapshot.children[c.id]) {
      const nestedId = await insertBoardTree(supabase, snapshot.children[c.id], newBoard.id, projectId, userId, { reuseIds: opts.reuseIds })
      content = { ...c.content, child_board_id: nestedId }
    }
    const cardInsert: Record<string, unknown> = {
      board_id: newBoard.id, type: c.type, x: c.x, y: c.y, width: c.width,
      z_index: c.z_index, column_id: null, sort_order: c.sort_order, content,
    }
    if (opts.reuseIds) cardInsert.id = c.id
    const { data: newCard, error: cardErr } = await supabase.from('board_cards').insert(cardInsert).select('id').single()
    if (cardErr || !newCard) { console.error('insertBoardTree card:', cardErr); continue }
    idMap.set(c.id, newCard.id)
  }

  // Pass 2: koble kort til sin (nye) kolonne
  for (const c of snapshot.cards) {
    if (c.column_id && idMap.has(c.column_id) && idMap.has(c.id)) {
      await supabase.from('board_cards').update({ column_id: idMap.get(c.column_id) }).eq('id', idMap.get(c.id))
    }
  }

  for (const e of snapshot.edges) {
    if (!idMap.has(e.from_card_id) || !idMap.has(e.to_card_id)) continue
    const edgeInsert: Record<string, unknown> = {
      board_id: newBoard.id, from_card_id: idMap.get(e.from_card_id), to_card_id: idMap.get(e.to_card_id), label: e.label,
    }
    if (opts.reuseIds) edgeInsert.id = e.id
    await supabase.from('board_edges').insert(edgeInsert)
  }

  return newBoard.id
}

// Kalles FØR sletting (fra onBeforeDelete) slik at et evt. board-/storyline-kort
// blant det som slettes kan gjenopprettes med hele undertreet intakt ved Cmd+Z.
export async function snapshotBoardSubtrees(
  cards: { id: string; type: BoardCardType; content: BoardCardContent }[]
): Promise<Record<string, BoardTreeSnapshot>> {
  try {
    const supabase = await createClient()
    const result: Record<string, BoardTreeSnapshot> = {}
    for (const c of cards) {
      if (c.type !== 'board' && c.type !== 'storyline') continue
      const childId = (c.content as BoardRefContent).child_board_id
      if (!childId) continue
      const snap = await snapshotBoardTree(supabase, childId)
      if (snap) result[c.id] = snap
    }
    return result
  } catch (err) {
    console.error('snapshotBoardSubtrees:', err)
    return {}
  }
}

export type PastedCardInput = {
  id: string; type: BoardCardType; x: number; y: number; width: number | null
  column_id: string | null; sort_order: number; content: BoardCardContent
}
export type PastedEdgeInput = { from_card_id: string; to_card_id: string; label: string | null }

// Cmd/Ctrl+V — limer inn en tidligere kopiert (Cmd/Ctrl+C) markering på et board.
// Board-/storyline-kort klones med hele undertreet (nytt underboard, friske id-er);
// øvrige kort dupliseres som de er. dx/dy forskyver kun toppnivå-kort — barn av en
// kopiert kolonne beholder sin relative posisjon uendret.
export async function pasteBoardCards(
  targetBoardId: string,
  cards: PastedCardInput[],
  edges: PastedEdgeInput[],
  dx: number, dy: number, zIndexStart: number
): Promise<{ cards: BoardCard[]; edges: BoardEdge[]; childMeta: Record<string, ChildBoardMeta> } | null> {
  try {
    const supabase = await createClient()
    const { data: board } = await supabase.from('boards').select('project_id').eq('id', targetBoardId).single()
    if (!board) return null
    const { data: { user } } = await supabase.auth.getUser()

    const idMap = new Map<string, string>()
    const newCardsById = new Map<string, BoardCard>()
    const childMeta: Record<string, ChildBoardMeta> = {}
    let z = zIndexStart

    for (const c of cards) {
      let content = c.content
      if (c.type === 'board' || c.type === 'storyline') {
        const sourceChildId = (c.content as BoardRefContent).child_board_id
        const snap = sourceChildId ? await snapshotBoardTree(supabase, sourceChildId) : null
        if (snap) {
          const newChildId = await insertBoardTree(supabase, snap, targetBoardId, board.project_id, user?.id ?? null, { reuseIds: false, titleSuffix: ' (kopi)' })
          content = { ...c.content, child_board_id: newChildId, title: (c.content as BoardRefContent).title + ' (kopi)' }
          childMeta[newChildId] = { title: (content as BoardRefContent).title, cardCount: snap.cards.length }
        }
      }
      const isChild = !!c.column_id
      const { data: row, error } = await supabase.from('board_cards').insert({
        board_id: targetBoardId, type: c.type,
        x: isChild ? c.x : c.x + dx, y: isChild ? c.y : c.y + dy,
        width: c.width, z_index: z++, column_id: null, sort_order: c.sort_order, content,
      }).select('*').single()
      if (error || !row) { console.error('pasteBoardCards card:', error); continue }
      idMap.set(c.id, row.id)
      newCardsById.set(row.id, row as BoardCard)
    }

    for (const c of cards) {
      if (c.column_id && idMap.has(c.column_id) && idMap.has(c.id)) {
        const newId = idMap.get(c.id)!
        const newColId = idMap.get(c.column_id)!
        await supabase.from('board_cards').update({ column_id: newColId }).eq('id', newId)
        const card = newCardsById.get(newId)
        if (card) newCardsById.set(newId, { ...card, column_id: newColId })
      }
    }

    const newEdges: BoardEdge[] = []
    for (const e of edges) {
      if (!idMap.has(e.from_card_id) || !idMap.has(e.to_card_id)) continue
      const { data: edgeRow } = await supabase.from('board_edges').insert({
        board_id: targetBoardId, from_card_id: idMap.get(e.from_card_id), to_card_id: idMap.get(e.to_card_id), label: e.label,
      }).select('*').single()
      if (edgeRow) newEdges.push(edgeRow as BoardEdge)
    }

    return { cards: Array.from(newCardsById.values()), edges: newEdges, childMeta }
  } catch (err) {
    console.error('pasteBoardCards:', err)
    return null
  }
}

// Cmd/Ctrl+Z etter en sletting — gjenoppretter kort/piler med sine OPPRINNELIGE
// id-er (garantert ledige rett etter sletting). `subtrees` (fra snapshotBoardSubtrees,
// tatt FØR selve slettingen) gjenoppretter et evt. slettet underboard i sin helhet.
// NB: kommentartråder på de slettede kortene er allerede kaskade-slettet i databasen
// og kommer ikke tilbake — kun selve kortene/innholdet gjenopprettes.
export async function restoreDeletedCards(
  cards: BoardCard[],
  edges: BoardEdge[],
  subtrees: Record<string, BoardTreeSnapshot>
): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    let projectIdCache: string | null | undefined

    for (const c of cards) {
      let content = c.content
      const subtree = subtrees[c.id]
      if (subtree) {
        if (projectIdCache === undefined) {
          const { data: b } = await supabase.from('boards').select('project_id').eq('id', c.board_id).single()
          projectIdCache = b?.project_id ?? null
        }
        if (projectIdCache) {
          const restoredChildId = await insertBoardTree(supabase, subtree, c.board_id, projectIdCache, user?.id ?? null, { reuseIds: true })
          content = { ...c.content, child_board_id: restoredChildId }
        }
      }
      const { error } = await supabase.from('board_cards').insert({
        id: c.id, board_id: c.board_id, type: c.type, x: c.x, y: c.y, width: c.width,
        z_index: c.z_index, column_id: null, sort_order: c.sort_order, content,
      })
      if (error) console.error('restoreDeletedCards card:', error)
    }

    for (const c of cards) {
      if (c.column_id) {
        await supabase.from('board_cards').update({ column_id: c.column_id }).eq('id', c.id)
      }
    }

    for (const e of edges) {
      const { error } = await supabase.from('board_edges').insert({
        id: e.id, board_id: e.board_id, from_card_id: e.from_card_id, to_card_id: e.to_card_id, label: e.label,
      })
      if (error) console.error('restoreDeletedCards edge:', error)
    }

    return true
  } catch (err) {
    console.error('restoreDeletedCards:', err)
    return false
  }
}

// Flytter et kort til et underboard (dra-og-slipp på et board-kort, se onNodeDragStop
// i BoardCanvas.tsx). Piler til/fra kortet slettes — de kan ikke krysse boards, siden
// board_edges er begrenset til ett board_id.
export async function moveCardToBoard(cardId: string, targetBoardId: string, x: number, y: number): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { error: edgeError } = await supabase.from('board_edges')
      .delete().or(`from_card_id.eq.${cardId},to_card_id.eq.${cardId}`)
    if (edgeError) { console.error('moveCardToBoard (edges):', edgeError); return false }

    const { error } = await supabase.from('board_cards').update({
      board_id: targetBoardId, x, y, column_id: null, sort_order: 0, z_index: 0, updated_at: now(),
    }).eq('id', cardId)
    if (error) { console.error('moveCardToBoard:', error); return false }
    return true
  } catch (err) {
    console.error('moveCardToBoard:', err)
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

const STORYLINE_TITLE = 'Storyline'
const STORYLINE_PANEL_COUNT = 10
const STORYLINE_COLS = 4
const STORYLINE_IMG_WIDTH = 240
const STORYLINE_GAP = 24
const STORYLINE_ROW_HEIGHT = 200
const storylinePanelStartX = () => 40 + INFO_COLUMN_WIDTH + 60

// Setter inn `count` nye tomme bildepaneler etter alle eksisterende paneler på boardet,
// og kjeder dem sammen med piler i sekvens (forrige siste panel → første nye, osv.) —
// brukes både til å så blueprinten og til «legg til kort»/«legg til rad». En og en insert
// (ikke batch) fordi vi trenger hver rads id i rekkefølge for å tegne pilene riktig.
async function insertStorylinePanels(
  supabase: Awaited<ReturnType<typeof createClient>>,
  boardId: string, count: number, columns: number
): Promise<{ cards: BoardCard[]; edges: BoardEdge[] }> {
  const { data: existing } = await supabase.from('board_cards')
    .select('id').eq('board_id', boardId).eq('type', 'image').order('created_at')
  let n = existing?.length ?? 0
  let prevId: string | null = n > 0 ? existing![n - 1].id : null
  const panelStartX = storylinePanelStartX()
  const cards: BoardCard[] = []
  const edges: BoardEdge[] = []

  for (let k = 0; k < count; k++) {
    const { data: card, error } = await supabase.from('board_cards').insert({
      board_id: boardId, type: 'image',
      x: panelStartX + (n % columns) * (STORYLINE_IMG_WIDTH + STORYLINE_GAP),
      y: 40 + Math.floor(n / columns) * STORYLINE_ROW_HEIGHT,
      width: STORYLINE_IMG_WIDTH,
      content: {},
    }).select('*').single()
    if (error || !card) { console.error('insertStorylinePanels:', error); break }
    cards.push(card as BoardCard)
    if (prevId) {
      const { data: edge } = await supabase.from('board_edges').insert({
        board_id: boardId, from_card_id: prevId, to_card_id: card.id,
      }).select('*').single()
      if (edge) edges.push(edge as BoardEdge)
    }
    prevId = card.id
    n++
  }
  return { cards, edges }
}

// Som createSubBoard, men det nye underboardet sås med en blueprint (synopsis-kolonne
// + løst rutenett av tomme bildeplasser, kjedet sammen med piler) i stedet for å åpnes
// tomt — se Magnus' referansebilde av hvordan en ekte storyline pleier å bygges opp
// manuelt i boards i dag.
export async function createStorylineBoard(
  parentBoardId: string, x: number, y: number
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
      title: STORYLINE_TITLE,
      kind: 'storyline',
      storyline_columns: STORYLINE_COLS,
      created_by: user?.id ?? null,
    }).select('id').single()
    if (error || !child) { console.error('createStorylineBoard:', error); return null }

    const { data: column } = await supabase.from('board_cards').insert({
      board_id: child.id, type: 'column', x: 40, y: 40,
      width: INFO_COLUMN_WIDTH, content: { title: 'SYNOPSIS' },
    }).select('id').single()
    if (column) {
      await supabase.from('board_cards').insert({
        board_id: child.id, type: 'note', x: INFO_COLUMN_PAD, y: INFO_COLUMN_HEADER + INFO_COLUMN_GAP,
        width: INFO_COLUMN_WIDTH - INFO_COLUMN_PAD * 2, column_id: column.id, sort_order: 0,
        content: { text: '' },
      })
    }

    await insertStorylinePanels(supabase, child.id, STORYLINE_PANEL_COUNT, STORYLINE_COLS)

    const card = await createBoardCard({
      board_id: parentBoardId, type: 'storyline', x, y,
      content: { child_board_id: child.id, title: STORYLINE_TITLE },
    })
    if (!card) return null
    return { boardId: child.id, card }
  } catch (err) {
    console.error('createStorylineBoard:', err)
    return null
  }
}

async function getStorylineColumns(
  supabase: Awaited<ReturnType<typeof createClient>>, boardId: string
): Promise<number> {
  const { data: board } = await supabase.from('boards').select('storyline_columns').eq('id', boardId).single()
  return board?.storyline_columns ?? STORYLINE_COLS
}

/** «Legg til kort» — ett nytt tomt panel rett etter det siste, kjedet med en pil. */
export async function addStorylineCard(boardId: string): Promise<{ cards: BoardCard[]; edges: BoardEdge[] } | null> {
  try {
    const supabase = await createClient()
    const columns = await getStorylineColumns(supabase, boardId)
    return await insertStorylinePanels(supabase, boardId, 1, columns)
  } catch (err) {
    console.error('addStorylineCard:', err)
    return null
  }
}

/** «Legg til rad» — en hel ny rad med tomme paneler (samme bredde som gjeldende rutenett). */
export async function addStorylineRow(boardId: string): Promise<{ cards: BoardCard[]; edges: BoardEdge[] } | null> {
  try {
    const supabase = await createClient()
    const columns = await getStorylineColumns(supabase, boardId)
    return await insertStorylinePanels(supabase, boardId, columns, columns)
  } catch (err) {
    console.error('addStorylineRow:', err)
    return null
  }
}

/**
 * «Legg til kolonne» — utvider rutenettet én kolonne bredere og pakker eksisterende
 * paneler om til den nye bredden (færre, bredere rader). Fremtidige legg til kort/rad
 * bruker automatisk den nye bredden siden den leses fra boards.storyline_columns.
 */
export async function widenStorylineGrid(boardId: string): Promise<{ columns: number; cards: BoardCard[] } | null> {
  try {
    const supabase = await createClient()
    const oldColumns = await getStorylineColumns(supabase, boardId)
    const newColumns = oldColumns + 1
    const { error: updErr } = await supabase.from('boards')
      .update({ storyline_columns: newColumns, updated_at: now() }).eq('id', boardId)
    if (updErr) { console.error('widenStorylineGrid:', updErr); return null }

    const { data: existing } = await supabase.from('board_cards')
      .select('id').eq('board_id', boardId).eq('type', 'image').order('created_at')
    const panelStartX = storylinePanelStartX()
    const updated: BoardCard[] = []
    for (const [i, row] of (existing ?? []).entries()) {
      const patch = {
        x: panelStartX + (i % newColumns) * (STORYLINE_IMG_WIDTH + STORYLINE_GAP),
        y: 40 + Math.floor(i / newColumns) * STORYLINE_ROW_HEIGHT,
        updated_at: now(),
      }
      const { data: card } = await supabase.from('board_cards').update(patch).eq('id', row.id).select('*').single()
      if (card) updated.push(card as BoardCard)
    }
    return { columns: newColumns, cards: updated }
  } catch (err) {
    console.error('widenStorylineGrid:', err)
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
    // Hold denormalisert tittel på board-/storyline-kortet i foreldre-boardet i sync
    const { data: refCards } = await supabase.from('board_cards')
      .select('id, content').in('type', ['board', 'storyline']).contains('content', { child_board_id: boardId })
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

export async function fetchLinkMetadata(url: string): Promise<LinkContent> {
  const safeHost = (() => { try { return new URL(url).hostname } catch { return url } })()
  const fallback: LinkContent = { url, title: safeHost }
  try {
    // Denne actionen er importerbar fra det offentlige /b-bundlet og gjør
    // server-side fetch mot vilkårlige URL-er — uten auth-sjekk er den en
    // åpen SSRF-orakel for uinnloggede. Krev innlogget bruker før vi fetcher.
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return fallback

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

// ---------------------------------------------------------------------------
// Deling — /b/[token] (Task 13)
// ---------------------------------------------------------------------------

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

export type SharedBoardData = Omit<BoardData, 'projectId'> & { rootBoardId: string }

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

    const [{ data: cards }, { data: edges }, { data: project }, { data: leadProfile }, { data: customerContact }] = await Promise.all([
      service.from('board_cards').select('*').eq('board_id', target.id).order('z_index'),
      service.from('board_edges').select('*').eq('board_id', target.id),
      service.from('projects').select('title, board_summary, delivery_description, shoot_start, shoot_end, customers(name, company)').eq('id', root.project_id).single(),
      target.lead_profile_id
        ? service.from('profiles').select('id, name, email, color, phone').eq('id', target.lead_profile_id).maybeSingle()
        : Promise.resolve({ data: null }),
      target.customer_contact_id
        ? service.from('customer_contacts').select('id, name, role, phone').eq('id', target.customer_contact_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    const customer = (project as unknown as { customers?: { name: string | null; company: string | null } | null } | null)?.customers
    const proj = project as unknown as {
      board_summary?: string | null
      delivery_description?: string | null
      shoot_start?: string | null
      shoot_end?: string | null
    } | null

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
      .filter(c => c.type === 'board' || c.type === 'storyline')
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
      projectTitle: (project as { title?: string } | null)?.title ?? '',
      projectCustomerId: null,
      customerName: customer?.name || customer?.company || 'Ingen kunde satt',
      // Prosjektinfo, leveranse, opptak og kontaktpersoner er alle ment for kunden
      // og vises derfor på delte boards (board_summary er en egen, manuelt
      // redigert tekst — ikke den interne AI-oppsummeringen av møtenotater).
      leadProfile: leadProfile as BoardLeadProfile | null,
      customerContact: customerContact as BoardCustomerContact | null,
      childMeta,
      projectSummary: proj?.board_summary?.trim() || null,
      deliveryDescription: proj?.delivery_description?.trim() || null,
      shootStart: proj?.shoot_start ?? null,
      shootEnd: proj?.shoot_end ?? null,
      rootBoardId: root.id,
    }
  } catch (err) {
    console.error('getSharedBoard:', err)
    return null
  }
}

export type BoardOverviewItem = {
  id: string
  title: string
  projectId: string
  projectTitle: string
  customerName: string
  cardCount: number
  subBoardCount: number
  shared: boolean
  updated_at: string
}

export async function getAllBoards(): Promise<BoardOverviewItem[]> {
  try {
    const supabase = await createClient()
    const { data: roots } = await supabase
      .from('boards')
      .select('id, title, project_id, share_token, updated_at, projects(title, customers(name, company))')
      .is('parent_board_id', null)
      .order('updated_at', { ascending: false })
    if (!roots || roots.length === 0) return []

    const rootIds = roots.map(r => r.id)
    const projectIds = roots.map(r => r.project_id)
    const [{ data: cards }, { data: subs }] = await Promise.all([
      supabase.from('board_cards').select('board_id').in('board_id', rootIds),
      supabase.from('boards').select('project_id').in('project_id', projectIds).not('parent_board_id', 'is', null),
    ])
    const cardCounts: Record<string, number> = {}
    for (const c of cards ?? []) cardCounts[c.board_id] = (cardCounts[c.board_id] ?? 0) + 1
    const subCounts: Record<string, number> = {}
    for (const s of subs ?? []) subCounts[s.project_id] = (subCounts[s.project_id] ?? 0) + 1

    return roots.map(r => {
      const project = r.projects as unknown as { title: string; customers?: { name: string | null; company: string | null } | null } | null
      const customer = project?.customers
      return {
        id: r.id,
        title: r.title,
        projectId: r.project_id,
        projectTitle: project?.title ?? r.title,
        customerName: customer?.name || customer?.company || 'Ingen kunde satt',
        cardCount: cardCounts[r.id] ?? 0,
        subBoardCount: subCounts[r.project_id] ?? 0,
        shared: !!r.share_token,
        updated_at: r.updated_at,
      }
    })
  } catch (err) {
    console.error('getAllBoards:', err)
    return []
  }
}
