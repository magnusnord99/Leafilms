'use client'

import { Fragment, useEffect, useState, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  getPostProdProjects, getTasksForProject, updateTaskStatus,
  reseedPostProdTasks, setProjectType,
  updateTaskNotes, updateTaskData, getCurrentUserProfile,
  rejectFeedbackAndReset, resetTaskAndSubsequent,
  getAllProfiles, toggleTaskAssignee,
  getProjectDeliverablesSection,
  updateProjectDeliverablesSection,
  setProjectLead, getTaskMessageCounts,
  deleteTask,
} from '@/lib/actions/pipeline'
import { updatePreprodTaskStatus } from '@/lib/actions/preprod'
import { updateTaskDueDate } from '@/lib/actions/calendar'
import { getSelectedImagesForProject } from '@/lib/actions/selection-albums'
import type { SelectedImageForEditor } from '@/lib/actions/selection-albums'
import { deleteImageComment, getGalleryIdForProject, getOrCreateDeliveryGallery } from '@/lib/actions/selections'
import type { ProjectType, Task, ProjectWithPipeline, DeliverableItem as SignedDeliverableItem } from '@/lib/types'
import TaskChatPanel from '@/components/task/TaskChatPanel'
import { TaskList } from '@/components/task/TaskList'
import { getAvatarColor } from '@/lib/avatar-colors'

const C = {
  bg:       '#181920',
  sidebar:  '#111116',
  surface:  '#21212D',
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text:     '#EEEEF2',
  text2:    '#B4B4CC',
  text3:    '#8484A0',
  accent:   '#7C5CFC',
  accentBg: 'rgba(124,92,252,0.08)',
  success:  '#4CAF7D',
  warning:  '#F0A500',
  danger:   '#E05555',
}

type PostProdProject = ProjectWithPipeline & { task_count: number; done_count: number }

const TASK_LINK_FIELDS: Record<string, { key: string; label: string }[]> = {
  'Logging': [
    { key: 'filemail_link', label: 'Link til logget prosjekt (Filemail)' },
  ],
  'Grovklipp': [
    { key: 'timeline_link', label: 'Link til timeline' },
  ],
  'Klipp': [
    { key: 'timeline_link', label: 'Link til timeline' },
    { key: 'effects_link', label: 'Link til effekter' },
  ],
  'Farger': [
    { key: 'timeline_link', label: 'Link til timeline' },
  ],
  'Lyd': [
    { key: 'timeline_link', label: 'Link til timeline' },
    { key: 'sounds_link', label: 'Link til lyder' },
  ],
}

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  video: { label: 'Video', color: '#7C5CFC' },
  photo: { label: 'Foto',  color: '#4A9AC4' },
  mixed: { label: 'Begge', color: '#4CAF7D' },
}

function SidebarProject({ project, isActive }: { project: PostProdProject; isActive: boolean }) {
  const pct = project.task_count > 0 ? Math.round((project.done_count / project.task_count) * 100) : 0
  const isComplete = pct === 100 && project.task_count > 0

  return (
    <Link href={`/admin/postprod/${project.id}`} style={{ textDecoration: 'none', display: 'block' }}>
      <div
        style={{
          padding: '10px 14px',
          borderLeft: `2px solid ${isActive ? C.accent : 'transparent'}`,
          background: isActive ? C.accentBg : 'transparent',
          cursor: 'pointer',
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.02)' }}
        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
      >
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: isActive ? 600 : 400, color: isActive ? C.text : C.text2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
          {project.title}
        </p>
        {project.customer && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 5 }}>
            {project.customer.name}
          </p>
        )}
        {project.task_count > 0 && (
          <div>
            <div style={{ height: 2, background: C.border, borderRadius: 1, overflow: 'hidden', marginBottom: 3 }}>
              <div style={{ height: '100%', width: `${pct}%`, background: isComplete ? C.success : C.accent, transition: 'width 0.3s' }} />
            </div>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: isComplete ? C.success : C.text3 }}>
              {project.done_count}/{project.task_count}
            </p>
          </div>
        )}
      </div>
    </Link>
  )
}

function StepItem({
  task, index, isSelected, isActive, onClick,
}: {
  task: Task; index: number; isSelected: boolean; isActive: boolean; onClick: () => void
}) {
  const isDone = task.status === 'done'
  const isLocked = !isDone && !isActive

  let circleBg = 'transparent'
  let circleBorder = isSelected ? C.accent : C.border
  let circleContent: React.ReactNode = (
    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600, color: isActive ? '#fff' : C.text3 }}>
      {index + 1}
    </span>
  )

  if (isDone) {
    circleBg = C.success
    circleBorder = C.success
    circleContent = (
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
        <path d="M2 5.5L4.5 8L9 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  } else if (isActive) {
    circleBg = C.accent
    circleBorder = C.accent
  }

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '10px 6px', opacity: isLocked ? 0.45 : 1, transition: 'opacity 0.15s',
        minWidth: 0,
      }}
    >
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        border: `2px solid ${circleBorder}`,
        background: circleBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, transition: 'all 0.15s',
        boxShadow: isSelected && !isDone ? `0 0 0 3px ${C.accentBg}` : 'none',
      }}>
        {circleContent}
      </div>
      <span style={{
        fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem',
        fontWeight: isSelected ? 600 : 400,
        color: isSelected ? (isDone ? C.success : isActive ? C.accent : C.text2) : (isDone ? C.success : C.text3),
        whiteSpace: 'nowrap', maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center',
      }}>
        {task.title}
      </span>
    </button>
  )
}

// Delt av toppnivå-renderingen og av alle handlere som må regne ut en fersk
// displayTasks-liste rett etter en mutasjon (før React-state faktisk har oppdatert seg).
// Video-leveranse-faner er nøstet under video/foto-fanen: de vises kun når prosjektet har
// 2+ video-leveranser OG (prosjektet ikke er mixed ELLER video-fanen er aktiv). Se
// docs/superpowers/specs/2026-07-27-signed-deliverables-postprod-design.md §7.2.
function computeDisplayTasks(
  taskList: Task[],
  isMixedProject: boolean,
  tab: 'video' | 'photo',
  deliverableId: string | null,
  videoDeliverableCount: number
): Task[] {
  const subTypeFiltered = isMixedProject ? taskList.filter(t => t.sub_type === tab) : taskList
  const useVideoTabs = videoDeliverableCount >= 2 && (!isMixedProject || tab === 'video')
  return useVideoTabs
    ? subTypeFiltered.filter(t => t.deliverable_id === null || t.deliverable_id === deliverableId)
    : subTypeFiltered
}

