'use client'

import { useState, type ComponentType } from 'react'
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
  const [hovered, setHovered] = useState<BoardCardType | null>(null)

  return (
    <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 10, padding: 6 }}>
      {TOOLS.filter(t => enabledTypes.includes(t.type)).map(t => {
        const Icon = t.icon
        const isActive = pending === t.type
        const isHovered = hovered === t.type
        return (
          <div
            key={t.type}
            style={{ position: 'relative' }}
            onMouseEnter={() => setHovered(t.type)}
            onMouseLeave={() => setHovered(null)}
          >
            <button
              title={t.label}
              onClick={() => onPick(isActive ? null : t.type)}
              style={{
                width: 38, height: 38, borderRadius: 8, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: isActive ? P.accent : 'transparent',
                color: isActive ? '#fff' : P.text2,
                border: 'none',
                transform: isHovered && !isActive ? 'scale(1.18)' : 'scale(1)',
                transition: 'transform 140ms ease, background 120ms ease, color 120ms ease',
              }}
            >
              {Icon === 'swatch' ? <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 7, background: P.accent }} /> : <Icon size={18} />}
            </button>
            {/* Tooltip-label til høyre for panelet ved hover */}
            {isHovered && (
              <div
                style={{
                  position: 'absolute', left: 'calc(100% + 8px)', top: '50%',
                  transform: 'translateY(-50%)',
                  background: P.surface, border: `1px solid ${P.border}`,
                  borderRadius: 6, padding: '4px 9px',
                  fontSize: '0.72rem', fontWeight: 500, color: P.text,
                  fontFamily: 'var(--font-dm-sans)',
                  whiteSpace: 'nowrap', pointerEvents: 'none',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
                  zIndex: 20,
                }}
              >
                {t.label}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
