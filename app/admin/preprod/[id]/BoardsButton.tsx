'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getOrCreateRootBoard } from '@/lib/actions/boards'
import { C } from '@/lib/admin-theme'

export default function BoardsButton({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  return (
    <button
      onClick={async () => {
        setLoading(true)
        const boardId = await getOrCreateRootBoard(projectId)
        if (boardId) router.push(`/admin/boards/${boardId}`)
        else setLoading(false)
      }}
      disabled={loading}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.accentBg, color: C.accent, border: `1px solid ${C.accent}40`, borderRadius: 8, padding: '9px 16px', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'var(--font-dm-sans)', cursor: 'pointer', opacity: loading ? 0.6 : 1 }}
    >
      ▦ {loading ? 'Åpner …' : 'Åpne boards'}
    </button>
  )
}
