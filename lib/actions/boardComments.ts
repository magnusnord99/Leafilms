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
