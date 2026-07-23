// app/admin/preprod/[id]/PostProdBoard.tsx
'use client'

import { useEffect, useState } from 'react'
import {
  DndContext, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  getPostProdBoard, addTaskToLibrary, deleteTask, toggleTaskAssignee, getAllProfiles,
  createCustomLane, updateLaneDeadline, moveBoardTask,
  type PostProdBoard as PostProdBoardData, type PostProdBoardCard, type PostProdBoardLane, type PostProdDestination,
} from '@/lib/actions/pipeline'
import { updateTaskDueDate } from '@/lib/actions/calendar'
import { getAvatarColor } from '@/lib/avatar-colors'
import { PostProdTaskForm } from './PostProdTaskForm'

const C = {
  surface:  '#21212D',
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text:     '#EEEEF2',
  text2:    '#B4B4CC',
  text3:    '#8484A0',
  accent:   '#7C5CFC',
  accentBg: 'rgba(124,92,252,0.08)',
  danger:   '#E05555',
}

function SortableCard({ card, children }: { card: PostProdBoardCard; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  )
}

function DroppableLane({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id })
  return (
    <div ref={setNodeRef} data-lane-id={id} style={{ display: 'flex', flexDirection: 'column', gap: 4, minHeight: 8 }}>
      {children}
    </div>
  )
}

function Avatar({ id, name, size = 20 }: { id: string; name: string | null; size?: number }) {
  const initials = (name ?? 'U').split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
  const color = getAvatarColor({ id, color: null })
  return (
    <div title={name ?? 'Ukjent'} style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font-dm-sans)', fontSize: size * 0.4, fontWeight: 700, color: '#fff',
    }}>
      {initials}
    </div>
  )
}

