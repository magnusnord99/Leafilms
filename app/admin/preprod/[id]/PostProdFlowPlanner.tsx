// app/admin/preprod/[id]/PostProdFlowPlanner.tsx
'use client'

import { useState } from 'react'
import { addPlannedPostProdStep, deleteTask, type PostProdFlowTrack, type PlannedPostProdStep } from '@/lib/actions/pipeline'
import type { ProjectType } from '@/lib/types'

const C = {
  surface:  '#21212D',
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text:     '#EEEEF2',
  text2:    '#B4B4CC',
  text3:    '#8484A0',
  accent:   '#7C5CFC',
  accentBg: 'rgba(124,92,252,0.08)',
}

const INSERT_AT_END = '__end__'

export function PostProdFlowPlanner({
  projectId, projectType, tracks, plannedSteps, onStepAdded, onStepDeleted,
}: {
  projectId: string
  // Samme mønster som PostCrewSection i denne filen: project_type er typet
  // som ProjectType | null | undefined på ProjectWithPipeline, selv om det i
  // praksis alltid er satt før et prosjekt når pre-prod.
  projectType: ProjectType | null | undefined
  tracks: PostProdFlowTrack[]
  plannedSteps: PlannedPostProdStep[]
  onStepAdded: () => void
  onStepDeleted: (id: string) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [subType, setSubType] = useState<'video' | 'photo' | null>(projectType === 'mixed' ? 'video' : null)
  const [insertBeforeTitle, setInsertBeforeTitle] = useState(INSERT_AT_END)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const activeTrack = tracks.find(t => t.subType === subType) ?? tracks[0] ?? null

  async function handleAdd() {
    const trimmed = title.trim()
    if (!trimmed || saving) return
    setSaving(true)
    const result = await addPlannedPostProdStep({
      projectId,
      title: trimmed,
      description: description.trim() || undefined,
      insertBeforeTitle: insertBeforeTitle === INSERT_AT_END ? null : insertBeforeTitle,
      subType,
    })
    if (result.ok) {
      setTitle('')
      setDescription('')
      setInsertBeforeTitle(INSERT_AT_END)
      onStepAdded()
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    const result = await deleteTask(id)
    if (result.ok) onStepDeleted(id)
    setDeletingId(null)
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 18px' }}>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 14 }}>
        Planlagt for post-produksjon
      </p>

      {plannedSteps.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {plannedSteps.map(step => (
            <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 12px' }}>
              <span style={{ flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text }}>
                {step.title}
                {step.subType && (
                  <span style={{ marginLeft: 6, fontSize: '0.65rem', color: C.text3 }}>
                    ({step.subType === 'video' ? 'video' : 'foto'})
                  </span>
                )}
              </span>
              <button
                onClick={() => handleDelete(step.id)}
                disabled={deletingId === step.id}
                title="Fjern planlagt steg"
                style={{ background: 'none', border: 'none', cursor: deletingId === step.id ? 'wait' : 'pointer', color: C.text3, padding: 2, lineHeight: 0 }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M2 2l8 8M10 2L2 10" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {projectType === 'mixed' && (
          <div style={{ display: 'flex', gap: 6 }}>
            {(['video', 'photo'] as const).map(opt => (
              <button
                key={opt}
                onClick={() => { setSubType(opt); setInsertBeforeTitle(INSERT_AT_END) }}
                style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
                  background: subType === opt ? C.accentBg : 'transparent',
                  color: subType === opt ? C.accent : C.text3,
                  border: `1px solid ${subType === opt ? 'rgba(124,92,252,0.3)' : C.border}`,
                }}
              >
                {opt === 'video' ? 'Video' : 'Foto'}
              </button>
            ))}
          </div>
        )}

        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Navn på steg, f.eks. VFX og animasjon"
          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 10px', outline: 'none' }}
        />
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Beskrivelse (valgfritt)"
          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text2, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 10px', outline: 'none' }}
        />

        <select
          value={insertBeforeTitle}
          onChange={e => setInsertBeforeTitle(e.target.value)}
          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 10px' }}
        >
          {(activeTrack?.titles ?? []).map(t => (
            <option key={t} value={t}>Sett inn før: {t}</option>
          ))}
          <option value={INSERT_AT_END}>Sett inn sist</option>
        </select>

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
    </div>
  )
}
