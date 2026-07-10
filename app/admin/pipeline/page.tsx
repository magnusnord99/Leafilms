'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import {
  getProjectsForPipeline, updatePipelineStage, setProjectType,
  getTasksForProjects, getAllProfiles, toggleTaskAssignee, updateTaskStatus,
  advanceFromKontraktUnsigned, assignQuoteAndMove, setQuoteAssignee, setInvoiceAssignee,
} from '@/lib/actions/pipeline'
import { PIPELINE_STAGES, PipelineStage, ProjectType, ProjectWithPipeline, Task } from '@/lib/types'
import { C } from '@/lib/admin-theme'
import { getAvatarColor } from '@/lib/avatar-colors'

type Profile = { id: string; name: string | null; email: string; color: string | null }

const accentBorder = 'rgba(124,92,252,0.35)'

// Gruppe 1: Lead → Tilbud (før kontrakt) — stålblå
// Gruppe 2: Kontrakt → Produksjon — gull
// Gruppe 3: Post & Levering — lilla
// Gruppe 4: Fakturert & Videresalg — grønn
const STAGE_ACCENT: Record<PipelineStage, string> = {
  lead:          '#4A8FA8',
  møte:          '#4A8FA8',
  tilbud_sendt:  '#4A8FA8',
  kontrakt:      C.accent,
  pre_prod:      C.accent,
  produksjon:    C.accent,
  post_prod:     '#7C5CFC',
  levering:      '#7C5CFC',
  fakturert:     '#4CAF7D',
  videresalg:    '#4CAF7D',
}

const TYPE_OPTIONS: { value: ProjectType; label: string }[] = [
  { value: 'video', label: 'Video' },
  { value: 'photo', label: 'Foto'  },
  { value: 'mixed', label: 'Begge' },
]

// ─── Kontrakt-advarsel — vises når man prøver å flytte fra kontrakt uten signering ──

