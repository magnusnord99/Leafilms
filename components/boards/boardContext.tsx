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
  // Kalles når et korts reelle høyde blir kjent etter innlasting (f.eks. et bilde som
  // laster ferdig) — trigger en ny kolonne-restack med korrekt høyde, se BoardCanvas.
  onCardResize: () => void
  // Åpner den dedikerte timeplan-siden for et schedule-kort. Ulik URL avhengig av om
  // vi er i admin (/admin/boards/.../schedule/...) eller på et offentlig delt board
  // (/b/[token]/schedule/...) — se ScheduleNode.
  onOpenSchedule?: (cardId: string, boardId: string) => void
}

const BoardUiContext = createContext<BoardUi>({
  palette: ADMIN_BOARD_PALETTE,
  readOnly: true,
  markLocalOp: () => {},
  onCardResize: () => {},
})

export const BoardUiProvider = BoardUiContext.Provider
export const useBoardUi = () => useContext(BoardUiContext)
