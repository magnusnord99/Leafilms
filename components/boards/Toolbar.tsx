'use client'

import type { ComponentType } from 'react'
import type { BoardCardType } from '@/lib/types'
import { useBoardUi } from './boardContext'
import { NoteIcon, ImageIcon, VideoIcon, LinkIcon, TodoIcon, ColumnIcon, BoardRefIcon, ClockIcon, ClapperboardIcon } from './icons'

const TOOLS: { type: BoardCardType; label: string; icon: ComponentType<{ size?: number }> | 'swatch' }[] = [
  { type: 'note',   label: 'Notat',   icon: NoteIcon },
  { type: 'image',  label: 'Bilde',   icon: ImageIcon },
  { type: 'video',  label: 'Video',   icon: VideoIcon },
  { type: 'link',   label: 'Lenke',   icon: LinkIcon },
  { type: 'color',  label: 'Farge',   icon: 'swatch' },
  { type: 'todo',   label: 'To-do',   icon: TodoIcon },
  { type: 'column',    label: 'Kolonne',   icon: ColumnIcon },
  { type: 'board',     label: 'Board',     icon: BoardRefIcon },
  { type: 'schedule',  label: 'Timeplan',  icon: ClockIcon },
  { type: 'storyline', label: 'Storyline', icon: ClapperboardIcon },
]

export default function Toolbar({ pending, onPick, enabledTypes }: {
  pending: BoardCardType | null
  onPick: (t: BoardCardType | null) => void
  enabledTypes: BoardCardType[]
}) {
  const { palette: P } = useBoardUi()
  return (
    <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 10, padding: 6 }}>
      {TOOLS.filter(t => enabledTypes.includes(t.type)).map(t => {
        const Icon = t.icon
        return (
          <button
            key={t.type}
            title={t.label}
            onClick={() => onPick(pending === t.type ? null : t.type)}
            style={{
              width: 38, height: 38, borderRadius: 8, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: pending === t.type ? P.accent : 'transparent',
              color: pending === t.type ? '#fff' : P.text2,
              border: 'none',
            }}
          >
            {Icon === 'swatch' ? <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 7, background: P.accent }} /> : <Icon size={18} />}
          </button>
        )
      })}
    </div>
  )
}
