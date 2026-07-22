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