export function PostProdBoard({
  projectId, shootEnd, postDeadlines, onDeadlineChange,
}: {
  projectId: string
  shootEnd: string | null
  postDeadlines: { video: string | null; photo: string | null }
  onDeadlineChange: (subType: 'video' | 'photo', date: string | null) => void
}) {
  const [board, setBoard] = useState<PostProdBoardData>({ projectType: null, lanes: [], parallel: [] })
  const [profiles, setProfiles] = useState<{ id: string; name: string | null; email: string; color: string | null }[]>([])
  const [openAssigneeFor, setOpenAssigneeFor] = useState<string | null>(null)
  const [newLaneName, setNewLaneName] = useState('')

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  function laneIdToDestination(laneKey: string): PostProdDestination | null {
    if (laneKey === 'parallel') return { kind: 'parallel' }
    if (laneKey === 'video' || laneKey === 'photo') return { kind: laneKey }
    return { kind: 'custom', laneId: laneKey }
  }

  function findContainerId(cardId: string): string | null {
    if (board.parallel.some(c => c.id === cardId)) return 'parallel'
    for (const lane of board.lanes) {
      if (lane.cards.some(c => c.id === cardId)) return lane.laneId ?? lane.kind
    }
    return null
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    const activeId = active.id as string
    // over.id er enten en kort-id (sluppet oppå et annet kort) eller en
    // lane-container-id (sluppet i tomt rom i en lane via data-lane-id).
    const overId = over.id as string
    if (activeId === overId) return

    const overIsCard = board.parallel.some(c => c.id === overId) || board.lanes.some(l => l.cards.some(c => c.id === overId))

    const targetContainerId = overIsCard ? findContainerId(overId) : overId
    if (!targetContainerId) return

    const destination = laneIdToDestination(targetContainerId)
    if (!destination) return

    const beforeTaskId = overIsCard && overId !== activeId ? overId : null

    // Ingen optimistisk lokal oppdatering — brettet oppdateres når
    // moveBoardTask er ferdig og refetch() henter fasit fra serveren.
    await moveBoardTask(activeId, destination, beforeTaskId)
    refetch()
  }

  async function refetch() {
    const data = await getPostProdBoard(projectId)
    setBoard(data)
  }

  useEffect(() => {
    refetch()
    getAllProfiles().then(setProfiles)
  }, [projectId])

  async function handleToggleAssignee(taskId: string, profileId: string) {
    await toggleTaskAssignee(taskId, profileId)
    refetch()
  }

  async function handleDueDate(taskId: string, date: string | null) {
    await updateTaskDueDate(taskId, date)
    refetch()
  }

  async function handleDelete(taskId: string) {
    await deleteTask(taskId)
    refetch()
  }

  async function handleSaveToLibrary(taskId: string) {
    await addTaskToLibrary(taskId)
  }

  async function handleCreateLane() {
    const trimmed = newLaneName.trim()
    if (!trimmed) return
    setNewLaneName('')
    await createCustomLane(projectId, trimmed)
    refetch()
  }

  function laneDeadlineValue(lane: PostProdBoardLane): string {
    if (lane.kind === 'video') return postDeadlines.video ?? ''
    if (lane.kind === 'photo') return postDeadlines.photo ?? ''
    return lane.deadline ?? ''
  }

  // Foreslår frister bakover fra shootEnd til lane.deadline, jevnt fordelt
  // over kortene, uten å overskrive kort som allerede har en manuelt satt
  // due_date. Samme algoritme som PostCrewSection hadde, portert hit.
  async function suggestDueDates(lane: PostProdBoardLane, deadline: string) {
    if (!deadline) return
    const start = shootEnd ? new Date(shootEnd) : new Date()
    const end = new Date(deadline)
    const totalMs = Math.max(end.getTime() - start.getTime(), 0)
    const n = lane.cards.length
    if (n === 0) return
    await Promise.all(lane.cards.map((card, i) => {
      if (card.dueDate) return Promise.resolve()
      const suggested = new Date(start.getTime() + totalMs * ((i + 1) / n)).toISOString().slice(0, 10)
      return updateTaskDueDate(card.id, suggested)
    }))
    refetch()
  }

  function handleLaneDeadlineChange(lane: PostProdBoardLane, value: string) {
    const date = value || null
    if (lane.kind === 'video' || lane.kind === 'photo') {
      onDeadlineChange(lane.kind, date)
    } else if (lane.laneId) {
      updateLaneDeadline(lane.laneId, date)
    }
    if (date) suggestDueDates(lane, date)
  }

  function renderCard(card: PostProdBoardCard) {
    const isOpen = openAssigneeFor === card.id
    return (
      <SortableCard key={card.id} card={card}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 7,
        background: C.surface2, border: `1px solid ${card.color ?? C.border}`, position: 'relative',
      }}>
        {card.icon && <span style={{ fontSize: '0.85rem' }}>{card.icon}</span>}
        <span style={{ flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text }}>{card.title}</span>
        <input
          type="date"
          value={card.dueDate ?? ''}
          onChange={e => handleDueDate(card.id, e.target.value || null)}
          title="Frist"
          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: card.dueDate ? C.text2 : C.text3, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 5, padding: '2px 5px', outline: 'none' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {card.assignees.map(a => <Avatar key={a.id} id={a.id} name={a.name} />)}
        </div>
        <button onClick={() => setOpenAssigneeFor(isOpen ? null : card.id)} title="Tildel" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, padding: 2, lineHeight: 0 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
        </button>
        <button onClick={() => handleSaveToLibrary(card.id)} title="Lagre i bibliotek" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, padding: 2, lineHeight: 0, fontSize: '0.7rem' }}>
          ★
        </button>
        <button onClick={() => handleDelete(card.id)} title="Slett" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, padding: 2, lineHeight: 0 }}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 2l8 8M10 2L2 10" />
          </svg>
        </button>

        {isOpen && (
          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 50, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', minWidth: 200, padding: '3px 0' }}>
            {profiles.map(p => {
              const isAssigned = card.assignees.some(a => a.id === p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => handleToggleAssignee(card.id, p.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 12px', background: isAssigned ? C.accentBg : 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <Avatar id={p.id} name={p.name} size={22} />
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: isAssigned ? C.accent : C.text, flex: 1 }}>{p.name ?? p.email}</span>
                  {isAssigned && <span style={{ color: C.accent }}>✓</span>}
                </button>
              )
            })}
          </div>
        )}
      </div>
      </SortableCard>
    )
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3 }}>
        Post-produksjon
      </p>

      {board.parallel.length > 0 && (
        <div>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.accent, marginBottom: 6 }}>
            Parallelt gjennom hele post-produksjonen
          </p>
          <SortableContext items={board.parallel.map(c => c.id)} strategy={verticalListSortingStrategy}>
            <DroppableLane id="parallel">
              {board.parallel.map(renderCard)}
            </DroppableLane>
          </SortableContext>
        </div>
      )}

      {board.lanes.map(lane => (
        <div key={lane.laneId ?? lane.kind}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 7, marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 4, height: 4, borderRadius: '50%', background: lane.color ?? C.accent, flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: lane.color ?? C.text3 }}>
                {lane.name}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3 }}>Leveringsfrist</span>
              <input
                type="date"
                value={laneDeadlineValue(lane)}
                onChange={e => handleLaneDeadlineChange(lane, e.target.value)}
                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text2, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 5, padding: '3px 6px', outline: 'none' }}
              />
            </div>
          </div>
          <SortableContext items={lane.cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
            <DroppableLane id={lane.laneId ?? lane.kind}>
              {lane.cards.map(renderCard)}
            </DroppableLane>
          </SortableContext>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={newLaneName}
          onChange={e => setNewLaneName(e.target.value)}
          placeholder="Ny lane, f.eks. Animasjon"
          style={{ flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', outline: 'none' }}
        />
        <button
          onClick={handleCreateLane}
          disabled={!newLaneName.trim()}
          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, padding: '6px 12px', borderRadius: 6, cursor: newLaneName.trim() ? 'pointer' : 'not-allowed', background: 'transparent', color: C.text3, border: `1px solid ${C.border}` }}
        >
          + Ny lane
        </button>
      </div>

      <PostProdTaskForm projectId={projectId} lanes={board.lanes} profiles={profiles} onAdded={refetch} />
    </div>
    </DndContext>
  )
}
