'use client'

import { C } from '@/lib/admin-theme'

export type ProjectsView = 'list' | 'board'

export function ProjectsViewToggle({ view, onChange }: {
  view: ProjectsView
  onChange: (view: ProjectsView) => void
}) {
  const options: { value: ProjectsView; label: string }[] = [
    { value: 'list', label: 'Liste' },
    { value: 'board', label: 'Board' },
  ]

  return (
    <div style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 6, padding: 2, background: C.surface2 }}>
      {options.map(opt => {
        const active = view === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.72rem',
              fontWeight: 500,
              padding: '6px 14px',
              borderRadius: 4,
              border: 'none',
              cursor: active ? 'default' : 'pointer',
              background: active ? C.accent : 'transparent',
              color: active ? '#fff' : C.text3,
              transition: 'background 0.12s, color 0.12s',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
