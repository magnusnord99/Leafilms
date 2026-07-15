'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase-client'
import type { BoardCard, BoardEdge } from '@/lib/types'

type Evt = 'INSERT' | 'UPDATE' | 'DELETE'

// Lytter på postgres_changes for board_cards/board_edges (migrasjon 098) og
// videresender ikke-lokale endringer til BoardCanvas. isLocalOp filtrerer bort
// vårt eget echo (se localOps/markLocalOp i BoardCanvas.tsx).
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
