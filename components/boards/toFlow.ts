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
    // Ikke sett extent: 'parent' her — det ville låst kortet permanent inne i kolonnen
    // og gjort det umulig å dra det ut igjen (se onNodeDragStop i BoardCanvas.tsx).
    ...(card.column_id ? { parentId: card.column_id } : {}),
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
