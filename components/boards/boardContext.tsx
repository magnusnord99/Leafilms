'use client'

import { createContext, useContext } from 'react'
import { C } from '@/lib/admin-theme'
import type { BoardCardContent } from '@/lib/types'

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
  // Kalles av kort-komponenter RETT FØR de lagrer en innholdsendring (notat/todo/
  // farge/schedule-tekst osv.), med innholdet slik det var FØR og ETTER endringen —
  // så Cmd+Z/Cmd+Shift+Z i BoardCanvas kan legge det tilbake/gjøre det om igjen.
  // No-op default (ScheduleCardPage bruker ikke angre-stakken til hovedlerretet).
  recordContentEdit: (cardId: string, before: BoardCardContent, after: BoardCardContent) => void
}

const BoardUiContext = createContext<BoardUi>({
  palette: ADMIN_BOARD_PALETTE,
  readOnly: true,
  markLocalOp: () => {},
  onCardResize: () => {},
  recordContentEdit: () => {},
})

export const BoardUiProvider = BoardUiContext.Provider
export const useBoardUi = () => useContext(BoardUiContext)
