'use client'

import type { NodeProps } from '@xyflow/react'
import type { BoardScheduleContent, BoardScheduleItem } from '@/lib/types'
import { useBoardUi } from '../boardContext'
import CardShell from './CardShell'
import { ClockIcon } from '../icons'
import type { CardNode } from '../toFlow'

const sortByTime = (items: BoardScheduleItem[]) => [...items].sort((a, b) => a.time.localeCompare(b.time))

export default function ScheduleNode({ id, data, selected }: NodeProps<CardNode>) {
  const { palette: P, onOpenSchedule } = useBoardUi()
  const content = data.card.content as BoardScheduleContent
  const items = sortByTime(content.items)

  // Åpner den store, tabell-baserte timeplan-siden i stedet for en modal — se
  // app/admin/boards/[boardId]/schedule/[cardId] (innlogget) og
  // app/b/[token]/schedule/[cardId] (offentlig delt, skrivebeskyttet).
  const openSchedulePage = () => onOpenSchedule?.(id, data.card.board_id)

  return (
    <CardShell cardId={id} selected={!!selected}>
      <div onDoubleClick={openSchedulePage} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: P.accent + '22', border: `1px solid ${P.accent}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: P.accent, flexShrink: 0 }}>
            <ClockIcon size={18} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 700, color: P.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {content.title || 'Timeplan'}
            </div>
            <div style={{ fontSize: '0.68rem', color: P.text2 }}>
              {items.length > 0 ? `${items.length} programpunkter` : 'Ingen punkter ennå'}
              {' · dobbeltklikk for å åpne'}
            </div>
          </div>
        </div>
        {items.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {items.slice(0, 4).map(item => (
              <div key={item.id} style={{ display: 'flex', gap: 8, fontSize: '0.74rem', color: P.text2 }}>
                <span style={{ fontWeight: 600, color: P.text, flexShrink: 0 }}>{item.time}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {item.label}{item.location ? ` · ${item.location}` : ''}
                </span>
              </div>
            ))}
            {items.length > 4 && (
              <div style={{ fontSize: '0.7rem', color: P.text2 }}>+ {items.length - 4} til</div>
            )}
          </div>
        )}
      </div>
    </CardShell>
  )
}