function KontraktWarningModal({
  projectTitle,
  onConfirm,
  onCancel,
  loading,
}: {
  projectTitle: string
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)' }}
      onClick={onCancel}
    >
      <div
        style={{ background: C.surface, border: `1px solid rgba(240,165,0,0.3)`, borderRadius: 10, padding: '24px 28px', width: 360, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F0A500" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.88rem', fontWeight: 600, color: C.text }}>
            Kontrakten er ikke signert
          </p>
        </div>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, marginBottom: 8, lineHeight: 1.6 }}>
          <span style={{ color: C.text2 }}>{projectTitle}</span> har ikke en signert kontrakt enda.
        </p>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: '#F0A500', marginBottom: 20, lineHeight: 1.5 }}>
          Hvis du fortsetter vil det bli notert på prosjektet at kontrakten ikke er signert.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onCancel}
            style={{ flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 500, padding: '8px 0', borderRadius: 6, border: `1px solid ${C.border}`, background: 'none', color: C.text2, cursor: 'pointer' }}
          >
            Avbryt
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{ flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, padding: '8px 0', borderRadius: 6, border: 'none', background: '#F0A500', color: '#0C0B09', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
          >
            {loading ? '...' : 'Flytt uansett'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Tilbud-assign modal — vises når man drar til Sende tilbud uten ansvarlig ─

function TilbudAssignModal({
  projectTitle,
  profiles,
  onConfirm,
  onCancel,
  loading,
}: {
  projectTitle: string
  profiles: { id: string; name: string | null; email: string }[]
  onConfirm: (assigneeId: string) => void
  onCancel: () => void
  loading: boolean
}) {
  const [selectedId, setSelectedId] = useState('')

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)' }}
      onClick={onCancel}
    >
      <div
        style={{ background: C.surface, border: `1px solid rgba(124,92,252,0.5)`, borderRadius: 12, padding: '24px 28px', width: 380, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}
        onClick={e => e.stopPropagation()}
      >
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', fontWeight: 700, color: C.text, marginBottom: 6 }}>
          👤 Hvem sender tilbudet?
        </p>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, marginBottom: 18 }}>
          <em>«{projectTitle}»</em> flyttes til Sende tilbud — tildel ansvarlig.
        </p>
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          style={{
            width: '100%', boxSizing: 'border-box',
            fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem',
            color: selectedId ? C.text : C.text3,
            background: C.surface2, border: `1px solid rgba(124,92,252,0.4)`,
            borderRadius: 8, padding: '9px 12px', outline: 'none', marginBottom: 18,
          }}
        >
          <option value=''>Velg teammedlem...</option>
          {profiles.map(p => (
            <option key={p.id} value={p.id}>{p.name ?? p.email}</option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', padding: '9px 18px', borderRadius: 8, background: 'transparent', color: C.text3, border: `1px solid ${C.border}`, cursor: 'pointer' }}
          >
            Avbryt
          </button>
          <button
            onClick={() => selectedId && onConfirm(selectedId)}
            disabled={!selectedId || loading}
            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600, padding: '9px 20px', borderRadius: 8, background: C.accent, color: '#fff', border: 'none', cursor: (!selectedId || loading) ? 'default' : 'pointer', opacity: (!selectedId || loading) ? 0.5 : 1, transition: 'opacity 0.15s' }}
          >
            {loading ? 'Flytter...' : 'Flytt prosjekt →'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Type modal — vises når man drar til post_prod uten project_type ──────────

function TypeModal({
  projectTitle,
  onSelect,
  onCancel,
}: {
  projectTitle: string
  onSelect: (type: ProjectType) => void
  onCancel: () => void
}) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)' }}
      onClick={onCancel}
    >
      <div
        style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '24px 28px', width: 320, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
        onClick={e => e.stopPropagation()}
      >
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.text, marginBottom: 4 }}>
          Innholdstype
        </p>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, marginBottom: 20 }}>
          Hva produseres for <span style={{ color: C.text2 }}>{projectTitle}</span>?
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          {TYPE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => onSelect(opt.value)}
              style={{
                flex: 1,
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.78rem',
                fontWeight: 500,
                padding: '9px 0',
                borderRadius: 6,
                border: `1px solid ${C.border}`,
                background: C.surface2,
                color: C.text2,
                cursor: 'pointer',
                transition: 'border-color 0.12s, color 0.12s, background 0.12s',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.borderColor = C.accent
                el.style.color = C.accent
                el.style.background = C.accentBg
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.borderColor = C.border
                el.style.color = C.text2
                el.style.background = C.surface2
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          onClick={onCancel}
          style={{ width: '100%', marginTop: 10, fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0' }}
        >
          Avbryt
        </button>
      </div>
    </div>
  )
}

// ─── Mini assignee picker for pipeline tasks ─────────────────────────────────

function MiniAssigneePicker({ task, profiles, onToggle }: {
  task: Task
  profiles: Profile[]
  onToggle: (taskId: string, profileId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        title="Tildel oppgave"
        style={{
          display: 'flex', alignItems: 'center', gap: 3,
          padding: '2px 6px', borderRadius: 4, cursor: 'pointer',
          background: open ? C.accentBg : 'transparent',
          border: `1px solid ${open ? accentBorder : C.border}`,
          transition: 'all 0.12s',
        }}
      >
        {task.assignees.length > 0 ? (
          <div style={{ display: 'flex' }}>
            {task.assignees.slice(0, 3).map((a, i) => (
              <span key={a.id} style={{
                width: 16, height: 16, borderRadius: '50%',
                background: getAvatarColor(a), color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.5rem', fontWeight: 700,
                marginLeft: i > 0 ? -4 : 0,
                border: `1.5px solid ${C.surface}`,
                position: 'relative', zIndex: 3 - i,
              }}>
                {(a.name ?? a.email)[0].toUpperCase()}
              </span>
            ))}
          </div>
        ) : (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.text3} strokeWidth="2" strokeLinecap="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
        )}
        <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
          <path d="M1 2L3.5 5L6 2" stroke={C.text3} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', bottom: 'calc(100% + 4px)', right: 0, zIndex: 200,
          background: C.surface2, border: `1px solid ${C.border}`,
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          minWidth: 190, maxHeight: 220, overflowY: 'auto', padding: '3px 0',
        }}>
          {profiles.length === 0 && (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, padding: '8px 12px' }}>Ingen brukere</p>
          )}
          {profiles.map(p => {
            const isAssigned = task.assignees.some(a => a.id === p.id)
            return (
              <button
                key={p.id}
                onClick={() => { onToggle(task.id, p.id); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '6px 12px',
                  background: isAssigned ? C.accentBg : 'none',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                }}
                onMouseEnter={e => { if (!isAssigned) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={e => { if (!isAssigned) (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
              >
                <span style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  background: isAssigned ? getAvatarColor(p) : C.surface,
                  border: `1px solid ${isAssigned ? getAvatarColor(p) : C.border}`,
                  color: isAssigned ? '#fff' : C.text2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.6rem', fontWeight: 700,
                }}>
                  {(p.name ?? p.email)[0].toUpperCase()}
                </span>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: isAssigned ? C.accent : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {p.name ?? p.email}
                </span>
                {isAssigned && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M1.5 5L4 7.5L8.5 2.5" stroke={C.accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── QuoteAssigneePicker — enkeltperson assignee for tilbud ──────────────────

function QuoteAssigneePicker({ projectId, assignee, profiles, onAssigned }: {
  projectId: string
  assignee: Profile | null
  profiles: Profile[]
  onAssigned: (profile: Profile | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function select(profile: Profile | null) {
    setSaving(true)
    setOpen(false)
    await setQuoteAssignee(projectId, profile?.id ?? null)
    onAssigned(profile)
    setSaving(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        title={assignee ? `Tilbud-ansvarlig: ${assignee.name ?? assignee.email}` : 'Tildel tilbud-ansvarlig'}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '3px 7px 3px 5px', borderRadius: 20, cursor: saving ? 'wait' : 'pointer',
          background: open ? C.accentBg : assignee ? 'rgba(74,143,168,0.12)' : C.surface2,
          border: `1px solid ${open ? accentBorder : assignee ? 'rgba(74,143,168,0.4)' : C.border}`,
          transition: 'all 0.12s',
          opacity: saving ? 0.6 : 1,
        }}
      >
        {assignee ? (
          <span style={{
            width: 18, height: 18, borderRadius: '50%',
            background: getAvatarColor(assignee), color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.52rem', fontWeight: 700, flexShrink: 0,
          }}>
            {(assignee.name ?? assignee.email)[0].toUpperCase()}
          </span>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.text3} strokeWidth="2" strokeLinecap="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
        )}
        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: assignee ? getAvatarColor(assignee) : C.text3, whiteSpace: 'nowrap', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {assignee ? (assignee.name ?? assignee.email).split(' ')[0] : 'Tildel'}
        </span>
        <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
          <path d="M1 2L3.5 5L6 2" stroke={C.text3} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200,
          background: C.surface2, border: `1px solid ${C.border}`,
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          minWidth: 180, padding: '3px 0',
        }}>
          {assignee && (
            <button
              onClick={() => select(null)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
            >
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>Fjern tildeling</span>
            </button>
          )}
          {assignee && <div style={{ height: 1, background: C.border, margin: '2px 0' }} />}
          {profiles.map(p => {
            const isSelected = p.id === assignee?.id
            return (
              <button
                key={p.id}
                onClick={() => select(p)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 12px', background: isSelected ? C.accentBg : 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
              >
                <span style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, background: isSelected ? getAvatarColor(p) : C.surface, border: `1px solid ${isSelected ? getAvatarColor(p) : C.border}`, color: isSelected ? '#fff' : C.text2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700 }}>
                  {(p.name ?? p.email)[0].toUpperCase()}
                </span>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: isSelected ? getAvatarColor(p) : C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name ?? p.email}
                </span>
                {isSelected && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M1.5 5L4 7.5L8.5 2.5" stroke={getAvatarColor(p)} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── InvoiceAssigneePicker — faktura-ansvarlig ────────────────────────────────

function InvoiceAssigneePicker({ projectId, assignee, profiles, onAssigned }: {
  projectId: string
  assignee: Profile | null
  profiles: Profile[]
  onAssigned: (profile: Profile | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function select(profile: Profile | null) {
    setSaving(true)
    setOpen(false)
    await setInvoiceAssignee(projectId, profile?.id ?? null)
    onAssigned(profile)
    setSaving(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        title={assignee ? `Faktura-ansvarlig: ${assignee.name ?? assignee.email}` : 'Tildel faktura-ansvarlig'}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '3px 7px 3px 5px', borderRadius: 20, cursor: saving ? 'wait' : 'pointer',
          background: open ? C.accentBg : assignee ? 'rgba(76,175,125,0.12)' : C.surface2,
          border: `1px solid ${open ? accentBorder : assignee ? 'rgba(76,175,125,0.4)' : C.border}`,
          transition: 'all 0.12s',
          opacity: saving ? 0.6 : 1,
        }}
      >
        {assignee ? (
          <span style={{ width: 18, height: 18, borderRadius: '50%', background: getAvatarColor(assignee), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.52rem', fontWeight: 700, flexShrink: 0 }}>
            {(assignee.name ?? assignee.email)[0].toUpperCase()}
          </span>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.text3} strokeWidth="2" strokeLinecap="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
        )}
        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: assignee ? getAvatarColor(assignee) : C.text3, whiteSpace: 'nowrap', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {assignee ? (assignee.name ?? assignee.email).split(' ')[0] : 'Tildel'}
        </span>
        <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
          <path d="M1 2L3.5 5L6 2" stroke={C.text3} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 200, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', minWidth: 180, padding: '3px 0' }}>
          {assignee && (
            <>
              <button onClick={() => select(null)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>Fjern tildeling</span>
              </button>
              <div style={{ height: 1, background: C.border, margin: '2px 0' }} />
            </>
          )}
          {profiles.map(p => {
            const isSelected = p.id === assignee?.id
            return (
              <button key={p.id} onClick={() => select(p)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 12px', background: isSelected ? C.accentBg : 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, background: isSelected ? getAvatarColor(p) : C.surface, border: `1px solid ${isSelected ? getAvatarColor(p) : C.border}`, color: isSelected ? '#fff' : C.text2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', fontWeight: 700 }}>
                  {(p.name ?? p.email)[0].toUpperCase()}
                </span>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: isSelected ? getAvatarColor(p) : C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name ?? p.email}
                </span>
                {isSelected && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M1.5 5L4 7.5L8.5 2.5" stroke={getAvatarColor(p)} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── DraggableCard ────────────────────────────────────────────────────────────

function DraggableCard({
  project,
  tasks,
  profiles,
  onStageAdvance,
  onAssigneeToggle,
  onTaskStatusToggle,
  onQuoteAssigned,
  onInvoiceAssigned,
  advancing,
  isDragOverlay = false,
}: {
  project: ProjectWithPipeline
  tasks: Task[]
  profiles: Profile[]
  onStageAdvance: (id: string, stage: PipelineStage) => void
  onAssigneeToggle: (taskId: string, profileId: string) => void
  onTaskStatusToggle: (taskId: string, currentStatus: Task['status']) => void
  onQuoteAssigned: (projectId: string, profile: Profile | null) => void
  onInvoiceAssigned: (projectId: string, profile: Profile | null) => void
  advancing: boolean
  isDragOverlay?: boolean
}) {
  const [showTypePrompt, setShowTypePrompt] = useState(false)
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: project.id,
    data: { project },
  })

  const [titleHover, setTitleHover] = useState(false)
  const currentIndex = PIPELINE_STAGES.findIndex(s => s.value === project.pipeline_stage)
  const nextStage = PIPELINE_STAGES[currentIndex + 1] ?? null
  const prevStage = PIPELINE_STAGES[currentIndex - 1] ?? null
  const stage = project.pipeline_stage
  const meetingAlreadySent = Boolean(project.pipeline_data?.meeting_link_sent_at)
  const isAdvancingToPostProd = nextStage?.value === 'post_prod'

  // Unique assignees across all tasks on this project
  const allAssignees = React.useMemo(() => {
    const seen = new Set<string>()
    const unique: { id: string; name: string | null; email: string }[] = []
    for (const t of tasks) {
      for (const a of t.assignees) {
        if (!seen.has(a.id)) { seen.add(a.id); unique.push(a) }
      }
    }
    return unique
  }, [tasks])

  const quoteAssignee = project.quote_assignee_id
    ? profiles.find(p => p.id === project.quote_assignee_id) ?? null
    : null

  const invoiceAssignee = project.invoice_assignee_id
    ? profiles.find(p => p.id === project.invoice_assignee_id) ?? null
    : null

  const titleHref =
    stage === 'lead'         ? `/admin/projects/${project.id}/contact`
    : stage === 'møte'       ? `/admin/projects/${project.id}/email`
    : stage === 'tilbud_sendt' ? `/admin/projects/${project.id}?tab=pitch`
    : stage === 'kontrakt'   ? `/admin/projects/${project.id}?tab=kontrakt`
    : stage === 'pre_prod'   ? `/admin/preprod/${project.id}`
    : stage === 'post_prod'  ? `/admin/postprod/${project.id}`
    : stage === 'levering'   ? `/admin/projects/${project.id}/email`
    : stage === 'fakturert'  ? `/admin/faktura/${project.id}`
    : stage === 'videresalg' ? `/admin/projects/${project.id}/email`
    : `/admin/projects/${project.id}`

  function handleNextStageClick(e: React.MouseEvent) {
    e.stopPropagation()
    if (!nextStage) return
    if (isAdvancingToPostProd && !project.project_type) {
      setShowTypePrompt(true)
    } else {
      onStageAdvance(project.id, nextStage.value)
    }
  }

  function handleTypeSelect(e: React.MouseEvent, type: ProjectType) {
    e.stopPropagation()
    setShowTypePrompt(false)
    onStageAdvance(project.id, 'post_prod')
    setProjectType(project.id, type).catch(() => {})
  }

  const accent = STAGE_ACCENT[stage] ?? C.accent

  const style: React.CSSProperties = isDragOverlay
    ? {
        background: C.surface2,
        border: `1px solid ${accentBorder}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 6,
        padding: '12px 14px',
        paddingLeft: 12,
        boxShadow: '0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(124,92,252,0.2)',
        cursor: 'grabbing',
        width: 240,
        opacity: 0.95,
      }
    : {
        background: isDragging ? C.surface2 : C.surface,
        border: `1px solid ${isDragging ? accentBorder : C.border}`,
        borderLeft: `3px solid ${isDragging ? accent : accent + '99'}`,
        borderRadius: 6,
        padding: '12px 14px',
        paddingLeft: 12,
        opacity: isDragging ? 0.4 : 1,
        cursor: 'default',
        transition: 'opacity 0.15s, border-color 0.12s, background 0.12s',
        transform: CSS.Translate.toString(transform),
      }

  return (
    <div ref={isDragOverlay ? undefined : setNodeRef} style={style}>
      {/* Card header — title + grip */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
          {isDragOverlay ? (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 500, color: C.text, lineHeight: 1.35, userSelect: 'none' }}>
              {project.title}
            </p>
          ) : (
            <Link
              href={titleHref}
              onMouseEnter={() => setTitleHover(true)}
              onMouseLeave={() => setTitleHover(false)}
              style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.78rem',
                fontWeight: 500,
                color: titleHover ? C.accent : C.text,
                lineHeight: 1.35,
                textDecoration: titleHover ? 'underline' : 'none',
                transition: 'color 0.12s',
              }}
            >
              {project.title}
            </Link>
          )}
          <svg
            {...(isDragOverlay ? {} : { ...attributes, ...listeners })}
            width="12" height="12" viewBox="0 0 12 12" fill="none"
            style={{ flexShrink: 0, marginTop: 2, opacity: 0.35, cursor: isDragOverlay ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none' }}
          >
            <circle cx="4" cy="3" r="1" fill={C.text2} /><circle cx="8" cy="3" r="1" fill={C.text2} />
            <circle cx="4" cy="6" r="1" fill={C.text2} /><circle cx="8" cy="6" r="1" fill={C.text2} />
            <circle cx="4" cy="9" r="1" fill={C.text2} /><circle cx="8" cy="9" r="1" fill={C.text2} />
          </svg>
        </div>
        {project.customer && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginTop: 2 }}>
            {project.customer.name}{project.customer.company ? ` · ${project.customer.company}` : ''}
          </p>
        )}
      </div>

      {/* Actions */}
      {!isDragOverlay && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
          {stage === 'lead' ? (
            <ActionBtn href={`/admin/projects/${project.id}/contact`} primary>Ta kontakt</ActionBtn>
          ) : stage === 'møte' ? (
            meetingAlreadySent ? (
              project.pipeline_data?.meeting_link ? (
                <ActionBtn onClick={e => {
                  e.stopPropagation()
                  window.open(project.pipeline_data!.meeting_link!, '_blank', 'noopener,noreferrer')
                }}>Bli med i møte</ActionBtn>
              ) : (
                <ActionBtn href={`/admin/projects/${project.id}/email`}>Send møtelink</ActionBtn>
              )
            ) : (
              <ActionBtn href={`/admin/projects/${project.id}/email`} primary>Send møtelink</ActionBtn>
            )
          ) : stage === 'pre_prod' ? (
            <ActionBtn href={`/admin/preprod/${project.id}`} primary>Pre-prod →</ActionBtn>
          ) : stage === 'post_prod' ? (
            <ActionBtn href={`/admin/postprod/${project.id}`} primary>Post-prod →</ActionBtn>
          ) : stage === 'tilbud_sendt' ? (
            <ActionBtn href={`/admin/projects/${project.id}?tab=pitch`} primary>Send tilbud</ActionBtn>
          ) : stage === 'levering' ? (
            <ActionBtn href={`/admin/projects/${project.id}/email`} primary>Send leveringsepost</ActionBtn>
          ) : stage === 'videresalg' ? (
            <ActionBtn href={`/admin/projects/${project.id}/email`} primary>Send e-post</ActionBtn>
          ) : stage === 'kontrakt' ? (
            <>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem',
                color: C.text3, background: C.surface2,
                border: `1px solid ${C.border}`,
                padding: '5px 9px', borderRadius: 5,
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#F0A500', flexShrink: 0, animation: 'pulse 2s infinite' }} />
                Venter på signering
              </span>
              <ActionBtn href={`/admin/projects/${project.id}?tab=kontrakt`}>Se kontrakt</ActionBtn>
            </>
          ) : stage === 'produksjon' ? (
            <ActionBtn href={`/admin/projects/${project.id}`}>Prosjekt →</ActionBtn>
          ) : stage === 'fakturert' ? (
            <ActionBtn href={`/admin/faktura/${project.id}`} primary>Send faktura →</ActionBtn>
          ) : (
            <ActionBtn href={`/admin/projects/${project.id}`}>Oversikt</ActionBtn>
          )}
          {prevStage && (
            <ActionBtn disabled={advancing} onClick={e => { e.stopPropagation(); onStageAdvance(project.id, prevStage.value) }} ghost>
              ← {prevStage.label}
            </ActionBtn>
          )}
          {nextStage && (
            <ActionBtn disabled={advancing} onClick={handleNextStageClick} accent>
              → {nextStage.label}
            </ActionBtn>
          )}
        </div>
      )}

      {/* Footer — leveranse + assignees */}
      {!isDragOverlay && (project.delivery_description || stage === 'tilbud_sendt' || stage === 'fakturert' || allAssignees.length > 0) && (
        <div style={{ marginTop: 9, paddingTop: 9, borderTop: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {project.delivery_description && (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              📦 {project.delivery_description}
            </p>
          )}
          {stage === 'tilbud_sendt' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3, flexShrink: 0 }}>Ansvarlig:</span>
              <QuoteAssigneePicker
                projectId={project.id}
                assignee={quoteAssignee}
                profiles={profiles}
                onAssigned={profile => onQuoteAssigned(project.id, profile)}
              />
            </div>
          )}
          {stage === 'fakturert' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3, flexShrink: 0 }}>Ansvarlig:</span>
              <InvoiceAssigneePicker
                projectId={project.id}
                assignee={invoiceAssignee}
                profiles={profiles}
                onAssigned={profile => onInvoiceAssigned(project.id, profile)}
              />
            </div>
          )}
          {allAssignees.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3 }}>Team:</span>
              <div style={{ display: 'flex' }}>
                {allAssignees.slice(0, 5).map((a, i) => (
                  <span key={a.id} title={a.name ?? a.email} style={{
                    width: 16, height: 16, borderRadius: '50%',
                    background: getAvatarColor(a), color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-dm-sans)', fontSize: '0.5rem', fontWeight: 700,
                    marginLeft: i > 0 ? -4 : 0,
                    border: `1.5px solid ${C.surface}`,
                    position: 'relative', zIndex: 5 - i,
                  }}>
                    {(a.name ?? a.email)[0].toUpperCase()}
                  </span>
                ))}
                {allAssignees.length > 5 && (
                  <span style={{ width: 16, height: 16, borderRadius: '50%', background: C.surface2, color: C.text3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5rem', fontWeight: 700, marginLeft: -4, border: `1.5px solid ${C.surface}` }}>
                    +{allAssignees.length - 5}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Type prompt */}
      {showTypePrompt && !isDragOverlay && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 5, padding: 10, marginTop: 8 }}
        >
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text2, marginBottom: 8 }}>
            Hva inneholder prosjektet?
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            {TYPE_OPTIONS.map(opt => (
              <button key={opt.value} type="button" onClick={e => handleTypeSelect(e, opt.value)}
                style={{ padding: '5px 10px', fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 500, borderRadius: 5, border: `1px solid ${C.border}`, background: C.surface, color: C.text2, cursor: 'pointer' }}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ActionBtn({ href, onClick, children, primary, ghost, accent, disabled }: {
  href?: string; onClick?: (e: React.MouseEvent) => void; children: React.ReactNode
  primary?: boolean; ghost?: boolean; accent?: boolean; disabled?: boolean
}) {
  const s: React.CSSProperties = {
    fontFamily: 'var(--font-dm-sans)',
    fontSize: '0.72rem',
    fontWeight: 500,
    padding: '5px 10px',
    borderRadius: 5,
    cursor: disabled ? 'default' : 'pointer',
    border: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    textDecoration: 'none',
    opacity: disabled ? 0.4 : 1,
    transition: 'opacity 0.12s',
    ...(primary  && { background: C.accent,    color: '#fff'   }),
    ...(accent   && { background: 'transparent', color: C.accent }),
    ...(ghost    && { background: 'transparent', color: C.text3  }),
    ...(!primary && !ghost && !accent && { background: C.surface2, color: C.text2, border: `1px solid ${C.border}` }),
  }
  if (href) return <Link href={href} style={s} onClick={onClick}>{children}</Link>
  return <button style={s} onClick={onClick} disabled={disabled}>{children}</button>
}

// ─── DroppableColumn ──────────────────────────────────────────────────────────

function DroppableColumn({
  stage,
  projects,
  tasksByProject,
  profiles,
  onStageAdvance,
  onAssigneeToggle,
  onTaskStatusToggle,
  onQuoteAssigned,
  onInvoiceAssigned,
  isOver,
}: {
  stage: { value: PipelineStage; label: string }
  projects: ProjectWithPipeline[]
  tasksByProject: Record<string, Task[]>
  profiles: Profile[]
  onStageAdvance: (id: string, stage: PipelineStage) => void
  onAssigneeToggle: (taskId: string, profileId: string) => void
  onTaskStatusToggle: (taskId: string, currentStatus: Task['status']) => void
  onQuoteAssigned: (projectId: string, profile: Profile | null) => void
  onInvoiceAssigned: (projectId: string, profile: Profile | null) => void
  isOver: boolean
}) {
  const { setNodeRef } = useDroppable({ id: stage.value })

  const colAccent = STAGE_ACCENT[stage.value] ?? C.accent

  return (
    <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ paddingBottom: 8, marginBottom: 8, borderBottom: `1px solid ${isOver ? colAccent + '60' : C.border}`, transition: 'border-color 0.15s' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600, color: isOver ? colAccent : C.text2, textTransform: 'uppercase', letterSpacing: '0.06em', transition: 'color 0.15s', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: colAccent + 'AA', display: 'inline-block', flexShrink: 0 }} />
            {stage.label}
          </span>
          {projects.length > 0 && (
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, background: C.surface2, padding: '1px 7px', borderRadius: 10, fontWeight: 500 }}>
              {projects.length}
            </span>
          )}
        </div>
      </div>

      <div
        ref={setNodeRef}
        style={{
          flex: 1, minHeight: 80, display: 'flex', flexDirection: 'column', gap: 6,
          borderRadius: 6, padding: isOver ? '4px' : '0',
          background: isOver ? C.accentBg : 'transparent',
          border: isOver ? `1px dashed ${accentBorder}` : '1px solid transparent',
          transition: 'background 0.15s, border-color 0.15s, padding 0.15s',
        }}
      >
        {projects.map(project => (
          <DraggableCard
            key={project.id}
            project={project}
            tasks={tasksByProject[project.id] ?? []}
            profiles={profiles}
            onStageAdvance={onStageAdvance}
            onAssigneeToggle={onAssigneeToggle}
            onTaskStatusToggle={onTaskStatusToggle}
            onQuoteAssigned={onQuoteAssigned}
            onInvoiceAssigned={onInvoiceAssigned}
            advancing={false}
          />
        ))}
        {projects.length === 0 && (
          <div style={{ padding: '12px 0', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, opacity: isOver ? 0 : 0.4 }}>Tomt</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PipelinePage() {
  const [projects, setProjects] = useState<ProjectWithPipeline[]>([])
  const [tasksByProject, setTasksByProject] = useState<Record<string, Task[]>>({})
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [activeProject, setActiveProject] = useState<ProjectWithPipeline | null>(null)
  const [overStageId, setOverStageId] = useState<string | null>(null)
  const [pendingMove, setPendingMove] = useState<{ projectId: string; targetStage: PipelineStage } | null>(null)
  const [kontraktWarning, setKontraktWarning] = useState<{ projectId: string; projectTitle: string } | null>(null)
  const [kontraktWarningLoading, setKontraktWarningLoading] = useState(false)
  const [tilbudAssign, setTilbudAssign] = useState<{ projectId: string; projectTitle: string } | null>(null)
  const [tilbudAssignLoading, setTilbudAssignLoading] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  async function fetchAll() {
    setLoading(true)
    const [data, allProfiles] = await Promise.all([
      getProjectsForPipeline(),
      getAllProfiles(),
    ])
    setProjects(data)
    setProfiles(allProfiles)
    if (data.length > 0) {
      const tasks = await getTasksForProjects(data.map(p => p.id))
      setTasksByProject(tasks)
    }
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  function moveProject(projectId: string, targetStage: PipelineStage) {
    const project = projects.find(p => p.id === projectId)
    const currentIndex = PIPELINE_STAGES.findIndex(s => s.value === project?.pipeline_stage)
    const targetIndex = PIPELINE_STAGES.findIndex(s => s.value === targetStage)
    if (targetStage === 'tilbud_sendt' && !project?.quote_assignee_id) {
      setTilbudAssign({ projectId, projectTitle: project!.title })
      return
    }
    // Vis advarsel kun ved fremflytting fra kontrakt uten signering
    if (project?.pipeline_stage === 'kontrakt' && targetIndex > currentIndex && !(project.pipeline_data as { contract_signed?: boolean } | null)?.contract_signed) {
      setKontraktWarning({ projectId, projectTitle: project.title })
      return
    }
    setProjects(prev => prev.map(p =>
      p.id === projectId ? { ...p, pipeline_stage: targetStage } : p
    ))
    updatePipelineStage(projectId, targetStage).catch(() => fetchAll())
  }

  async function handleKontraktWarningConfirm() {
    if (!kontraktWarning) return
    setKontraktWarningLoading(true)
    const result = await advanceFromKontraktUnsigned(kontraktWarning.projectId)
    setKontraktWarningLoading(false)
    setKontraktWarning(null)
    if (result.ok) {
      await fetchAll()
    } else {
      alert(result.error ?? 'Noe gikk galt')
    }
  }

  async function handleTilbudAssignConfirm(assigneeId: string) {
    if (!tilbudAssign) return
    setTilbudAssignLoading(true)
    const result = await assignQuoteAndMove(tilbudAssign.projectId, assigneeId)
    setTilbudAssignLoading(false)
    setTilbudAssign(null)
    if (result.ok) {
      fetchAll()
    }
  }

  async function handleAssigneeToggle(taskId: string, profileId: string) {
    const profile = profiles.find(p => p.id === profileId)
    if (!profile) return
    setTasksByProject(prev => {
      const updated = { ...prev }
      for (const pid of Object.keys(updated)) {
        updated[pid] = updated[pid].map(t => {
          if (t.id !== taskId) return t
          const isAssigned = t.assignees.some(a => a.id === profileId)
          return {
            ...t,
            assignees: isAssigned
              ? t.assignees.filter(a => a.id !== profileId)
              : [...t.assignees, { id: profile.id, name: profile.name, email: profile.email }],
          }
        })
      }
      return updated
    })
    await toggleTaskAssignee(taskId, profileId)
  }

  function handleQuoteAssigned(projectId: string, profile: Profile | null) {
    setProjects(prev => prev.map(p =>
      p.id === projectId ? { ...p, quote_assignee_id: profile?.id ?? null } : p
    ))
  }

  function handleInvoiceAssigned(projectId: string, profile: Profile | null) {
    setProjects(prev => prev.map(p =>
      p.id === projectId ? { ...p, invoice_assignee_id: profile?.id ?? null } : p
    ))
  }

  async function handleTaskStatusToggle(taskId: string, currentStatus: Task['status']) {
    const nextStatus: Task['status'] = currentStatus === 'done' ? 'todo' : 'done'
    setTasksByProject(prev => {
      const updated = { ...prev }
      for (const pid of Object.keys(updated)) {
        updated[pid] = updated[pid].map(t =>
          t.id === taskId ? { ...t, status: nextStatus } : t
        )
      }
      return updated
    })
    const result = await updateTaskStatus(taskId, nextStatus)
    if (result.advanced && result.projectId && result.nextStage) {
      setProjects(prev => prev.map(p =>
        p.id === result.projectId ? { ...p, pipeline_stage: result.nextStage! } : p
      ))
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const project = projects.find(p => p.id === event.active.id)
    setActiveProject(project ?? null)
  }

  function handleDragOver(event: DragOverEvent) {
    setOverStageId(event.over?.id as string ?? null)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    const projectId = active.id as string
    const targetStage = over?.id as PipelineStage | undefined
    const project = projects.find(p => p.id === projectId)

    setActiveProject(null)
    setOverStageId(null)

    if (!targetStage || !project || project.pipeline_stage === targetStage) return

    if (targetStage === 'post_prod' && !project.project_type) {
      setPendingMove({ projectId, targetStage })
      return
    }

    moveProject(projectId, targetStage)
  }

  async function handleTypeModalSelect(type: ProjectType) {
    if (!pendingMove) return
    const { projectId } = pendingMove
    setPendingMove(null)
    // Sett type optimistisk, flytt til post_prod
    setProjects(prev => prev.map(p =>
      p.id === projectId ? { ...p, project_type: type, pipeline_stage: 'post_prod' } : p
    ))
    setProjectType(projectId, type).catch(() => fetchAll())
    updatePipelineStage(projectId, 'post_prod').catch(() => fetchAll())
  }

  const projectsByStage = PIPELINE_STAGES.reduce<Record<string, ProjectWithPipeline[]>>(
    (acc, stage) => {
      acc[stage.value] = projects.filter(p => (p.pipeline_stage ?? 'lead') === stage.value)
      return acc
    },
    {}
  )

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>Laster pipeline...</p>
      </div>
    )
  }

  const pendingProject = pendingMove ? projects.find(p => p.id === pendingMove.projectId) : null

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ padding: '24px 28px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.4rem', fontWeight: 600, color: C.text, lineHeight: 1.2, marginBottom: 2 }}>Pipeline</h1>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>
            {projects.length} prosjekt{projects.length !== 1 ? 'er' : ''} · dra for å flytte mellom steg · tildel oppgaver direkte på kortene
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/admin/projects">
            <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: C.surface2, color: C.text2, border: `1px solid ${C.border}` }}>
              Listevisning
            </button>
          </Link>
          <Link href="/admin/leads/new">
            <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', background: C.accent, color: '#fff', border: 'none' }}>
              + Ny lead
            </button>
          </Link>
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <div style={{ overflowX: 'auto', padding: '20px 28px 48px', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ display: 'flex', gap: 10, minWidth: 'max-content' }}>
            {PIPELINE_STAGES.map(stage => (
              <DroppableColumn
                key={stage.value}
                stage={stage}
                projects={projectsByStage[stage.value] ?? []}
                tasksByProject={tasksByProject}
                profiles={profiles}
                onStageAdvance={moveProject}
                onAssigneeToggle={handleAssigneeToggle}
                onTaskStatusToggle={handleTaskStatusToggle}
                onQuoteAssigned={handleQuoteAssigned}
                onInvoiceAssigned={handleInvoiceAssigned}
                isOver={overStageId === stage.value}
              />
            ))}
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activeProject ? (
            <DraggableCard
              project={activeProject}
              tasks={[]}
              profiles={[]}
              onStageAdvance={() => {}}
              onAssigneeToggle={() => {}}
              onTaskStatusToggle={() => {}}
              onQuoteAssigned={() => {}}
              onInvoiceAssigned={() => {}}
              advancing={false}
              isDragOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {pendingProject && (
        <TypeModal
          projectTitle={pendingProject.title}
          onSelect={handleTypeModalSelect}
          onCancel={() => setPendingMove(null)}
        />
      )}

      {kontraktWarning && (
        <KontraktWarningModal
          projectTitle={kontraktWarning.projectTitle}
          onConfirm={handleKontraktWarningConfirm}
          onCancel={() => setKontraktWarning(null)}
          loading={kontraktWarningLoading}
        />
      )}

      {tilbudAssign && (
        <TilbudAssignModal
          projectTitle={tilbudAssign.projectTitle}
          profiles={profiles}
          onConfirm={handleTilbudAssignConfirm}
          onCancel={() => setTilbudAssign(null)}
          loading={tilbudAssignLoading}
        />
      )}
    </div>
  )
}