export default function PostProdDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const deepLinkTaskId = searchParams?.get('task') ?? null
  const forceOpenChat = searchParams?.get('chat') === '1'
  const projectId = params.id as string

  const [projects, setProjects] = useState<PostProdProject[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [taskData, setTaskData] = useState<Record<string, Record<string, string>>>({})
  const [taskDataSaving, setTaskDataSaving] = useState(false)
  const [taskDataSaved, setTaskDataSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [reseeding, setReseeding] = useState(false)
  const [openingDeliveryReview, setOpeningDeliveryReview] = useState(false)
  const [seedError, setSeedError] = useState<string | null>(null)
  // Generisk feilmelding for optimistiske oppdateringer som feiler på serveren
  // (statusendring m.m.) — se handleAdvance. Vises som en dismissbar boks nederst,
  // samme mønster som saveError i BoardCanvas.
  const [actionError, setActionError] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string | null; email: string } | null>(null)
  const [showRejectionForm, setShowRejectionForm] = useState(false)
  const [rejectionNote, setRejectionNote] = useState('')
  const [rejectionNoteError, setRejectionNoteError] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  const [profiles, setProfiles] = useState<{ id: string; name: string | null; email: string; color: string | null }[]>([])
  const [messageCounts, setMessageCounts] = useState<Record<string, number>>({})
  const [assigneeDropdownOpen, setAssigneeDropdownOpen] = useState(false)
  const [selectionImages, setSelectionImages] = useState<SelectedImageForEditor[]>([])
  const [selectionLightbox, setSelectionLightbox] = useState<number | null>(null)
  const [gallerySummary, setGallerySummary] = useState<{ id: string; status: 'open' | 'submitted' | 'purged' } | null>(null)

  const [activeTab, setActiveTab] = useState<'video' | 'photo'>('video')
  const [activeVideoDeliverableId, setActiveVideoDeliverableId] = useState<string | null>(null)

  const [dueDates, setDueDates] = useState<Record<string, string>>({})

  const [projectLead, setProjectLead_] = useState<{ id: string; name: string | null; email: string; color: string | null } | null>(null)
  const [leadDropdownOpen, setLeadDropdownOpen] = useState(false)
  const leadDropdownRef = useRef<HTMLDivElement>(null)

  // Leveringsinfo
  const [showDeliveryModal, setShowDeliveryModal] = useState(false)
  const [editingDeliverables, setEditingDeliverables] = useState(false)
  const [draftDeliverables, setDraftDeliverables] = useState<DeliverableItem[]>([])
  const [savingDeliverables, setSavingDeliverables] = useState(false)

  type DeliverableItem = {
    id?: string
    title?: string
    description?: string
    quantity?: number | string
    format?: string
  }

  const [deliverableItems, setDeliverableItems] = useState<DeliverableItem[]>([])

  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const taskDataTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingTaskDataRef = useRef<Record<string, Record<string, string>>>({})
  const assigneeDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!assigneeDropdownOpen) return
    function handleClick(e: MouseEvent) {
      if (assigneeDropdownRef.current && !assigneeDropdownRef.current.contains(e.target as Node)) {
        setAssigneeDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [assigneeDropdownOpen])

  useEffect(() => {
    if (!leadDropdownOpen) return
    function handleClick(e: MouseEvent) {
      if (leadDropdownRef.current && !leadDropdownRef.current.contains(e.target as Node)) {
        setLeadDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [leadDropdownOpen])

  async function handleSetLead(profileId: string | null) {
    const prev = projectLead
    const profile = profileId ? profiles.find(p => p.id === profileId) ?? null : null
    setProjectLead_(profile)
    const result = await setProjectLead(projectId, profileId)
    if (!result.ok) setProjectLead_(prev)
  }

  const VENTER_TITLE = 'Venter på tilbakemelding'
  const SELEKSJON_TITLE = 'Selektering'

  // Egendefinerte oppgaver holdes helt utenfor den låste stepperen
  const stepperTasks = tasks.filter(t => !t.is_custom)
  const customTasks = tasks.filter(t => t.is_custom)

  // For mixed-prosjekter: vis kun tasks for aktiv tab
  const isMixed = projects.find(p => p.id === projectId)?.project_type === 'mixed'
  const videoDeliverables = ((projects.find(p => p.id === projectId)?.deliverables ?? []) as SignedDeliverableItem[])
    .filter(d => d.type === 'video')
  const hasVideoTabs = videoDeliverables.length >= 2 && (!isMixed || activeTab === 'video')
  const displayTasks = computeDisplayTasks(stepperTasks, isMixed, activeTab, activeVideoDeliverableId, videoDeliverables.length)

  const activeIdx = displayTasks.findIndex(t => t.status !== 'done')
  const allDone = displayTasks.length > 0 && activeIdx === -1
  const selectedTask = displayTasks[selectedIdx] ?? null

  async function handleDeleteSelectionComment(imageId: string, commentId: string) {
    await deleteImageComment(commentId)
    setSelectionImages(prev => prev.map(img =>
      img.id === imageId ? { ...img, comments: img.comments.filter(c => c.id !== commentId) } : img
    ))
  }

  async function fetchAll() {
    setLoading(true)
    setSeedError(null)

    const [allProjects, projectTasks, userProfile, allProfiles, delivSection, selImgs, gallerySumm] = await Promise.all([
      getPostProdProjects(),
      getTasksForProject(projectId, 'post_prod'),
      getCurrentUserProfile(),
      getAllProfiles(),
      getProjectDeliverablesSection(projectId),
      getSelectedImagesForProject(projectId),
      getGalleryIdForProject(projectId),
    ])
    setSelectionImages(selImgs)
    setGallerySummary(gallerySumm)
    setDeliverableItems(delivSection?.items ?? [])
    setProfiles(allProfiles)

    const allProj = allProjects as PostProdProject[]
    const currentProj = allProj.find(p => p.id === projectId)
    setCurrentUser(userProfile)

    if (projectTasks.length === 0 && currentProj?.project_type) {
      const result = await reseedPostProdTasks(projectId)
      if (result.error) {
        setSeedError(result.error)
        setProjects(allProj)
        setTasks([])
        setLoading(false)
        return
      }
      const seeded = await getTasksForProject(projectId, 'post_prod')
      setProjects(allProj)
      setTasks(seeded)
      initNotes(seeded)
      initTaskData(seeded)
      const seededVideoCount = ((currentProj?.deliverables ?? []) as SignedDeliverableItem[]).filter(d => d.type === 'video').length
      setSelectedIdx(resolveDeepLinkIdx(seeded, currentProj?.project_type === 'mixed', seededVideoCount))
      setLoading(false)
      return
    }

    setProjects(allProj)
    setTasks(projectTasks)
    initNotes(projectTasks)
    initTaskData(projectTasks)
    const projectVideoCount = ((currentProj?.deliverables ?? []) as SignedDeliverableItem[]).filter(d => d.type === 'video').length
    setSelectedIdx(resolveDeepLinkIdx(projectTasks, currentProj?.project_type === 'mixed', projectVideoCount))
    const customTaskIds = projectTasks.filter(t => t.is_custom).map(t => t.id)
    if (customTaskIds.length > 0) getTaskMessageCounts(customTaskIds).then(setMessageCounts)
    if (currentProj) {
      setProjectLead_(currentProj.project_lead
        ? { ...currentProj.project_lead, color: allProfiles.find(p => p.id === currentProj.project_lead!.id)?.color ?? null }
        : null)
    }
    setLoading(false)
  }

  function initNotes(taskList: Task[]) {
    const map: Record<string, string> = {}
    for (const t of taskList) map[t.id] = t.notes ?? ''
    setNotes(map)
    const dd: Record<string, string> = {}
    for (const t of taskList) dd[t.id] = t.due_date ?? ''
    setDueDates(dd)
  }

  async function handleDueDateChange(taskId: string, value: string) {
    setDueDates(prev => ({ ...prev, [taskId]: value }))
    await updateTaskDueDate(taskId, value || null)
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, due_date: value || null } : t))
  }

  function initTaskData(taskList: Task[]) {
    const map: Record<string, Record<string, string>> = {}
    for (const t of taskList) map[t.id] = (t.task_data as Record<string, string>) ?? {}
    setTaskData(map)
    pendingTaskDataRef.current = { ...map }
  }

  function getInitialIdx(taskList: Task[], preferredTaskId?: string | null): number {
    if (preferredTaskId) {
      const preferredIdx = taskList.findIndex(t => t.id === preferredTaskId)
      if (preferredIdx !== -1) return preferredIdx
    }
    const idx = taskList.findIndex(t => t.status !== 'done')
    return idx === -1 ? 0 : idx
  }

  // Løser deep-link-index mot listen slik den faktisk vil se ut i displayTasks.
  // For mixed-prosjekter må vi bytte aktiv tab til den deep-linkede oppgavens
  // sub_type FØR vi filtrerer, ellers matcher ikke indeksen displayTasks.
  function resolveDeepLinkIdx(list: Task[], isMixedProject: boolean, videoDeliverableCount: number): number {
    const deepTask = deepLinkTaskId ? list.find(t => t.id === deepLinkTaskId) : null
    if (deepTask?.deliverable_id) setActiveVideoDeliverableId(deepTask.deliverable_id)
    const resolvedDeliverableId = deepTask?.deliverable_id ?? activeVideoDeliverableId
    if (isMixedProject && deepTask?.sub_type) {
      setActiveTab(deepTask.sub_type)
      return getInitialIdx(computeDisplayTasks(list, true, deepTask.sub_type, resolvedDeliverableId, videoDeliverableCount), deepLinkTaskId)
    }
    const filtered = computeDisplayTasks(list, isMixedProject, activeTab, resolvedDeliverableId, videoDeliverableCount)
    return getInitialIdx(filtered, deepLinkTaskId)
  }

  useEffect(() => { fetchAll() }, [projectId])

  useEffect(() => {
    if (!selectedTask) return
    if (notes[selectedTask.id] === undefined) {
      setNotes(prev => ({ ...prev, [selectedTask.id]: selectedTask.notes ?? '' }))
    }
    if (taskData[selectedTask.id] === undefined) {
      const td = (selectedTask.task_data as Record<string, string>) ?? {}
      setTaskData(prev => ({ ...prev, [selectedTask.id]: td }))
      pendingTaskDataRef.current[selectedTask.id] = td
    }
  }, [selectedTask?.id])

  function handleSelectTask(idx: number) {
    if (selectedTask && notesTimerRef.current) {
      clearTimeout(notesTimerRef.current)
      notesTimerRef.current = null
      updateTaskNotes(selectedTask.id, notes[selectedTask.id] ?? '')
    }
    if (selectedTask && taskDataTimerRef.current) {
      clearTimeout(taskDataTimerRef.current)
      taskDataTimerRef.current = null
      updateTaskData(selectedTask.id, pendingTaskDataRef.current[selectedTask.id] ?? {})
    }
    setSelectedIdx(idx)
  }

  function handleLinkChange(taskId: string, key: string, value: string) {
    const newData = { ...(pendingTaskDataRef.current[taskId] ?? {}), [key]: value }
    pendingTaskDataRef.current[taskId] = newData
    setTaskData(prev => ({ ...prev, [taskId]: newData }))
    setTaskDataSaving(true)
    setTaskDataSaved(false)
    if (taskDataTimerRef.current) clearTimeout(taskDataTimerRef.current)
    taskDataTimerRef.current = setTimeout(async () => {
      await updateTaskData(taskId, pendingTaskDataRef.current[taskId] ?? {})
      setTaskDataSaving(false)
      setTaskDataSaved(true)
      setTimeout(() => setTaskDataSaved(false), 2000)
    }, 800)
  }

  function handleNotesChange(taskId: string, value: string) {
    setNotes(prev => ({ ...prev, [taskId]: value }))
    setNotesSaving(true)
    setNotesSaved(false)
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    notesTimerRef.current = setTimeout(async () => {
      await updateTaskNotes(taskId, value)
      setNotesSaving(false)
      setNotesSaved(true)
      setTimeout(() => setNotesSaved(false), 2000)
    }, 800)
  }

  async function handleAdvance(taskId: string, to: 'in_progress' | 'done') {
    setTogglingId(taskId)
    setActionError(null)
    const prevTask = tasks.find(t => t.id === taskId)
    const prevSelectedIdx = selectedIdx
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: to } : t))

    if (to === 'done') {
      const doneTaskIdx = displayTasks.findIndex(t => t.id === taskId)
      const nextIdx = doneTaskIdx + 1
      if (nextIdx < displayTasks.length) {
        setSelectedIdx(nextIdx)
        setNotes(prev => ({
          ...prev,
          [displayTasks[nextIdx].id]: prev[displayTasks[nextIdx].id] ?? displayTasks[nextIdx].notes ?? '',
        }))
      }
      setProjects(prev =>
        prev.map(p => p.id !== projectId ? p : { ...p, done_count: Math.min(p.done_count + 1, p.task_count) })
      )
    }

    const result = await updateTaskStatus(taskId, to)
    if (!result.ok) {
      // Rull tilbake den optimistiske endringen — uten dette tror brukeren steget
      // ble lagret som fullført mens det i realiteten aldri nådde databasen.
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: prevTask?.status ?? t.status } : t))
      if (to === 'done') {
        setSelectedIdx(prevSelectedIdx)
        setProjects(prev =>
          prev.map(p => p.id !== projectId ? p : { ...p, done_count: Math.max(0, p.done_count - 1) })
        )
      }
      setActionError('Kunne ikke lagre statusendringen — sjekk nettverket og prøv igjen.')
    }
    setTogglingId(null)
  }

  async function handleReject() {
    if (!rejectionNote.trim()) {
      setRejectionNoteError(true)
      return
    }
    if (!selectedTask) return
    setRejecting(true)
    setActionError(null)
    const result = await rejectFeedbackAndReset(projectId, selectedTask.id, rejectionNote.trim())
    if (!result.ok) {
      setActionError(result.error ?? 'Kunne ikke sende tilbake — sjekk nettverket og prøv igjen.')
      setRejecting(false)
      return
    }
    const rejectedDeliverableId = selectedTask?.deliverable_id ?? null
    const [newProjects, newTasks] = await Promise.all([
      getPostProdProjects(),
      getTasksForProject(projectId, 'post_prod'),
    ])
    setProjects(newProjects as PostProdProject[])
    setTasks(newTasks)
    initNotes(newTasks)
    initTaskData(newTasks)
    // Naviger til klipping-steget (sort_order 2 = index 1) — innenfor samme leveranse som
    // den avviste oppgaven tilhørte, slik at man ikke hopper til en annen video-fane.
    const klippingIdx = newTasks.findIndex(t => t.sort_order === 2 && t.deliverable_id === rejectedDeliverableId)
    const gotoIdx = klippingIdx >= 0 ? klippingIdx : 0
    setSelectedIdx(gotoIdx)
    setShowRejectionForm(false)
    setRejectionNote('')
    setRejecting(false)
  }

  async function handleGoBack(taskId: string) {
    if (!selectedTask) return
    setTogglingId(taskId)
    setActionError(null)
    const taskToReset = tasks.find(t => t.id === taskId)
    const subType = taskToReset?.sub_type ?? null
    const sortOrder = taskToReset?.sort_order ?? 0
    const deliverableId = taskToReset?.deliverable_id ?? null
    const prevStatuses = new Map(tasks.map(t => [t.id, t.status]))
    // Optimistisk: nullstill denne og alle etter den med samme sub_type OG samme leveranse
    // (eller delte steg som Ferdig) lokalt — speiler resetTaskAndSubsequent (lib/actions/pipeline.ts).
    const matchesDeliverable = (t: Task) =>
      deliverableId === null || t.deliverable_id === deliverableId || t.deliverable_id === null
    setTasks(prev => prev.map(t => {
      if (t.sub_type !== subType) return t
      if (!matchesDeliverable(t)) return t
      if (t.sort_order < sortOrder) return t
      return { ...t, status: 'todo' }
    }))
    const resetCount = stepperTasks.filter(t => t.sub_type === subType && matchesDeliverable(t) && t.sort_order >= sortOrder && t.status === 'done').length
    setProjects(prev =>
      prev.map(p => p.id !== projectId ? p : { ...p, done_count: Math.max(0, p.done_count - resetCount) })
    )
    const result = await resetTaskAndSubsequent(projectId, taskId)
    if (!result.ok) {
      setTasks(prev => prev.map(t => prevStatuses.has(t.id) ? { ...t, status: prevStatuses.get(t.id)! } : t))
      setProjects(prev =>
        prev.map(p => p.id !== projectId ? p : { ...p, done_count: Math.min(p.done_count + resetCount, p.task_count) })
      )
      setActionError(result.error ?? 'Kunne ikke gå tilbake til dette steget — sjekk nettverket og prøv igjen.')
    }
    setTogglingId(null)
  }

  async function handleToggleAssignee(taskId: string, profileId: string) {
    const profile = profiles.find(p => p.id === profileId)
    if (!profile) return
    const task = tasks.find(t => t.id === taskId)
    if (!task) return
    const isAssigned = task.assignees.some(a => a.id === profileId)
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t
      const newAssignees = isAssigned
        ? t.assignees.filter(a => a.id !== profileId)
        : [...t.assignees, { id: profile.id, name: profile.name, email: profile.email }]
      return { ...t, assignees: newAssignees }
    }))
    await toggleTaskAssignee(taskId, profileId)
  }

  function handleCustomTaskStatusChange(taskId: string, status: Task['status']) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status } : t))
    updatePreprodTaskStatus(taskId, status)
  }

  function handleCustomTaskCreated(task: Task) {
    setTasks(prev => [...prev, task])
  }

  function handleCustomTaskDeleted(taskId: string) {
    setTasks(prev => prev.filter(t => t.id !== taskId))
  }

  async function handleDeleteStepperTask(taskId: string) {
    const result = await deleteTask(taskId)
    if (!result.ok) return
    const newTasks = tasks.filter(t => t.id !== taskId)
    setTasks(newTasks)
    const isMixedProject = projects.find(p => p.id === projectId)?.project_type === 'mixed'
    const newStepperTasks = newTasks.filter(t => !t.is_custom)
    const newDisplayTasks = computeDisplayTasks(newStepperTasks, isMixedProject, activeTab, activeVideoDeliverableId, videoDeliverables.length)
    setSelectedIdx(getInitialIdx(newDisplayTasks))
  }

  function handleSwitchTab(tab: 'video' | 'photo') {
    if (selectedTask && notesTimerRef.current) {
      clearTimeout(notesTimerRef.current)
      notesTimerRef.current = null
      updateTaskNotes(selectedTask.id, notes[selectedTask.id] ?? '')
    }
    if (selectedTask && taskDataTimerRef.current) {
      clearTimeout(taskDataTimerRef.current)
      taskDataTimerRef.current = null
      updateTaskData(selectedTask.id, pendingTaskDataRef.current[selectedTask.id] ?? {})
    }
    setActiveTab(tab)
    const nextDeliverableId = tab === 'video' && videoDeliverables.length >= 2
      ? (videoDeliverables.some(d => d.id === activeVideoDeliverableId) ? activeVideoDeliverableId : videoDeliverables[0].id)
      : null
    setActiveVideoDeliverableId(nextDeliverableId)
    const tabTasks = computeDisplayTasks(stepperTasks, isMixed, tab, nextDeliverableId, videoDeliverables.length)
    const initIdx = getInitialIdx(tabTasks)
    setSelectedIdx(initIdx)
    setShowRejectionForm(false)
    setRejectionNote('')
  }

  function handleSwitchVideoTab(deliverableId: string) {
    if (selectedTask && notesTimerRef.current) {
      clearTimeout(notesTimerRef.current)
      notesTimerRef.current = null
      updateTaskNotes(selectedTask.id, notes[selectedTask.id] ?? '')
    }
    if (selectedTask && taskDataTimerRef.current) {
      clearTimeout(taskDataTimerRef.current)
      taskDataTimerRef.current = null
      updateTaskData(selectedTask.id, pendingTaskDataRef.current[selectedTask.id] ?? {})
    }
    setActiveVideoDeliverableId(deliverableId)
    const tabTasks = computeDisplayTasks(stepperTasks, isMixed, activeTab, deliverableId, videoDeliverables.length)
    const initIdx = getInitialIdx(tabTasks)
    setSelectedIdx(initIdx)
    setShowRejectionForm(false)
    setRejectionNote('')
  }

  async function handleSelectType(type: ProjectType) {
    setReseeding(true)
    setSeedError(null)
    await setProjectType(projectId, type)
    const result = await reseedPostProdTasks(projectId)
    if (result.error) {
      setSeedError(result.error)
      setReseeding(false)
      return
    }
    const [allProjects, newTasks] = await Promise.all([
      getPostProdProjects(),
      getTasksForProject(projectId, 'post_prod'),
    ])
    setProjects(allProjects as PostProdProject[])
    setTasks(newTasks)
    initNotes(newTasks)
    initTaskData(newTasks)
    setSelectedIdx(getInitialIdx(newTasks))
    setReseeding(false)
  }

  async function handleOpenDeliveryReview() {
    setOpeningDeliveryReview(true)
    const { galleryId } = await getOrCreateDeliveryGallery(projectId)
    router.push(`/admin/selections/${galleryId}`)
  }

  async function handleReseed() {
    if (!confirm('Nullstill alle oppgaver og generer på nytt? Fremdrift, notater og chat-meldinger går tapt.')) return
    setReseeding(true)
    setSeedError(null)
    const result = await reseedPostProdTasks(projectId)
    if (result.error) {
      setSeedError(result.error)
      setReseeding(false)
      return
    }
    const [allProjects, newTasks] = await Promise.all([
      getPostProdProjects(),
      getTasksForProject(projectId, 'post_prod'),
    ])
    setProjects(allProjects as PostProdProject[])
    setTasks(newTasks)
    initNotes(newTasks)
    initTaskData(newTasks)
    setSelectedIdx(getInitialIdx(newTasks))
    setReseeding(false)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>Laster...</p>
      </div>
    )
  }

  const currentProject = projects.find(p => p.id === projectId)
  if (!currentProject) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, marginBottom: 16 }}>
            Prosjektet er ikke lenger i post-produksjon
          </p>
          <button onClick={() => router.push('/admin/postprod')} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', background: C.surface2, color: C.text2, border: `1px solid ${C.border}` }}>
            ← Tilbake
          </button>
        </div>
      </div>
    )
  }

  const typeConf = currentProject.project_type ? TYPE_CONFIG[currentProject.project_type] : null
  // Progress viser alltid total (begge flyter) i progress-bar i headeren
  const doneTasks = stepperTasks.filter(t => t.status === 'done').length
  const totalTasks = stepperTasks.length
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
  // allDone i headeren sjekker begge flyter
  const allTasksDone = totalTasks > 0 && doneTasks === totalTasks

  // Determine selected task state
  const isSelectedActive = selectedIdx === (activeIdx === -1 ? -1 : activeIdx)
  const isSelectedDone = selectedTask?.status === 'done'
  const isSelectedLocked = selectedTask && !isSelectedDone && !isSelectedActive

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 48px)', overflow: 'hidden', background: C.bg }}>

      {/* Sidebar — kun prosjekt-bytter; "Alle →"-lenken gir samme lav-risiko tilgang på mobil */}
      <aside className="hidden md:flex" style={{ width: 220, flexShrink: 0, borderRight: `1px solid ${C.border}`, background: C.sidebar, flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ padding: '12px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Post-prod
          </span>
          <Link href="/admin/postprod" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, textDecoration: 'none' }}>
            Alle →
          </Link>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {projects.map(p => (
            <SidebarProject key={p.id} project={p} isActive={p.id === projectId} />
          ))}
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Header */}
        <div style={{ flexShrink: 0, borderBottom: `1px solid ${C.border}`, background: 'rgba(24,25,32,0.97)', backdropFilter: 'blur(8px)' }}>
          <div style={{ padding: '14px 24px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Link href="/admin/postprod" style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, textDecoration: 'none' }}>Post-produksjon</Link>
              <span style={{ color: C.text3 }}>›</span>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text2 }}>{currentProject.title}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
                  <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.1rem', fontWeight: 600, color: C.text, lineHeight: 1.2 }}>
                    {currentProject.title}
                  </h1>
                  {typeConf && (
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: typeConf.color, background: `${typeConf.color}18`, border: `1px solid ${typeConf.color}30`, padding: '2px 7px', borderRadius: 4, flexShrink: 0 }}>
                      {typeConf.label}
                    </span>
                  )}
                </div>
                {currentProject.customer && (
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
                    {currentProject.customer.name}{currentProject.customer.company ? ` — ${currentProject.customer.company}` : ''}
                  </p>
                )}
                {/* Prosjektleder */}
                <div style={{ position: 'relative', marginTop: 6 }} ref={leadDropdownRef}>
                  <button
                    onClick={() => setLeadDropdownOpen(v => !v)}
                    style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 500,
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
                      background: 'none', border: `1px solid ${C.border}`,
                      color: projectLead ? C.text2 : C.text3,
                    }}
                  >
                    {projectLead ? (
                      <>
                        <span style={{
                          width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                          background: getAvatarColor(projectLead), color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.58rem', fontWeight: 700,
                        }}>
                          {(projectLead.name ?? projectLead.email)[0].toUpperCase()}
                        </span>
                        {projectLead.name ?? projectLead.email}
                      </>
                    ) : (
                      '+ Prosjektleder'
                    )}
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                      <path d="M2 4L6 8L10 4" stroke={C.text3} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {leadDropdownOpen && (
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 5px)', left: 0, zIndex: 150,
                      background: C.surface2, border: `1px solid ${C.border}`,
                      borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                      minWidth: 200, maxHeight: 260, overflowY: 'auto', padding: '4px 0',
                    }}>
                      {projectLead && (
                        <button
                          onClick={() => { handleSetLead(null); setLeadDropdownOpen(false) }}
                          style={{
                            width: '100%', textAlign: 'left',
                            fontFamily: 'var(--font-dm-sans)', fontSize: '0.73rem',
                            color: C.danger, background: 'none', border: 'none',
                            borderBottom: `1px solid ${C.border}`,
                            padding: '7px 14px', cursor: 'pointer',
                          }}
                        >
                          Fjern leder
                        </button>
                      )}
                      {profiles.map(p => (
                        <button
                          key={p.id}
                          onClick={() => { handleSetLead(p.id); setLeadDropdownOpen(false) }}
                          style={{
                            width: '100%', textAlign: 'left',
                            fontFamily: 'var(--font-dm-sans)', fontSize: '0.73rem',
                            color: p.id === projectLead?.id ? C.accent : C.text,
                            background: 'none', border: 'none',
                            padding: '7px 14px', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 8,
                          }}
                          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = C.bg}
                          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}
                        >
                          <span style={{
                            width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                            background: getAvatarColor(p), color: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.65rem', fontWeight: 700,
                          }}>
                            {(p.name ?? p.email)[0].toUpperCase()}
                          </span>
                          {p.name ?? p.email}
                          {p.id === projectLead?.id && (
                            <span style={{ marginLeft: 'auto', color: C.accent, fontSize: '0.65rem' }}>✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Lever-knapper */}
                {currentProject.project_type === 'video' && (
                  <button
                    onClick={() => router.push(`/admin/transfers/new?projectId=${projectId}&type=video`)}
                    style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', background: C.success, color: '#fff', border: 'none' }}
                  >
                    ↑ Lever film
                  </button>
                )}
                {currentProject.project_type === 'photo' && (
                  <>
                    <button
                      onClick={handleOpenDeliveryReview}
                      disabled={openingDeliveryReview}
                      title="Last opp ferdigredigerte bilder og send til en kollega for godkjenning før levering"
                      style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600, padding: '5px 12px', borderRadius: 6, cursor: openingDeliveryReview ? 'default' : 'pointer', background: 'transparent', color: C.text2, border: `1px solid ${C.border}`, opacity: openingDeliveryReview ? 0.5 : 1 }}
                    >
                      Send til kollega for godkjenning
                    </button>
                    <button
                      onClick={() => router.push(`/admin/transfers/new?projectId=${projectId}&type=photo`)}
                      style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', background: '#4A9AC4', color: '#fff', border: 'none' }}
                    >
                      ↑ Lever bilder
                    </button>
                  </>
                )}
                {currentProject.project_type === 'mixed' && (
                  <>
                    <button
                      onClick={() => router.push(`/admin/transfers/new?projectId=${projectId}&type=video`)}
                      style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', background: C.success, color: '#fff', border: 'none' }}
                    >
                      ↑ Lever film
                    </button>
                    <button
                      onClick={handleOpenDeliveryReview}
                      disabled={openingDeliveryReview}
                      title="Last opp ferdigredigerte bilder og send til en kollega for godkjenning før levering"
                      style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600, padding: '5px 12px', borderRadius: 6, cursor: openingDeliveryReview ? 'default' : 'pointer', background: 'transparent', color: C.text2, border: `1px solid ${C.border}`, opacity: openingDeliveryReview ? 0.5 : 1 }}
                    >
                      Send til kollega for godkjenning
                    </button>
                    <button
                      onClick={() => router.push(`/admin/transfers/new?projectId=${projectId}&type=photo`)}
                      style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 600, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', background: '#4A9AC4', color: '#fff', border: 'none' }}
                    >
                      ↑ Lever bilder
                    </button>
                  </>
                )}
                <button
                  onClick={handleReseed}
                  disabled={reseeding}
                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 500, padding: '5px 11px', borderRadius: 6, cursor: reseeding ? 'default' : 'pointer', background: 'transparent', color: C.text3, border: `1px solid ${C.border}`, opacity: reseeding ? 0.5 : 1 }}
                >
                  {reseeding ? 'Nullstiller...' : '↺ Nullstill'}
                </button>
                <Link href={`/admin/projects/${projectId}`}>
                  <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 500, padding: '5px 11px', borderRadius: 6, cursor: 'pointer', background: C.surface2, color: C.text2, border: `1px solid ${C.border}` }}>
                    Prosjekt →
                  </button>
                </Link>
              </div>
            </div>

            {totalTasks > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                <div style={{ flex: 1, height: 3, background: C.surface2, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: allTasksDone ? C.success : C.accent, borderRadius: 2, transition: 'width 0.35s' }} />
                </div>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: allTasksDone ? C.success : C.text3, flexShrink: 0 }}>
                  {doneTasks}/{totalTasks} ferdig
                </span>
              </div>
            )}

            {/* Info om levering-knapp */}
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
              <button
                onClick={() => setShowDeliveryModal(true)}
                style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: 6,
                  color: deliverableItems.length > 0 ? C.text2 : C.text3,
                  background: 'none', border: `1px solid ${C.border}`, padding: '4px 10px',
                  borderRadius: 6, cursor: 'pointer',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M3.5 4.5h5M3.5 6h5M3.5 7.5h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                </svg>
                Info om levering
                {deliverableItems.length > 0 && (
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: C.accent, display: 'inline-block', marginLeft: 2 }} />
                )}
              </button>
            </div>

            {/* Leveringsmodal */}
            {showDeliveryModal && (
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)' }}
                onClick={e => { if (e.target === e.currentTarget && !editingDeliverables) setShowDeliveryModal(false) }}
              >
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, width: 460, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 700, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      Leveranser
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {!editingDeliverables ? (
                        <button
                          onClick={() => { setDraftDeliverables(deliverableItems.map((it, i) => ({ ...it, id: it.id ?? String(i) }))); setEditingDeliverables(true) }}
                          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 500, color: C.accent, background: 'none', border: `1px solid ${C.accent}`, borderRadius: 5, padding: '3px 10px', cursor: 'pointer' }}
                        >
                          Rediger
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => setEditingDeliverables(false)}
                            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, background: 'none', border: `1px solid ${C.border}`, borderRadius: 5, padding: '3px 10px', cursor: 'pointer' }}
                          >
                            Avbryt
                          </button>
                          <button
                            onClick={async () => {
                              setSavingDeliverables(true)
                              const items = draftDeliverables.map(it => ({
                                id: it.id ?? String(Date.now()),
                                title: it.title,
                                quantity: typeof it.quantity === 'string' ? (parseInt(it.quantity, 10) || undefined) : it.quantity,
                                format: it.format,
                                description: it.description,
                              }))
                              const res = await updateProjectDeliverablesSection(projectId, items)
                              setSavingDeliverables(false)
                              if (!res.error) {
                                setDeliverableItems(draftDeliverables)
                                setEditingDeliverables(false)
                              }
                            }}
                            disabled={savingDeliverables}
                            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 600, color: '#fff', background: C.accent, border: 'none', borderRadius: 5, padding: '3px 10px', cursor: 'pointer', opacity: savingDeliverables ? 0.6 : 1 }}
                          >
                            {savingDeliverables ? 'Lagrer...' : 'Lagre'}
                          </button>
                        </>
                      )}
                      <button onClick={() => { setShowDeliveryModal(false); setEditingDeliverables(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, fontSize: '1.1rem', lineHeight: 1, padding: '2px 6px' }}>×</button>
                    </div>
                  </div>

                  {/* Scrollbar content */}
                  <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                    {editingDeliverables ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {draftDeliverables.map((item, i) => (
                          <div key={item.id ?? i} style={{ background: C.surface2, borderRadius: 8, padding: '12px 14px', position: 'relative' }}>
                            <button
                              onClick={() => setDraftDeliverables(prev => prev.filter((_, idx) => idx !== i))}
                              style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', cursor: 'pointer', color: C.text3, fontSize: '1rem', lineHeight: 1, padding: '2px 5px' }}
                              title="Fjern"
                            >×</button>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 56px 80px', gap: 8, marginBottom: 8 }}>
                              <input
                                value={item.title ?? ''}
                                onChange={e => setDraftDeliverables(prev => prev.map((it, idx) => idx === i ? { ...it, title: e.target.value } : it))}
                                placeholder="Tittel"
                                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '5px 8px', color: C.text, outline: 'none' }}
                              />
                              <input
                                type="number"
                                min={1}
                                value={item.quantity ?? ''}
                                onChange={e => setDraftDeliverables(prev => prev.map((it, idx) => idx === i ? { ...it, quantity: e.target.value } : it))}
                                placeholder="Ant."
                                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '5px 8px', color: C.text, outline: 'none', textAlign: 'center' }}
                              />
                              <input
                                value={item.format ?? ''}
                                onChange={e => setDraftDeliverables(prev => prev.map((it, idx) => idx === i ? { ...it, format: e.target.value } : it))}
                                placeholder="Format"
                                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '5px 8px', color: C.text, outline: 'none' }}
                              />
                            </div>
                            <textarea
                              value={item.description ?? ''}
                              onChange={e => setDraftDeliverables(prev => prev.map((it, idx) => idx === i ? { ...it, description: e.target.value } : it))}
                              placeholder="Beskrivelse (valgfri)"
                              rows={2}
                              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', width: '100%', resize: 'vertical', background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, padding: '5px 8px', color: C.text3, outline: 'none', boxSizing: 'border-box' }}
                            />
                          </div>
                        ))}
                        <button
                          onClick={() => setDraftDeliverables(prev => [...prev, { id: String(Date.now()), title: '', quantity: 1, format: '', description: '' }])}
                          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.accent, background: 'none', border: `1px dashed ${C.accent}`, borderRadius: 6, padding: '8px', cursor: 'pointer', width: '100%', marginTop: 4 }}
                        >
                          + Legg til leveranse
                        </button>
                      </div>
                    ) : deliverableItems.length === 0 ? (
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, fontStyle: 'italic' }}>
                        Ingen leveranser er lagt til ennå. Trykk «Rediger» for å legge til.
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {deliverableItems.map((item, i) => {
                          const qty = typeof item.quantity === 'number'
                            ? item.quantity
                            : (item.quantity != null ? parseInt(item.quantity as string, 10) || null : null)
                          return (
                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 0', borderBottom: i < deliverableItems.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                              {qty != null && (
                                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', fontWeight: 700, color: C.accent, minWidth: 24, textAlign: 'right', flexShrink: 0, paddingTop: 1 }}>
                                  {qty}
                                </span>
                              )}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600, color: C.text, display: 'block', wordBreak: 'break-word' }}>
                                  {item.title || '—'}
                                </span>
                                {item.description && (
                                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, display: 'block', marginTop: 2, lineHeight: 1.45, wordBreak: 'break-word' }}>
                                    {item.description}
                                  </span>
                                )}
                              </div>
                              {item.format && (
                                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, flexShrink: 0, background: C.surface2, padding: '2px 6px', borderRadius: 4, marginTop: 2 }}>
                                  {item.format}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Film/Bilder-faner for mixed-prosjekter */}
          {isMixed && stepperTasks.length > 0 && !reseeding && (
            <div style={{ display: 'flex', alignItems: 'center', borderTop: `1px solid ${C.border}` }}>
              {(['video', 'photo'] as const).map(tab => {
                const tabTasks = stepperTasks.filter(t => t.sub_type === tab)
                const tabDone = tabTasks.filter(t => t.status === 'done').length
                const tabTotal = tabTasks.length
                const tabComplete = tabTotal > 0 && tabDone === tabTotal
                const isActive = activeTab === tab
                return (
                  <button
                    key={tab}
                    onClick={() => handleSwitchTab(tab)}
                    style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: isActive ? 600 : 400,
                      padding: '10px 20px', cursor: 'pointer', background: 'none',
                      borderBottom: `2px solid ${isActive ? C.accent : 'transparent'}`,
                      borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                      color: isActive ? C.text : C.text3,
                      display: 'flex', alignItems: 'center', gap: 8,
                      transition: 'color 0.15s',
                    }}
                  >
                    {tab === 'video' ? 'Film' : 'Bilder'}
                    {tabTotal > 0 && (
                      <span style={{
                        fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', fontWeight: 600,
                        padding: '1px 6px', borderRadius: 10,
                        background: tabComplete ? 'rgba(76,175,125,0.15)' : isActive ? C.accentBg : 'rgba(255,255,255,0.05)',
                        color: tabComplete ? C.success : isActive ? C.accent : C.text3,
                        border: `1px solid ${tabComplete ? 'rgba(76,175,125,0.25)' : isActive ? 'rgba(124,92,252,0.25)' : C.border}`,
                      }}>
                        {tabDone}/{tabTotal}
                      </span>
                    )}
                  </button>
                )
              })}
              <button
                onClick={() => setShowDeliveryModal(true)}
                style={{
                  marginLeft: 'auto', marginRight: 12,
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 500,
                  display: 'flex', alignItems: 'center', gap: 5,
                  color: deliverableItems.length > 0 ? C.text2 : C.text3,
                  background: 'none', border: `1px solid ${C.border}`, padding: '3px 9px',
                  borderRadius: 5, cursor: 'pointer', flexShrink: 0,
                }}
              >
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                  <rect x="1" y="1" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M3.5 4.5h5M3.5 6h5M3.5 7.5h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                </svg>
                Info om levering
              </button>
            </div>
          )}

          {/* Video-leveranse-faner — nøstet under Film/Bilder-fanene for mixed-prosjekter.
              Se docs/superpowers/specs/2026-07-27-signed-deliverables-postprod-design.md §7.2. */}
          {hasVideoTabs && stepperTasks.length > 0 && !reseeding && (
            <div style={{ display: 'flex', alignItems: 'center', borderTop: `1px solid ${C.border}` }}>
              {videoDeliverables.map(d => {
                const tabTasks = (isMixed ? stepperTasks.filter(t => t.sub_type === 'video') : stepperTasks)
                  .filter(t => t.deliverable_id === d.id)
                const tabDone = tabTasks.filter(t => t.status === 'done').length
                const tabTotal = tabTasks.length
                const tabComplete = tabTotal > 0 && tabDone === tabTotal
                const isActive = activeVideoDeliverableId === d.id
                return (
                  <button
                    key={d.id}
                    onClick={() => handleSwitchVideoTab(d.id)}
                    style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: isActive ? 600 : 400,
                      padding: '10px 20px', cursor: 'pointer', background: 'none',
                      borderBottom: `2px solid ${isActive ? C.accent : 'transparent'}`,
                      borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                      color: isActive ? C.text : C.text3,
                      display: 'flex', alignItems: 'center', gap: 8,
                      transition: 'color 0.15s',
                    }}
                  >
                    {d.name}
                    {tabTotal > 0 && (
                      <span style={{
                        fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', fontWeight: 600,
                        padding: '1px 6px', borderRadius: 10,
                        background: tabComplete ? 'rgba(76,175,125,0.15)' : isActive ? C.accentBg : 'rgba(255,255,255,0.05)',
                        color: tabComplete ? C.success : isActive ? C.accent : C.text3,
                        border: `1px solid ${tabComplete ? 'rgba(76,175,125,0.25)' : isActive ? 'rgba(124,92,252,0.25)' : C.border}`,
                      }}>
                        {tabDone}/{tabTotal}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Task stepper */}
          {displayTasks.length > 0 && !reseeding && (
            <div style={{ overflowX: 'auto', display: 'flex', alignItems: 'flex-start', padding: '0 16px', borderTop: `1px solid ${C.border}` }}>
              {displayTasks.map((task, i) => (
                <Fragment key={task.id}>
                  <StepItem
                    task={task}
                    index={i}
                    isSelected={selectedIdx === i}
                    isActive={activeIdx === i}
                    onClick={() => handleSelectTask(i)}
                  />
                  {i < displayTasks.length - 1 && (
                    <div style={{
                      width: 24, height: 2, flexShrink: 0, marginTop: 23,
                      background: task.status === 'done' ? C.success : C.border,
                      transition: 'background 0.2s',
                    }} />
                  )}
                </Fragment>
              ))}
            </div>
          )}

          {/* Egendefinerte oppgaver — utenfor den låste stepperen */}
          {!reseeding && (
            <div style={{ padding: '14px 16px', borderTop: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 700, color: C.text3, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 10 }}>
                Egendefinerte oppgaver
              </span>
              <TaskList
                tasks={customTasks}
                profiles={profiles}
                onStatusChange={handleCustomTaskStatusChange}
                currentUserId={currentUser?.id ?? null}
                messageCounts={messageCounts}
                deepLinkTaskId={deepLinkTaskId}
                projectId={projectId}
                pipelineStage="post_prod"
                onTaskCreated={handleCustomTaskCreated}
                onTaskDeleted={handleCustomTaskDeleted}
                emptyLabel="Ingen egendefinerte oppgaver for dette prosjektet ennå."
              />
            </div>
          )}
        </div>

        {/* Content */}
        {stepperTasks.length === 0 ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {reseeding ? (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text3 }}>Genererer oppgaver...</p>
            ) : seedError ? (
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.danger, marginBottom: 12 }}>{seedError}</p>
                <button onClick={() => { setSeedError(null); fetchAll() }} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, padding: '7px 16px', borderRadius: 6, cursor: 'pointer', background: C.accent, color: '#fff', border: 'none' }}>Prøv igjen</button>
              </div>
            ) : (
              <div style={{ textAlign: 'center', maxWidth: 400 }}>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.9rem', fontWeight: 600, color: C.text, marginBottom: 6 }}>Hva produseres i dette prosjektet?</p>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, marginBottom: 20 }}>Velg innholdstype for å generere oppgaver</p>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                  {([
                    { value: 'video' as ProjectType, label: 'Video', desc: '6 oppgaver' },
                    { value: 'photo' as ProjectType, label: 'Foto',  desc: '5 oppgaver' },
                    { value: 'mixed' as ProjectType, label: 'Begge', desc: '9 oppgaver' },
                  ]).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => handleSelectType(opt.value)}
                      style={{ fontFamily: 'var(--font-dm-sans)', padding: '14px 24px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.surface, cursor: 'pointer', textAlign: 'center' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.accent; (e.currentTarget as HTMLButtonElement).style.background = C.surface2 }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.border; (e.currentTarget as HTMLButtonElement).style.background = C.surface }}
                    >
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.text, marginBottom: 3 }}>{opt.label}</p>
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : allDone && !selectedTask ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: C.success, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <path d="M4 11L9 16L18 6" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', fontWeight: 600, color: C.success }}>Post-produksjon fullført</p>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, marginTop: 4 }}>Prosjektet er klar for levering</p>
            </div>
          </div>
        ) : selectedTask ? (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

            {/* Left: task details + notes + action */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', minWidth: 0, maxWidth: 760, margin: '0 auto', width: '100%' }}>

              {/* Status badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                {isSelectedDone && (
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.success, background: 'rgba(76,175,125,0.1)', border: `1px solid rgba(76,175,125,0.25)`, padding: '2px 8px', borderRadius: 4 }}>
                    Fullført
                  </span>
                )}
                {isSelectedActive && selectedTask.status === 'in_progress' && (
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.warning, background: 'rgba(240,165,0,0.1)', border: `1px solid rgba(240,165,0,0.25)`, padding: '2px 8px', borderRadius: 4 }}>
                    Pågår
                  </span>
                )}
                {isSelectedActive && selectedTask.status === 'todo' && (
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.accent, background: C.accentBg, border: `1px solid rgba(124,92,252,0.25)`, padding: '2px 8px', borderRadius: 4 }}>
                    Aktiv
                  </span>
                )}
                {isSelectedLocked && (
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`, padding: '2px 8px', borderRadius: 4 }}>
                    Venter
                  </span>
                )}
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>
                  Steg {selectedIdx + 1} av {displayTasks.length}
                </span>
              </div>

              {/* Task title */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.4rem', fontWeight: 700, color: C.text, lineHeight: 1.2 }}>
                  {selectedTask.title}
                </h2>
                {selectedTask.created_by && (
                  <button
                    onClick={() => handleDeleteStepperTask(selectedTask.id)}
                    title="Fjern dette planlagte steget"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, padding: 4, lineHeight: 0, flexShrink: 0 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M2 2l8 8M10 2L2 10" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Description from template */}
              {selectedTask.description && (
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text2, lineHeight: 1.6, marginBottom: 28 }}>
                  {selectedTask.description}
                </p>
              )}

              {/* Seleksjonsgalleri */}
              {selectedTask.title === SELEKSJON_TITLE && (
                <div style={{ marginBottom: 28 }}>
                  <Link
                    href={`/admin/projects/${projectId}/selection`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '9px 16px', borderRadius: 7, border: `1px solid ${C.border}`,
                      background: C.surface2, color: C.text2,
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem',
                      textDecoration: 'none', cursor: 'pointer',
                    }}
                  >
                    → Administrer galleri
                  </Link>
                </div>
              )}

              {/* Valgte bilder for redigering — kun relevant for foto-oppgaver, ikke i videoblokka */}
              {selectionImages.length > 0 && (isMixed ? selectedTask.sub_type !== 'video' : currentProject.project_type !== 'video') && (
                <div style={{ marginBottom: 28 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <label style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Kundens bildevalg ({selectionImages.length})
                    </label>
                    <Link
                      href={`/admin/projects/${projectId}/selection`}
                      style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.accent, textDecoration: 'none' }}
                    >
                      Se galleri →
                    </Link>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 4 }}>
                    {selectionImages.map((img, idx) => (
                      <div
                        key={img.id}
                        onClick={() => setSelectionLightbox(idx)}
                        style={{ position: 'relative', aspectRatio: '4/3', borderRadius: 5, overflow: 'hidden', cursor: 'pointer', background: C.surface2 }}
                      >
                        {img.signedUrl
                          ? <img src={img.signedUrl} alt={img.filename} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" />
                          : <div style={{ width: '100%', height: '100%' }} />
                        }
                        {img.comments.length > 0 && (
                          <div style={{ position: 'absolute', bottom: 3, left: 3, width: 7, height: 7, borderRadius: '50%', background: '#C49434' }} />
                        )}
                        {img.albumName && (
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '2px 4px', background: 'rgba(0,0,0,0.55)', fontFamily: 'var(--font-dm-sans)', fontSize: '0.5rem', color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {img.albumName}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Lightbox */}
                  {selectionLightbox !== null && (() => {
                    const img = selectionImages[selectionLightbox]
                    return (
                      <div
                        style={{ position: 'fixed', inset: 0, background: 'rgba(12,11,9,0.97)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
                        onClick={() => setSelectionLightbox(null)}
                      >
                        <div style={{ maxWidth: '90vw', maxHeight: '80vh', position: 'relative' }} onClick={e => e.stopPropagation()}>
                          {img?.signedUrl
                            ? <img src={img.signedUrl} alt={img.filename} style={{ maxWidth: '90vw', maxHeight: '80vh', objectFit: 'contain', borderRadius: 4, display: 'block' }} />
                            : <div style={{ width: 400, height: 300, background: C.surface2 }} />
                          }
                          {img && img.comments.length > 0 && (
                            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {img.comments.map(c => (
                                <div key={c.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, padding: '8px 12px', background: 'rgba(196,148,52,0.1)', border: '1px solid rgba(196,148,52,0.25)', borderRadius: 8 }}>
                                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: '#E8E0D0', lineHeight: 1.5, margin: 0 }}>
                                    {c.text}{c.author_name && <span style={{ color: C.text3 }}> — {c.author_name}</span>}
                                  </p>
                                  <button
                                    onClick={() => handleDeleteSelectionComment(img.id, c.id)}
                                    title="Slett kommentar"
                                    style={{ background: 'none', border: 'none', color: C.text3, cursor: 'pointer', fontSize: '0.8rem', flexShrink: 0, padding: 0 }}
                                  >×</button>
                                </div>
                              ))}
                            </div>
                          )}
                          {img?.albumName && (
                            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginTop: 6, textAlign: 'center' }}>{img.albumName}</p>
                          )}
                        </div>
                        {selectionLightbox > 0 && (
                          <button onClick={e => { e.stopPropagation(); setSelectionLightbox(p => p !== null ? p - 1 : null) }} style={{ position: 'absolute', top: '50%', left: 12, transform: 'translateY(-50%)', width: 44, height: 44, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', color: '#fff', fontSize: '1.4rem', cursor: 'pointer' }}>‹</button>
                        )}
                        {selectionLightbox < selectionImages.length - 1 && (
                          <button onClick={e => { e.stopPropagation(); setSelectionLightbox(p => p !== null ? p + 1 : null) }} style={{ position: 'absolute', top: '50%', right: 12, transform: 'translateY(-50%)', width: 44, height: 44, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', color: '#fff', fontSize: '1.4rem', cursor: 'pointer' }}>›</button>
                        )}
                        <button onClick={() => setSelectionLightbox(null)} style={{ position: 'absolute', top: 12, right: 12, width: 34, height: 34, background: 'rgba(0,0,0,0.5)', border: 'none', borderRadius: '50%', color: '#fff', fontSize: '1rem', cursor: 'pointer' }}>×</button>
                        <div style={{ position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)', fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>
                          {selectionLightbox + 1} / {selectionImages.length}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* Task links */}
              {(() => {
                const linkFields = TASK_LINK_FIELDS[selectedTask.title] ?? []
                // Lenker fra tidligere steg i pipelinen (f.eks. filemail-linken fra
                // Logging) — vises videre gjennom hele flyten som read-only referanser,
                // slik at den som klipper ikke må hoppe tilbake til et tidligere steg.
                const priorLinks = displayTasks.slice(0, selectedIdx).flatMap(t => {
                  const fields = TASK_LINK_FIELDS[t.title] ?? []
                  const data = (t.task_data as Record<string, string> | null) ?? {}
                  return fields
                    .filter(f => data[f.key])
                    .map(f => ({ stageTitle: t.title, label: f.label, value: data[f.key] }))
                })
                if (linkFields.length === 0 && priorLinks.length === 0) return null
                const currentData = taskData[selectedTask.id] ?? {}
                return (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <label style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Links
                      </label>
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: taskDataSaved ? C.success : C.text3, transition: 'color 0.2s' }}>
                        {taskDataSaving ? 'Lagrer...' : taskDataSaved ? 'Lagret ✓' : ''}
                      </span>
                    </div>
                    {priorLinks.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: linkFields.length > 0 ? 14 : 0 }}>
                        {priorLinks.map((pl, i) => (
                          <a
                            key={`${pl.stageTitle}-${i}`}
                            href={pl.value}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={pl.label}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500,
                              color: C.text2, textDecoration: 'none',
                              padding: '6px 10px', borderRadius: 6,
                              background: C.surface, border: `1px solid ${C.border}`,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <span style={{ color: C.text3, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{pl.stageTitle}</span>
                            {pl.label} ↗
                          </a>
                        ))}
                      </div>
                    )}
                    {linkFields.map(field => {
                      const val = currentData[field.key] ?? ''
                      return (
                        <div key={field.key} style={{ marginBottom: 10 }}>
                          <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 500, color: C.text3, marginBottom: 5 }}>
                            {field.label}
                          </label>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <input
                              type="text"
                              value={val}
                              onChange={e => handleLinkChange(selectedTask.id, field.key, e.target.value)}
                              placeholder="https://..."
                              style={{
                                flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem',
                                color: C.text, background: C.surface,
                                border: `1px solid ${C.border}`, borderRadius: 7,
                                padding: '8px 12px', outline: 'none',
                                transition: 'border-color 0.15s',
                              }}
                              onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
                              onBlur={e => { e.currentTarget.style.borderColor = C.border }}
                            />
                            {val && (
                              <a
                                href={val}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500,
                                  color: C.accent, textDecoration: 'none',
                                  padding: '7px 11px', borderRadius: 6, flexShrink: 0,
                                  background: C.accentBg, border: `1px solid rgba(124,92,252,0.25)`,
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                Åpne ↗
                              </a>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              {/* Assignee */}
              <div style={{ marginBottom: 24 }} ref={assigneeDropdownRef}>
                <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Tildelt
                </label>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <button
                    onClick={() => setAssigneeDropdownOpen(v => !v)}
                    style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem',
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 12px', borderRadius: 8, cursor: 'pointer',
                      background: C.surface, border: `1px solid ${assigneeDropdownOpen ? C.accent : C.border}`,
                      color: selectedTask.assignees.length > 0 ? C.text : C.text3,
                      transition: 'border-color 0.15s',
                    }}
                  >
                    {selectedTask.assignees.length > 0 ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          {selectedTask.assignees.slice(0, 3).map((a, i) => (
                            <span key={a.id} style={{
                              width: 22, height: 22, borderRadius: '50%',
                              background: getAvatarColor(a), color: '#fff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '0.65rem', fontWeight: 700, flexShrink: 0,
                              marginLeft: i > 0 ? -6 : 0,
                              border: `2px solid ${C.surface}`,
                              zIndex: 3 - i,
                              position: 'relative',
                            }}>
                              {(a.name ?? a.email)[0].toUpperCase()}
                            </span>
                          ))}
                          {selectedTask.assignees.length > 3 && (
                            <span style={{
                              width: 22, height: 22, borderRadius: '50%',
                              background: C.surface2, color: C.text3,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '0.6rem', fontWeight: 700, flexShrink: 0,
                              marginLeft: -6, border: `2px solid ${C.surface}`,
                            }}>
                              +{selectedTask.assignees.length - 3}
                            </span>
                          )}
                        </div>
                        <span>
                          {selectedTask.assignees.length === 1
                            ? (selectedTask.assignees[0].name ?? selectedTask.assignees[0].email)
                            : `${selectedTask.assignees.length} personer`}
                        </span>
                      </>
                    ) : (
                      <span>Ingen tildelt</span>
                    )}
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ marginLeft: 2, flexShrink: 0 }}>
                      <path d="M2 4L6 8L10 4" stroke={C.text3} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>

                  {assigneeDropdownOpen && (
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 100,
                      background: C.surface2, border: `1px solid ${C.border}`,
                      borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                      minWidth: 240, maxHeight: 280, overflowY: 'auto',
                      padding: '4px 0',
                    }}>
                      {profiles.length === 0 && (
                        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, padding: '10px 14px' }}>
                          Ingen brukere funnet
                        </p>
                      )}
                      {profiles.map(profile => {
                        const isAssigned = selectedTask.assignees.some(a => a.id === profile.id)
                        return (
                          <button
                            key={profile.id}
                            onClick={() => handleToggleAssignee(selectedTask.id, profile.id)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              width: '100%', padding: '8px 14px', background: isAssigned ? C.accentBg : 'none',
                              border: 'none', cursor: 'pointer', textAlign: 'left',
                            }}
                            onMouseEnter={e => { if (!isAssigned) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)' }}
                            onMouseLeave={e => { if (!isAssigned) (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
                          >
                            <span style={{
                              width: 22, height: 22, borderRadius: '50%',
                              background: isAssigned ? getAvatarColor(profile) : C.surface,
                              border: `1px solid ${isAssigned ? getAvatarColor(profile) : C.border}`,
                              color: isAssigned ? '#fff' : C.text2,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '0.65rem', fontWeight: 700, flexShrink: 0,
                            }}>
                              {(profile.name ?? profile.email)[0].toUpperCase()}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: isAssigned ? C.text : C.text, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {profile.name ?? profile.email}
                              </p>
                              {profile.name && (
                                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {profile.email}
                                </p>
                              )}
                            </div>
                            {isAssigned && (
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                                <path d="M2.5 7L5.5 10L11.5 4" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Due date */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Frist
                </label>
                <input
                  type="date"
                  value={dueDates[selectedTask.id] ?? ''}
                  onChange={e => handleDueDateChange(selectedTask.id, e.target.value)}
                  style={{
                    fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem',
                    color: C.text, background: C.surface,
                    border: `1px solid ${C.border}`, borderRadius: 8,
                    padding: '8px 12px', outline: 'none',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
                  onBlur={e => { e.currentTarget.style.borderColor = C.border }}
                />
              </div>

              {/* Notes */}
              <div style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Notater
                  </label>
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: notesSaved ? C.success : C.text3, transition: 'color 0.2s' }}>
                    {notesSaving ? 'Lagrer...' : notesSaved ? 'Lagret ✓' : ''}
                  </span>
                </div>
                <textarea
                  value={notes[selectedTask.id] ?? ''}
                  onChange={e => handleNotesChange(selectedTask.id, e.target.value)}
                  placeholder="Skriv notater for denne oppgaven..."
                  rows={5}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem',
                    color: C.text, background: C.surface,
                    border: `1px solid ${C.border}`, borderRadius: 8,
                    padding: '12px 14px', resize: 'vertical',
                    outline: 'none', lineHeight: 1.6,
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
                  onBlur={e => { e.currentTarget.style.borderColor = C.border }}
                />
              </div>

              {/* Action button */}
              {isSelectedActive && selectedTask.title === VENTER_TITLE ? (
                /* Spesialbehandling: Venter på tilbakemelding */
                <div>
                  {!showRejectionForm ? (
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        onClick={() => handleAdvance(selectedTask.id, 'done')}
                        disabled={togglingId === selectedTask.id}
                        style={{
                          fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600,
                          padding: '10px 22px', borderRadius: 8, cursor: togglingId === selectedTask.id ? 'default' : 'pointer',
                          background: C.success, color: '#fff', border: 'none',
                          opacity: togglingId === selectedTask.id ? 0.6 : 1,
                          transition: 'opacity 0.15s, transform 0.1s',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)' }}
                      >
                        ✓ Godkjent
                      </button>
                      <button
                        onClick={() => { setShowRejectionForm(true); setRejectionNote(''); setRejectionNoteError(false) }}
                        style={{
                          fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600,
                          padding: '10px 22px', borderRadius: 8, cursor: 'pointer',
                          background: 'rgba(224,85,85,0.1)', color: C.danger,
                          border: `1px solid rgba(224,85,85,0.3)`,
                          transition: 'opacity 0.15s',
                        }}
                      >
                        ✗ Ikke godkjent
                      </button>
                    </div>
                  ) : (
                    <div style={{ background: C.surface, border: `1px solid rgba(224,85,85,0.3)`, borderRadius: 10, padding: 20, maxWidth: 480 }}>
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600, color: C.danger, marginBottom: 4 }}>
                        Ikke godkjent — send tilbake til klipping
                      </p>
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, marginBottom: 14, lineHeight: 1.5 }}>
                        Beskriv hva som ikke ble godkjent. Notatet lagres på denne tasken og klipping-steget nullstilles.
                      </p>
                      <textarea
                        autoFocus
                        value={rejectionNote}
                        onChange={e => { setRejectionNote(e.target.value); setRejectionNoteError(false) }}
                        placeholder="Hva var ikke godkjent? Beskriv hva som må rettes..."
                        rows={4}
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem',
                          color: C.text, background: C.surface2,
                          border: `1px solid ${rejectionNoteError ? C.danger : C.border}`,
                          borderRadius: 8, padding: '10px 12px',
                          resize: 'vertical', outline: 'none', lineHeight: 1.6,
                          transition: 'border-color 0.15s',
                          marginBottom: rejectionNoteError ? 6 : 14,
                        }}
                        onFocus={e => { if (!rejectionNoteError) e.currentTarget.style.borderColor = C.accent }}
                        onBlur={e => { if (!rejectionNoteError) e.currentTarget.style.borderColor = C.border }}
                      />
                      {rejectionNoteError && (
                        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.danger, marginBottom: 14 }}>
                          Du må fylle inn en begrunnelse.
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={() => { setShowRejectionForm(false); setRejectionNote(''); setRejectionNoteError(false) }}
                          disabled={rejecting}
                          style={{
                            fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 500,
                            padding: '8px 16px', borderRadius: 7, cursor: 'pointer',
                            background: 'transparent', color: C.text3, border: `1px solid ${C.border}`,
                          }}
                        >
                          Avbryt
                        </button>
                        <button
                          onClick={handleReject}
                          disabled={rejecting}
                          style={{
                            fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600,
                            padding: '8px 18px', borderRadius: 7, cursor: rejecting ? 'default' : 'pointer',
                            background: C.danger, color: '#fff', border: 'none',
                            opacity: rejecting ? 0.6 : 1, transition: 'opacity 0.15s',
                          }}
                        >
                          {rejecting ? 'Sender tilbake...' : 'Send tilbake til klipping'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : isSelectedActive && selectedTask.title === SELEKSJON_TITLE ? (
                /* Spesialbehandling: Selektering fullføres normalt av kundens innsending,
                   ikke av en manuell "ferdig"-knapp (se lib/actions/selections.ts
                   submitGallery / lib/actions/selection-picks.ts submitAlbumPicks) */
                <div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    {selectedTask.status === 'todo' && (
                      <button
                        onClick={() => handleAdvance(selectedTask.id, 'in_progress')}
                        disabled={togglingId === selectedTask.id}
                        style={{
                          fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600,
                          padding: '10px 22px', borderRadius: 8, cursor: togglingId === selectedTask.id ? 'default' : 'pointer',
                          background: C.surface2, color: C.text, border: `1px solid ${C.border}`,
                          opacity: togglingId === selectedTask.id ? 0.6 : 1, transition: 'opacity 0.15s',
                        }}
                      >
                        Sett i gang
                      </button>
                    )}
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text2, fontStyle: 'italic' }}>
                      {gallerySummary?.status === 'open'
                        ? '🕒 Venter på at kunden sender inn sitt bildevalg'
                        : 'Opprett galleriet og send lenken til kunden — steget fullføres automatisk når kunden sender inn sitt valg.'}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      if (!confirm('Marker Selektering som fullført uten at kunden har sendt inn? Bruk kun dette hvis dere har blitt enige utenom systemet.')) return
                      handleAdvance(selectedTask.id, 'done')
                    }}
                    disabled={togglingId === selectedTask.id}
                    style={{
                      marginTop: 10, background: 'none', border: 'none', padding: 0,
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3,
                      textDecoration: 'underline', cursor: togglingId === selectedTask.id ? 'default' : 'pointer',
                    }}
                  >
                    Marker som fullført manuelt
                  </button>
                </div>
              ) : isSelectedActive ? (
                /* Normal handlingsknapper */
                <div style={{ display: 'flex', gap: 10 }}>
                  {selectedTask.status === 'todo' && (
                    <button
                      onClick={() => handleAdvance(selectedTask.id, 'in_progress')}
                      disabled={togglingId === selectedTask.id}
                      style={{
                        fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600,
                        padding: '10px 22px', borderRadius: 8, cursor: togglingId === selectedTask.id ? 'default' : 'pointer',
                        background: C.surface2, color: C.text, border: `1px solid ${C.border}`,
                        opacity: togglingId === selectedTask.id ? 0.6 : 1, transition: 'opacity 0.15s',
                      }}
                    >
                      Sett i gang
                    </button>
                  )}
                  {(selectedTask.status === 'in_progress' || selectedTask.status === 'todo') && (
                    <button
                      onClick={() => handleAdvance(selectedTask.id, 'done')}
                      disabled={togglingId === selectedTask.id}
                      style={{
                        fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600,
                        padding: '10px 22px', borderRadius: 8, cursor: togglingId === selectedTask.id ? 'default' : 'pointer',
                        background: C.success, color: '#fff', border: 'none',
                        opacity: togglingId === selectedTask.id ? 0.6 : 1,
                        transition: 'opacity 0.15s, transform 0.1s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)' }}
                    >
                      Merk som ferdig ✓
                    </button>
                  )}
                </div>
              ) : null}

              {isSelectedDone && (
                <button
                  onClick={() => handleGoBack(selectedTask.id)}
                  disabled={togglingId === selectedTask.id}
                  style={{
                    fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 500,
                    padding: '8px 16px', borderRadius: 7, cursor: togglingId === selectedTask.id ? 'default' : 'pointer',
                    background: 'transparent', color: C.text3,
                    border: `1px solid ${C.border}`,
                    opacity: togglingId === selectedTask.id ? 0.5 : 1,
                    transition: 'opacity 0.15s, color 0.15s, border-color 0.15s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.color = C.text2
                    ;(e.currentTarget as HTMLButtonElement).style.borderColor = C.text3
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.color = C.text3
                    ;(e.currentTarget as HTMLButtonElement).style.borderColor = C.border
                  }}
                >
                  ← Gå tilbake til dette steget
                </button>
              )}

              {isSelectedLocked && (
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, fontStyle: 'italic' }}>
                  Fullfør «{stepperTasks[selectedIdx - 1]?.title ?? 'forrige oppgave'}» for å låse opp dette steget.
                </p>
              )}

              {allDone && isSelectedDone && selectedIdx === displayTasks.length - 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', background: 'rgba(76,175,125,0.08)', border: `1px solid rgba(76,175,125,0.2)`, borderRadius: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8L6.5 11.5L13 4.5" stroke="#4CAF7D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 500, color: C.success }}>
                      Alle oppgaver fullført — klar for levering
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(currentProject.project_type === 'video' || currentProject.project_type === 'mixed') && (
                      <button
                        onClick={() => router.push(`/admin/transfers/new?projectId=${projectId}&type=video`)}
                        style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', background: C.success, color: '#fff', border: 'none' }}
                      >
                        ↑ Lever film
                      </button>
                    )}
                    {(currentProject.project_type === 'photo' || currentProject.project_type === 'mixed') && (
                      <button
                        onClick={() => router.push(`/admin/transfers/new?projectId=${projectId}&type=photo`)}
                        style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, padding: '5px 12px', borderRadius: 6, cursor: 'pointer', background: '#4A9AC4', color: '#fff', border: 'none' }}
                      >
                        ↑ Lever bilder
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

          </div>
        ) : null}
      </div>

      {actionError && (
        <div style={{ position: 'fixed', bottom: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 97, background: '#3a1d1d', color: '#f0b0b0', border: '1px solid #E05555', borderRadius: 8, padding: '8px 14px', fontSize: '0.78rem', fontFamily: 'var(--font-dm-sans)', display: 'flex', alignItems: 'center', gap: 10 }}>
          {actionError}
          <button onClick={() => setActionError(null)} style={{ background: 'none', border: 'none', color: '#f0b0b0', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {/* Flytende oppgave-chat — samme mønster som tilbuds-chatten på tilbudssiden
          (knapp øverst til høyre, sleng-inn-panel), i stedet for en permanent
          delt kolonne som alltid tok opp ~42% av skjermbredden. */}
      {selectedTask && (
        <TaskChatPanel
          taskId={selectedTask.id}
          taskTitle={selectedTask.title}
          currentUserId={currentUser?.id ?? null}
          profiles={profiles}
          forceOpen={forceOpenChat}
        />
      )}
    </div>
  )
}
