'use client'

import type { BoardCardType } from '@/lib/types'
import { useBoardUi } from './boardContext'

const TOOLS: { type: BoardCardType; label: string; icon: string }[] = [
  { type: 'note',   label: 'Notat',   icon: 'T'  },
  { type: 'image',  label: 'Bilde',   icon: '🖼' },
  { type: 'video',  label: 'Video',   icon: '▶'  },
  { type: 'link',   label: 'Lenke',   icon: '🔗' },
  { type: 'color',  label: 'Farge',   icon: 'swatch' },
  { type: 'todo',   label: 'To-do',   icon: '☑'  },
  { type: 'column', label: 'Kolonne', icon: '▤'  },
  { type: 'board',  label: 'Board',   icon: '▦'  },
]

export default function Toolbar({ pending, onPick, enabledTypes }: {
  pending: BoardCardType | null
  onPick: (t: BoardCardType | null) => void
  enabledTypes: BoardCardType[]
}) {
  const { palette: P } = useBoardUi()
  return (
    <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', zIndex: 10, display: 'flex', flexDirection: 'column', gap: 4, background: P.surface, border: `1px solid ${P.border}`, borderRadius: 10, padding: 6 }}>
      {TOOLS.filter(t => enabledTypes.includes(t.type)).map(t => (
        <button
          key={t.type}
          title={t.label}
          onClick={() => onPick(pending === t.type ? null : t.type)}
          style={{
            width: 38, height: 38, borderRadius: 8, cursor: 'pointer', fontSize: '0.95rem',
            background: pending === t.type ? P.accent : 'transparent',
            color: pending === t.type ? '#fff' : P.text2,
            border: 'none',
          }}
        >
          {t.icon === 'swatch' ? <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 7, background: P.accent }} /> : t.icon}
        </button>
      ))}
    </div>
  )
}
