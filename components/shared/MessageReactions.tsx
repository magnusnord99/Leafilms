'use client'

import { useAuth } from '@/hooks/useAuth'
import type { MessageReaction } from '@/lib/actions/reactions'

const QUICK_EMOJIS = ['❗', '❤️', '👍']

const C = {
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text2:    '#B4B4CC',
  text3:    '#8484A0',
  accent:   '#7C5CFC',
  accentBg: 'rgba(124,92,252,0.14)',
}

type Props = {
  reactions: MessageReaction[]
  onToggle: (emoji: string) => void
}

// Delt mellom prosjekt-chat, oppgave-chat og tilbud-chat — brukes sammen med en group-hover-
// klasse på selve meldingsraden (se ProjectChat.tsx/TaskChat.tsx/QuoteChat.tsx) for å vise
// hurtigreaksjons-knappene kun ved hover, uten å måtte skrive et svar.
export function MessageReactions({ reactions, onToggle }: Props) {
  const { user } = useAuth()

  const grouped = QUICK_EMOJIS
    .map((emoji) => ({
      emoji,
      users: reactions.filter((r) => r.emoji === emoji),
    }))
    .filter((g) => g.users.length > 0)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 2 }}>
      {grouped.map((g) => {
        const reactedByMe = !!user && g.users.some((u) => u.userId === user.id)
        return (
          <button
            key={g.emoji}
            type="button"
            onClick={() => onToggle(g.emoji)}
            title={g.users.map((u) => u.userName).join(', ')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontFamily: 'var(--font-dm-sans)',
              fontSize: '0.68rem',
              padding: '2px 7px',
              borderRadius: 10,
              cursor: 'pointer',
              background: reactedByMe ? C.accentBg : C.surface2,
              border: `1px solid ${reactedByMe ? C.accent : C.border}`,
              color: reactedByMe ? C.accent : C.text2,
            }}
          >
            <span>{g.emoji}</span>
            <span>{g.users.length}</span>
          </button>
        )
      })}

      {/* Hurtigreaksjoner — kun synlig ved hover over meldingen (jf. .group på forelder) */}
      <div
        className="opacity-0 group-hover:opacity-100"
        style={{ display: 'flex', alignItems: 'center', gap: 2, transition: 'opacity 0.12s' }}
      >
        {QUICK_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => onToggle(emoji)}
            title="Reager"
            style={{
              width: 22,
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.72rem',
              borderRadius: 6,
              cursor: 'pointer',
              background: 'transparent',
              border: 'none',
              opacity: 0.7,
              transition: 'opacity 0.1s, background 0.1s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; (e.currentTarget as HTMLButtonElement).style.background = C.surface2 }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.7'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  )
}
