import type { CardPositionPatch } from '@/lib/actions/boards'
import { COLUMN_GAP, COLUMN_HEADER, COLUMN_PAD, type CardNode } from './toFlow'

/**
 * Stabler barna til en kolonne vertikalt (sortert på nåværende y) og setter
 * kolonnens høyde. Returnerer nye node-objekter + patches for persistering.
 */
export function restackColumn(
  columnId: string,
  nodes: CardNode[],
  getHeight: (n: CardNode) => number
): { nodes: CardNode[]; patches: CardPositionPatch[] } {
  const children = nodes
    .filter(n => n.parentId === columnId)
    .sort((a, b) => a.position.y - b.position.y)

  const patches: CardPositionPatch[] = []
  const updated = new Map<string, CardNode>()
  let y = COLUMN_HEADER + COLUMN_GAP

  children.forEach((ch, i) => {
    updated.set(ch.id, { ...ch, position: { x: COLUMN_PAD, y } })
    patches.push({ id: ch.id, x: COLUMN_PAD, y, column_id: columnId, sort_order: i })
    y += getHeight(ch) + COLUMN_GAP
  })

  const height = Math.max(140, y + COLUMN_PAD)
  return {
    nodes: nodes.map(n => {
      if (updated.has(n.id)) return updated.get(n.id)!
      if (n.id === columnId) return { ...n, style: { ...n.style, height } }
      return n
    }),
    patches,
  }
}
