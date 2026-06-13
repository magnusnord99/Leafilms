'use client'

import { Fragment, useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  getPostProdProjects, getTasksForProject, updateTaskStatus,
  reseedPostProdTasks, setProjectType, getTaskMessages,
  sendTaskMessage, updateTaskNotes, updateTaskData, getCurrentUserProfile,
  rejectFeedbackAndReset, resetTaskAndSubsequent,
  getAllProfiles, toggleTaskAssignee, updatePostProdDelivery,
  getProjectDeliverablesSection,
} from '@/lib/actions/pipeline'
import { updateTaskDueDate } from '@/lib/actions/calendar'
import type { ProjectType, Task, ProjectWithPipeline, TaskMessage } from '@/lib/types'
import SelectionGallery from '@/app/admin/projects/[id]/SelectionGallery'
import { getAdminGallery } from '@/lib/actions/selections'
import type { SelectionGallery as GalleryData, SelectionImage } from '@/lib/actions/selections'

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

const PROFILE_COLORS = ['#7C5CFC', '#4A9AC4', '#4CAF7D', '#F0A500', '#E8529A', '#E07C3A', '#50C8C8']
function getProfileColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0x7fffffff
  return PROFILE_COLORS[hash % PROFILE_COLORS.length]
}

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

function formatTime(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
  }
  return (
    d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' }) +
    ' · ' +
    d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })
  )
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

