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
