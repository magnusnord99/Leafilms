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