export default function PostProdDetailPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [projects, setProjects] = useState<PostProdProject[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [messages, setMessages] = useState<TaskMessage[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [taskData, setTaskData] = useState<Record<string, Record<string, string>>>({})
  const [taskDataSaving, setTaskDataSaving] = useState(false)
  const [taskDataSaved, setTaskDataSaved] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  const [sendingMsg, setSendingMsg] = useState(false)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [loading, setLoading] = useState(true)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [reseeding, setReseeding] = useState(false)
  const [seedError, setSeedError] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string | null; email: string } | null>(null)
  const [showRejectionForm, setShowRejectionForm] = useState(false)
  const [selectionGalleryData, setSelectionGalleryData] = useState<{
    gallery: GalleryData; images: SelectionImage[]
    selectedCount: number; signedUrls: Record<string, string>
  } | null>(null)
  const [rejectionNote, setRejectionNote] = useState('')
  const [rejectionNoteError, setRejectionNoteError] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  const [profiles, setProfiles] = useState<{ id: string; name: string | null; email: string }[]>([])
  const [assigneeDropdownOpen, setAssigneeDropdownOpen] = useState(false)

  const [activeTab, setActiveTab] = useState<'video' | 'photo'>('video')

  const [dueDates, setDueDates] = useState<Record<string, string>>({})

  // Leveringsinfo
  const [editingDelivery, setEditingDelivery] = useState(false)
  const [deliveryVideo, setDeliveryVideo] = useState('')
  const [deliveryPhoto, setDeliveryPhoto] = useState('')
  const [savingDelivery, setSavingDelivery] = useState(false)
  const [showDeliveryModal, setShowDeliveryModal] = useState(false)

  type DeliverableItem = {
    title?: string
    description?: string
    quantity?: number | string
    format?: string
  }

  const [deliverableItems, setDeliverableItems] = useState<DeliverableItem[]>([])

  const chatEndRef = useRef<HTMLDivElement>(null)
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

  const VENTER_TITLE = 'Venter på tilbakemelding'
  const SELEKSJON_TITLE = 'Seleksjon til kunde'

  // For mixed-prosjekter: vis kun tasks for aktiv tab
  const isMixed = projects.find(p => p.id === projectId)?.project_type === 'mixed'
  const displayTasks = isMixed ? tasks.filter(t => t.sub_type === activeTab) : tasks

  const activeIdx = displayTasks.findIndex(t => t.status !== 'done')
  const allDone = displayTasks.length > 0 && activeIdx === -1
  const selectedTask = displayTasks[selectedIdx] ?? null

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function fetchAll() {
    setLoading(true)
    setSeedError(null)

    const [allProjects, projectTasks, userProfile, allProfiles, delivSection] = await Promise.all([
      getPostProdProjects(),
      getTasksForProject(projectId, 'post_prod'),
      getCurrentUserProfile(),
      getAllProfiles(),
      getProjectDeliverablesSection(projectId),
    ])
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
      setSelectedIdx(getInitialIdx(seeded))
      setLoading(false)
      return
    }

    setProjects(allProj)
    setTasks(projectTasks)
    initNotes(projectTasks)
    initTaskData(projectTasks)
    setSelectedIdx(getInitialIdx(projectTasks))
    if (currentProj) {
      setDeliveryVideo(currentProj.delivery_video ?? '')
      setDeliveryPhoto(currentProj.delivery_photo ?? '')
    }
    setLoading(false)
  }

  async function handleSaveDelivery() {
    setSavingDelivery(true)
    await updatePostProdDelivery(
      projectId,
      deliveryVideo.trim() || null,
      deliveryPhoto.trim() || null
    )
    setProjects(prev => prev.map(p =>
      p.id === projectId
        ? { ...p, delivery_video: deliveryVideo.trim() || null, delivery_photo: deliveryPhoto.trim() || null }
        : p
    ))
    setSavingDelivery(false)
    setEditingDelivery(false)
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

  function getInitialIdx(taskList: Task[]): number {
    const idx = taskList.findIndex(t => t.status !== 'done')
    return idx === -1 ? 0 : idx
  }

  async function loadMessages(taskId: string) {
    setLoadingMsgs(true)
    const msgs = await getTaskMessages(taskId)
    setMessages(msgs)
    setLoadingMsgs(false)
  }

  useEffect(() => { fetchAll() }, [projectId])

  useEffect(() => {
    if (!selectedTask) return
    loadMessages(selectedTask.id)
    if (notes[selectedTask.id] === undefined) {
      setNotes(prev => ({ ...prev, [selectedTask.id]: selectedTask.notes ?? '' }))
    }
    if (taskData[selectedTask.id] === undefined) {
      const td = (selectedTask.task_data as Record<string, string>) ?? {}
      setTaskData(prev => ({ ...prev, [selectedTask.id]: td }))
      pendingTaskDataRef.current[selectedTask.id] = td
    }
    if (selectedTask.title === SELEKSJON_TITLE) {
      getAdminGallery(projectId).then(setSelectionGalleryData).catch(() => setSelectionGalleryData(null))
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
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: to } : t))

    if (to === 'done') {
      const doneTaskIdx = displayTasks.findIndex(t => t.id === taskId)
      const nextIdx = doneTaskIdx + 1
      if (nextIdx < displayTasks.length) {
        setSelectedIdx(nextIdx)
        loadMessages(displayTasks[nextIdx].id)
        setNotes(prev => ({
          ...prev,
          [displayTasks[nextIdx].id]: prev[displayTasks[nextIdx].id] ?? displayTasks[nextIdx].notes ?? '',
        }))
      }
      setProjects(prev =>
        prev.map(p => p.id !== projectId ? p : { ...p, done_count: Math.min(p.done_count + 1, p.task_count) })
      )
    }

    await updateTaskStatus(taskId, to)
    setTogglingId(null)
  }

  async function handleSendMessage() {
    if (!newMessage.trim() || sendingMsg || !selectedTask) return
    setSendingMsg(true)
    const result = await sendTaskMessage(selectedTask.id, newMessage.trim())
    if (result.ok) {
      setNewMessage('')
      await loadMessages(selectedTask.id)
    }
    setSendingMsg(false)
  }

  async function handleReject() {
    if (!rejectionNote.trim()) {
      setRejectionNoteError(true)
      return
    }
    if (!selectedTask) return
    setRejecting(true)
    const result = await rejectFeedbackAndReset(projectId, selectedTask.id, rejectionNote.trim())
    if (!result.ok) {
      setRejecting(false)
      return
    }
    const [newProjects, newTasks] = await Promise.all([
      getPostProdProjects(),
      getTasksForProject(projectId, 'post_prod'),
    ])
    setProjects(newProjects as PostProdProject[])
    setTasks(newTasks)
    initNotes(newTasks)
    initTaskData(newTasks)
    // Naviger til klipping-steget (sort_order 2 = index 1)
    const klippingIdx = newTasks.findIndex(t => t.sort_order === 2)
    const gotoIdx = klippingIdx >= 0 ? klippingIdx : 0
    setSelectedIdx(gotoIdx)
    if (gotoIdx < newTasks.length) loadMessages(newTasks[gotoIdx].id)
    setShowRejectionForm(false)
    setRejectionNote('')
    setRejecting(false)
  }

  async function handleGoBack(taskId: string) {
    if (!selectedTask) return
    setTogglingId(taskId)
    const taskToReset = tasks.find(t => t.id === taskId)
    const subType = taskToReset?.sub_type ?? null
    const sortOrder = taskToReset?.sort_order ?? 0
    // Optimistisk: nullstill denne og alle etter den med samme sub_type lokalt
    setTasks(prev => prev.map(t => {
      if (t.sub_type !== subType) return t
      if (t.sort_order < sortOrder) return t
      return { ...t, status: 'todo' }
    }))
    setProjects(prev => {
      const resetCount = tasks.filter(t => t.sub_type === subType && t.sort_order >= sortOrder && t.status === 'done').length
      return prev.map(p => p.id !== projectId ? p : { ...p, done_count: Math.max(0, p.done_count - resetCount) })
    })
    await resetTaskAndSubsequent(projectId, taskId)
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
    const tabTasks = tasks.filter(t => t.sub_type === tab)
    const initIdx = getInitialIdx(tabTasks)
    setSelectedIdx(initIdx)
    setShowRejectionForm(false)
    setRejectionNote('')
    if (tabTasks[initIdx]) loadMessages(tabTasks[initIdx].id)
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
    setMessages([])
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
  const doneTasks = tasks.filter(t => t.status === 'done').length
  const totalTasks = tasks.length
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0
  // allDone i headeren sjekker begge flyter
  const allTasksDone = totalTasks > 0 && doneTasks === totalTasks

  // Determine selected task state
  const isSelectedActive = selectedIdx === (activeIdx === -1 ? -1 : activeIdx)
  const isSelectedDone = selectedTask?.status === 'done'
  const isSelectedLocked = selectedTask && !isSelectedDone && !isSelectedActive

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 48px)', overflow: 'hidden', background: C.bg }}>

      {/* Sidebar */}
      <aside style={{ width: 220, flexShrink: 0, borderRight: `1px solid ${C.border}`, background: C.sidebar, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
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
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
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
                onClick={e => { if (e.target === e.currentTarget) setShowDeliveryModal(false) }}
              >
                <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, width: 400, maxWidth: '90vw', maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 700, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      Leveranser
                    </span>
                    <button onClick={() => setShowDeliveryModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, fontSize: '1.1rem', lineHeight: 1, padding: '2px 6px' }}>×</button>
                  </div>

                  {deliverableItems.length === 0 ? (
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, fontStyle: 'italic' }}>
                      Ingen leveranser er lagt til i pitchen for dette prosjektet.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {deliverableItems.map((item, i) => {
                        const qty = typeof item.quantity === 'number'
                          ? item.quantity
                          : (item.quantity != null ? parseInt(item.quantity, 10) || null : null)
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: i < deliverableItems.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                            {qty != null && (
                              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', fontWeight: 700, color: C.accent, minWidth: 28, textAlign: 'right', flexShrink: 0 }}>
                                {qty}
                              </span>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600, color: C.text, display: 'block' }}>
                                {item.title || '—'}
                              </span>
                              {item.description && (
                                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, display: 'block', marginTop: 1 }}>
                                  {item.description}
                                </span>
                              )}
                            </div>
                            {item.format && (
                              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, flexShrink: 0, background: C.surface2, padding: '2px 6px', borderRadius: 4 }}>
                                {item.format}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>
                      Redigeres i pitchen for dette prosjektet — under seksjonen «Leveranser».
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Film/Bilder-faner for mixed-prosjekter */}
          {isMixed && tasks.length > 0 && !reseeding && (
            <div style={{ display: 'flex', alignItems: 'center', borderTop: `1px solid ${C.border}` }}>
              {(['video', 'photo'] as const).map(tab => {
                const tabTasks = tasks.filter(t => t.sub_type === tab)
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
        </div>

        {/* Content */}
        {tasks.length === 0 ? (
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
            <div style={{ flex: '0 0 58%', overflowY: 'auto', padding: '28px 32px', borderRight: `1px solid ${C.border}`, minWidth: 0 }}>

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
              <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.4rem', fontWeight: 700, color: C.text, marginBottom: 8, lineHeight: 1.2 }}>
                {selectedTask.title}
              </h2>

              {/* Description from template */}
              {selectedTask.description && (
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text2, lineHeight: 1.6, marginBottom: 28 }}>
                  {selectedTask.description}
                </p>
              )}

              {/* Seleksjonsgalleri */}
              {selectedTask.title === SELEKSJON_TITLE && (
                <div style={{ marginBottom: 28 }}>
                  <SelectionGallery
                    projectId={projectId}
                    initialData={selectionGalleryData}
                    deliveryPhoto={projects.find(p => p.id === projectId)?.delivery_photo}
                  />
                </div>
              )}

              {/* Task links */}
              {(() => {
                const linkFields = TASK_LINK_FIELDS[selectedTask.title] ?? []
                if (linkFields.length === 0) return null
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
                              background: getProfileColor(a.id), color: '#fff',
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
                              background: isAssigned ? getProfileColor(profile.id) : C.surface,
                              border: `1px solid ${isAssigned ? getProfileColor(profile.id) : C.border}`,
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
                  Fullfør «{tasks[selectedIdx - 1]?.title ?? 'forrige oppgave'}» for å låse opp dette steget.
                </p>
              )}

              {allDone && isSelectedDone && selectedIdx === displayTasks.length - 1 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'rgba(76,175,125,0.08)', border: `1px solid rgba(76,175,125,0.2)`, borderRadius: 8 }}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8L6.5 11.5L13 4.5" stroke="#4CAF7D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 500, color: C.success }}>
                    Alle oppgaver fullført — klar for levering
                  </p>
                </div>
              )}
            </div>

            {/* Right: chat */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: C.bg }}>

              {/* Chat header */}
              <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Chat
                </p>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, marginTop: 2 }}>
                  {selectedTask.title}
                </p>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {loadingMsgs ? (
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, textAlign: 'center', marginTop: 32 }}>Laster meldinger...</p>
                ) : messages.length === 0 ? (
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, textAlign: 'center', marginTop: 32 }}>
                    Ingen meldinger ennå. Start diskusjonen!
                  </p>
                ) : (
                  messages.map(msg => {
                    const isMe = currentUser?.id === msg.user_id
                    const senderName = msg.user?.name ?? msg.user?.email?.split('@')[0] ?? 'Ukjent'
                    return (
                      <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', gap: 3 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {!isMe && (
                            <div style={{ width: 22, height: 22, borderRadius: '50%', background: C.surface2, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.55rem', fontWeight: 700, color: C.text2 }}>
                                {senderName.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          )}
                          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 500, color: isMe ? C.accent : C.text3 }}>
                            {isMe ? 'Du' : senderName}
                          </span>
                          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.text3 }}>
                            {formatTime(msg.created_at)}
                          </span>
                        </div>
                        <div style={{
                          maxWidth: '85%', padding: '8px 12px', borderRadius: isMe ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                          background: isMe ? C.accentBg : C.surface,
                          border: `1px solid ${isMe ? 'rgba(124,92,252,0.2)' : C.border}`,
                        }}>
                          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {msg.message}
                          </p>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Message input */}
              <div style={{ flexShrink: 0, padding: '12px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                  placeholder="Skriv en melding... (Enter for å sende)"
                  rows={2}
                  style={{
                    flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem',
                    color: C.text, background: C.surface,
                    border: `1px solid ${C.border}`, borderRadius: 8,
                    padding: '9px 12px', resize: 'none', outline: 'none', lineHeight: 1.5,
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
                  onBlur={e => { e.currentTarget.style.borderColor = C.border }}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim() || sendingMsg}
                  style={{
                    width: 38, height: 38, borderRadius: 8, flexShrink: 0,
                    background: newMessage.trim() ? C.accent : C.surface2,
                    border: 'none', cursor: newMessage.trim() && !sendingMsg ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    opacity: !newMessage.trim() || sendingMsg ? 0.5 : 1,
                    transition: 'background 0.15s, opacity 0.15s',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M14 8L2 3L5.5 8L2 13L14 8Z" fill="white" />
                  </svg>
                </button>
              </div>
            </div>

          </div>
        ) : null}
      </div>
    </div>
  )
}
