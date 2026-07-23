// app/admin/preprod/[id]/PostProdTaskForm.tsx
'use client'

import { useState } from 'react'
import { addPostProdBoardTask, type PostProdDestination } from '@/lib/actions/pipeline'
import type { PostProdBoardLane } from '@/lib/actions/pipeline'

const C = {
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text:     '#EEEEF2',
  text2:    '#B4B4CC',
  text3:    '#8484A0',
  accent:   '#7C5CFC',
  accentBg: 'rgba(124,92,252,0.08)',
}

const ICONS = ['🎬', '🎨', '✂️', '🔊', '✨', '📸', '📁', '⭐']

type DestinationOption = { key: string; label: string; destination: PostProdDestination }

export function PostProdTaskForm({
  projectId, lanes, profiles, onAdded,
}: {
  projectId: string
  lanes: PostProdBoardLane[]
  profiles: { id: string; name: string | null; email: string; color: string | null }[]
  onAdded: () => void
}) {
  const options: DestinationOption[] = [
    ...lanes.map(lane => ({
      key: lane.laneId ?? lane.kind,
      label: lane.name,
      destination: (lane.kind === 'custom'
        ? { kind: 'custom' as const, laneId: lane.laneId as string }
        : { kind: lane.kind as 'video' | 'photo' }),
    })),
    { key: 'parallel', label: 'Parallell (hele post-produksjonen)', destination: { kind: 'parallel' as const } },
  ]

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [destinationKey, setDestinationKey] = useState(options[0]?.key ?? 'parallel')
  const [assigneeId, setAssigneeId] = useState('')
  const [color, setColor] = useState('#7C5CFC')
  const [icon, setIcon] = useState(ICONS[0])
  const [isReusable, setIsReusable] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    const trimmed = title.trim()
    if (!trimmed || saving) return
    const destination = options.find(o => o.key === destinationKey)?.destination
    if (!destination) return

    setSaving(true)
    const result = await addPostProdBoardTask({
      projectId,
      title: trimmed,
      description: description.trim() || undefined,
      assigneeId: assigneeId || undefined,
      color,
      icon,
      destination,
      isReusable,
    })
    if (result.ok) {
      setTitle('')
      setDescription('')
      setAssigneeId('')
      setIsReusable(false)
      onAdded()
    }
    setSaving(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <select
        value={destinationKey}
        onChange={e => setDestinationKey(e.target.value)}
        style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 10px' }}
      >
        {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
      </select>

      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Navn på oppgave, f.eks. VFX"
        style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 10px', outline: 'none' }}
      />
      <input
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Beskrivelse (valgfritt)"
        style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text2, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 10px', outline: 'none' }}
      />

      <select
        value={assigneeId}
        onChange={e => setAssigneeId(e.target.value)}
        style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 10px' }}
      >
        <option value="">Ikke tildelt ennå</option>
        {profiles.map(p => <option key={p.id} value={p.id}>{p.name ?? p.email}</option>)}
      </select>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: 32, height: 28, border: `1px solid ${C.border}`, borderRadius: 6, background: 'transparent', padding: 0 }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {ICONS.map(i => (
            <button
              key={i}
              onClick={() => setIcon(i)}
              style={{ fontSize: '0.9rem', padding: '3px 6px', borderRadius: 5, cursor: 'pointer', background: icon === i ? C.accentBg : 'transparent', border: `1px solid ${icon === i ? 'rgba(124,92,252,0.3)' : C.border}` }}
            >
              {i}
            </button>
          ))}
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, cursor: 'pointer' }}>
        <input type="checkbox" checked={isReusable} onChange={e => setIsReusable(e.target.checked)} />
        Gjenbrukbar oppgave (lagres i biblioteket)
      </label>

      <button
        onClick={handleAdd}
        disabled={!title.trim() || saving}
        style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600, padding: '7px 12px', borderRadius: 6,
          cursor: title.trim() ? 'pointer' : 'not-allowed',
          background: title.trim() ? C.accentBg : 'transparent',
          color: title.trim() ? C.accent : C.text3,
          border: `1px solid ${title.trim() ? 'rgba(124,92,252,0.25)' : C.border}`,
          opacity: saving ? 0.6 : 1,
        }}
      >
        + Legg til i post-produksjon
      </button>
    </div>
  )
}
