'use client'

import { useEffect, useRef, useState } from 'react'
import { TaskChat } from './TaskChat'
import type { MentionableProfile } from '@/lib/mentions'

const C = {
  border:  '#3C3C52',
  text3:   '#8484A0',
  accent:  '#7C5CFC',
}

type Props = {
  taskId: string
  taskTitle: string
  currentUserId: string | null
  profiles: MentionableProfile[]
  messageCount: number
  forceOpen?: boolean
}

export function TaskChatToggle({ taskId, taskTitle, currentUserId, profiles, messageCount, forceOpen }: Props) {
  const [expanded, setExpanded] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (forceOpen) {
      setExpanded(true)
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [forceOpen])

  return (
    <>
      <button
        onClick={() => setExpanded(e => !e)}
        title={expanded ? 'Skjul chat' : 'Åpne chat'}
        style={{
          display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, cursor: 'pointer',
          background: expanded ? 'rgba(124,92,252,0.12)' : 'transparent',
          border: `1px solid ${expanded ? 'rgba(124,92,252,0.3)' : C.border}`,
          borderRadius: 20, padding: '3px 8px', color: expanded ? C.accent : C.text3,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {messageCount > 0 && (
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600 }}>
            {messageCount}
          </span>
        )}
      </button>
      {expanded && (
        <div
          ref={panelRef}
          style={{
            flexBasis: '100%', width: '100%', height: 360, marginTop: 8,
            border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden',
          }}
        >
          <TaskChat taskId={taskId} taskTitle={taskTitle} currentUserId={currentUserId} profiles={profiles} />
        </div>
      )}
    </>
  )
}
