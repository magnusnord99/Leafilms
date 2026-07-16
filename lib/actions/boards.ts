'use server'

import { randomBytes } from 'crypto'
import { createClient, createServiceClient } from '@/lib/supabase-server'
import type { Board, BoardCard, BoardCardContent, BoardCardType, BoardEdge, BoardRefContent, LinkContent } from '@/lib/types'

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
