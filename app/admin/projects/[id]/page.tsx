'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { getProjectHub, updateTaskStatus, getAllProfiles, toggleTaskAssignee, updateProjectDeliveryInfo, saveProjectMeetingNotes, analyzeProjectNotes, getContractStatus, setProjectLead, getCurrentUserProfile, getTaskMessageCounts, updateProjectTitle, updateProjectCustomer, getCustomersList } from '@/lib/actions/pipeline'
import { getProjectContractData, publishContract, unpublishContract, unsignContract, generateContractText } from '@/lib/actions/contracts'
import { updateProjectShootDates, setShootConfirmed as setShootConfirmedAction } from '@/lib/actions/calendar'
import { markAsLost } from '@/lib/actions/lost'
import { LOST_REASON_LABELS, type LostReason } from '@/lib/lost-constants'
import { PIPELINE_STAGES, PipelineStage, Task } from '@/lib/types'
import type { Quote, ContractFormFields, OurSignature } from '@/lib/types'
import { SignatureCanvas, type SignatureCanvasHandle } from '@/components/shared/SignatureCanvas'
import { TaskChatToggle } from '@/components/task/TaskChatToggle'
import { ProjectChat } from '@/components/project/ProjectChat'
import { getAvatarColor } from '@/lib/avatar-colors'
import { useAuth } from '@/hooks/useAuth'
import { isStageAllowed, isStaffRole } from '@/lib/permissions'

const C = {
  bg:       '#181920',
  surface:  '#21212D',
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text:     '#EEEEF2',
  text2:    '#B4B4CC',
  text3:    '#8484A0',
  accent:   '#7C5CFC',
  accentBg: 'rgba(124,92,252,0.08)',
  success:  '#4CAF7D',
  danger:   '#E05555',
}

type HubData = Awaited<ReturnType<typeof getProjectHub>>
type ActiveTab = 'oversikt' | 'pitch' | 'kontrakt'

function PipelineProgress({ currentStage }: { currentStage: PipelineStage }) {
  const currentIndex = PIPELINE_STAGES.findIndex(s => s.value === currentStage)
  return (
    <div style={{ display: 'flex', alignItems: 'center', overflowX: 'auto', gap: 0 }}>
      {PIPELINE_STAGES.map((stage, i) => {
        const isPast = i < currentIndex
        const isCurrent = i === currentIndex
        return (
          <div key={stage.value} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            {i > 0 && (
              <div style={{ width: 18, height: 1, background: isPast || isCurrent ? C.accent : C.border }} />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <div style={{
                width: isCurrent ? 10 : 7,
                height: isCurrent ? 10 : 7,
                borderRadius: '50%',
                background: isPast ? C.accent : isCurrent ? C.accent : C.surface2,
                border: isCurrent ? `2px solid rgba(124,92,252,0.4)` : 'none',
                boxShadow: isCurrent ? '0 0 8px rgba(124,92,252,0.4)' : 'none',
              }} />
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.5rem', color: isCurrent ? C.accent : isPast ? C.text3 : C.text3, whiteSpace: 'nowrap', fontWeight: isCurrent ? 600 : 400, opacity: isCurrent ? 1 : isPast ? 0.7 : 0.4 }}>
                {stage.label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

type Profile = { id: string; name: string | null; email: string; color: string | null }

function AssigneePicker({
  task,
  profiles,
  onToggle,
}: {
  task: Task
  profiles: Profile[]
  onToggle: (taskId: string, profileId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(v => !v) }}
        title="Tildel oppgave"
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', borderRadius: 5, cursor: 'pointer',
          background: open ? C.accentBg : 'transparent',
          border: `1px solid ${open ? 'rgba(124,92,252,0.3)' : C.border}`,
          transition: 'all 0.12s',
        }}
      >
        {task.assignees.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {task.assignees.slice(0, 3).map((a, i) => (
              <span key={a.id} style={{
                width: 20, height: 20, borderRadius: '50%',
                background: C.accent, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.58rem', fontWeight: 700, flexShrink: 0,
                marginLeft: i > 0 ? -6 : 0,
                border: `2px solid ${C.surface}`,
                position: 'relative', zIndex: 3 - i,
              }}>
                {(a.name ?? a.email)[0].toUpperCase()}
              </span>
            ))}
            {task.assignees.length > 3 && (
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: C.surface2, color: C.text3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem', fontWeight: 700, marginLeft: -6, border: `2px solid ${C.surface}` }}>
                +{task.assignees.length - 3}
              </span>
            )}
          </div>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.text3} strokeWidth="2" strokeLinecap="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        )}
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ flexShrink: 0 }}>
          <path d="M1 2.5L4 5.5L7 2.5" stroke={C.text3} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 5px)', right: 0, zIndex: 50,
          background: C.surface2, border: `1px solid ${C.border}`,
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          minWidth: 200, maxHeight: 240, overflowY: 'auto', padding: '3px 0',
        }}>
          {profiles.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, padding: '10px 14px' }}>Ingen brukere</p>
          ) : profiles.map(p => {
            const isAssigned = task.assignees.some(a => a.id === p.id)
            return (
              <button
                key={p.id}
                onClick={() => { onToggle(task.id, p.id); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  width: '100%', padding: '7px 12px',
                  background: isAssigned ? C.accentBg : 'none',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                }}
                onMouseEnter={e => { if (!isAssigned) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={e => { if (!isAssigned) (e.currentTarget as HTMLButtonElement).style.background = 'none' }}
              >
                <span style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  background: isAssigned ? C.accent : C.surface,
                  border: `1px solid ${isAssigned ? C.accent : C.border}`,
                  color: isAssigned ? '#fff' : C.text2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.62rem', fontWeight: 700,
                }}>
                  {(p.name ?? p.email)[0].toUpperCase()}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name ?? p.email}
                  </p>
                  {p.name && (
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.email}
                    </p>
                  )}
                </div>
                {isAssigned && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                    <path d="M2 6L5 9L10 3" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
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

const SMART_CONDITIONS: Record<string, (hs: boolean, q: Quote | null) => boolean> = {
  'Lag prosjektbeskrivelse':              (hs)    => hs,
  'Sett opp priser i tilbud':             (_,  q) => q != null,
  'Publiser og send tilbud til kunde':    (_,  q) => q?.status === 'sent' || q?.status === 'accepted',
}

function StepIndicator({ done, active, num }: { done: boolean; active: boolean; num: number }) {
  return (
    <div style={{
      width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: done ? 'rgba(76,175,125,0.12)' : active ? C.accentBg : C.surface2,
      border: `1.5px solid ${done ? 'rgba(76,175,125,0.35)' : active ? C.accent : C.border}`,
    }}>
      {done ? (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1.5 5L4 7.5L8.5 2.5" stroke="#4CAF7D" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', fontWeight: 700, color: active ? C.accent : C.text3 }}>
          {num}
        </span>
      )}
    </div>
  )
}

function SubCheck({ label, done }: { label: string; done: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{
        width: 14, height: 14, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: done ? 'rgba(76,175,125,0.12)' : C.surface2,
        border: `1px solid ${done ? 'rgba(76,175,125,0.35)' : C.border}`,
        flexShrink: 0,
      }}>
        {done && (
          <svg width="7" height="7" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 5L4 7.5L8.5 2.5" stroke="#4CAF7D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: done ? '#4CAF7D' : C.text3 }}>
        {label}
      </span>
    </div>
  )
}

function TilbudStepper({
  projectId,
  hasSections,
  quote,
  notesValue,
  customerId,
  projectTitle,
  isContractPublished,
}: {
  projectId: string
  hasSections: boolean
  quote: Quote | null
  notesValue: string
  customerId: string | null
  projectTitle: string
  isContractPublished: boolean
}) {
  const step1Done = hasSections
  const step2QuoteDone = quote != null
  const step2ContractDone = isContractPublished
  const step2Done = step2QuoteDone && step2ContractDone
  const allDone = step1Done && step2Done

  const step1Href = step1Done
    ? `/admin/projects/${projectId}/edit`
    : `/admin/projects/new?project_id=${projectId}&customer_id=${customerId ?? ''}&title=${encodeURIComponent(projectTitle)}&context=${encodeURIComponent(notesValue.trim())}`
  const step1BtnLabel = step1Done ? 'Rediger →' : 'Opprett med AI →'

  // Pek til første ufullstendige av de to
  const step2Href = step2QuoteDone
    ? `/admin/projects/${projectId}?tab=kontrakt`
    : `/admin/projects/${projectId}/quote`
  const step2BtnLabel = step2Done ? 'Rediger →' : step2QuoteDone ? 'Åpne kontrakt →' : 'Åpne tilbud →'



  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

      {/* Steg 1 — Pitch */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 16px', borderRadius: 8, background: C.surface,
        border: `1px solid ${step1Done ? 'rgba(76,175,125,0.2)' : C.accent + '60'}`,
        transition: 'border-color 0.15s',
      }}>
        <StepIndicator done={step1Done} active={!step1Done} num={1} />
        <span style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 500, flex: 1,
          color: step1Done ? C.text3 : C.text,
          textDecoration: step1Done ? 'line-through' : 'none',
        }}>
          Sett opp pitch
        </span>
        <Link href={step1Href} style={{ textDecoration: 'none', flexShrink: 0 }}>
          <button style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500,
            padding: '5px 12px', borderRadius: 5, cursor: 'pointer', border: 'none',
            background: step1Done ? C.surface2 : C.accent,
            color: step1Done ? C.text2 : '#fff',
          }}>
            {step1BtnLabel}
          </button>
        </Link>
      </div>

      {/* Steg 2 — Tilbud + Kontrakt (kombinert) */}
      <div style={{
        padding: '14px 16px', borderRadius: 8, background: C.surface,
        border: `1px solid ${step2Done ? 'rgba(76,175,125,0.2)' : step1Done ? C.accent + '60' : C.border}`,
        opacity: step1Done ? 1 : 0.4,
        transition: 'border-color 0.15s, opacity 0.15s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <StepIndicator done={step2Done} active={step1Done && !step2Done} num={2} />
          <div style={{ flex: 1 }}>
            <span style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 500,
              color: step2Done ? C.text3 : C.text,
              textDecoration: step2Done ? 'line-through' : 'none',
            }}>
              Sett opp tilbud og kontrakt
            </span>
            <div style={{ display: 'flex', gap: 14, marginTop: 5 }}>
              <SubCheck label="Tilbud" done={step2QuoteDone} />
              <SubCheck label="Kontrakt" done={step2ContractDone} />
            </div>
          </div>
          {step1Done && (
            <Link href={step2Href} style={{ textDecoration: 'none', flexShrink: 0 }}>
              <button style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500,
                padding: '5px 12px', borderRadius: 5, cursor: 'pointer', border: 'none',
                background: step1Done && !step2Done ? C.accent : C.surface2,
                color: step1Done && !step2Done ? '#fff' : C.text2,
              }}>
                {step2BtnLabel}
              </button>
            </Link>
          )}
        </div>
      </div>

      {/* Send-knapp */}
      <div style={{ marginTop: 10 }}>
        {allDone ? (
          <Link href={`/admin/projects/${projectId}/email`} style={{ textDecoration: 'none', display: 'block' }}>
            <button
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600,
                padding: '12px 20px', borderRadius: 8, cursor: 'pointer',
                border: 'none', width: '100%',
                background: C.accent,
                color: '#fff',
                transition: 'background 0.15s, box-shadow 0.15s',
                boxShadow: '0 0 24px rgba(124,92,252,0.3)',
              }}
            >
              Send e-post til kunde →
            </button>
          </Link>
        ) : (
          <button
            disabled
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600,
              padding: '12px 20px', borderRadius: 8, cursor: 'not-allowed',
              border: 'none', width: '100%',
              background: C.surface2,
              color: C.text3,
            }}
          >
            Send e-post til kunde →
          </button>
        )}
        {!allDone && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, textAlign: 'center', marginTop: 8 }}>
            Fullfør begge stegene for å sende tilbudet
          </p>
        )}
      </div>
    </div>
  )
}

function KontraktStageView({
  project,
  pitchToken,
}: {
  project: { id: string; title: string; pipeline_data?: Record<string, unknown> | null }
  pitchToken: string | null
}) {
  const [contractStatus, setContractStatus] = useState<{
    isSigned: boolean; signedAt: string | null; signerName: string | null
  }>({ isSigned: false, signedAt: null, signerName: null })
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getContractStatus(project.id).then(s => {
      setContractStatus({ isSigned: s.isSigned, signedAt: s.signedAt, signerName: s.signerName })
      setLoading(false)
    })
  }, [project.id])

  function copyPitchLink() {
    if (!pitchToken) return
    const url = `${window.location.origin}/p/${pitchToken}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>Laster...</p>
  }

  if (contractStatus.isSigned) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ padding: '16px 18px', borderRadius: 8, background: 'rgba(76,175,125,0.06)', border: '1px solid rgba(76,175,125,0.25)' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.88rem', fontWeight: 600, color: '#4CAF7D', marginBottom: 4 }}>
            Kontrakt signert
          </p>
          {contractStatus.signerName && (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>
              Signert av {contractStatus.signerName}
              {contractStatus.signedAt && ` · ${new Date(contractStatus.signedAt).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })}`}
            </p>
          )}
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, marginTop: 8 }}>
            Prosjektet flyttes automatisk til Pre-produksjon.
          </p>
        </div>
        <Link href={`/admin/projects/${project.id}?tab=kontrakt`} style={{ textDecoration: 'none' }}>
          <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', border: 'none', background: C.surface2, color: C.text2 }}>
            Se signert kontrakt →
          </button>
        </Link>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ padding: '20px 18px', borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, textAlign: 'center' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: C.accentBg, border: `1.5px solid rgba(124,92,252,0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.5" strokeLinecap="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </div>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.88rem', fontWeight: 600, color: C.text, marginBottom: 6 }}>
          Venter på signering
        </p>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, lineHeight: 1.6 }}>
          Kunden må signere kontrakten. Prosjektet avanserer automatisk til Pre-produksjon etter signering.
        </p>
      </div>

      {pitchToken && (
        <div style={{ padding: '12px 14px', borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500, color: C.text2, marginBottom: 2 }}>Pitch- og kontraktslenke</p>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {typeof window !== 'undefined' ? `${window.location.origin}/p/${pitchToken}` : `/p/${pitchToken}`}
            </p>
          </div>
          <button onClick={copyPitchLink} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500, padding: '5px 12px', borderRadius: 5, cursor: 'pointer', border: 'none', background: copied ? 'rgba(76,175,125,0.1)' : C.accentBg, color: copied ? '#4CAF7D' : C.accent, flexShrink: 0 }}>
            {copied ? '✓ Kopiert' : 'Kopier'}
          </button>
        </div>
      )}

      <Link href={`/admin/projects/${project.id}?tab=kontrakt`} style={{ textDecoration: 'none' }}>
        <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, padding: '7px 14px', borderRadius: 6, cursor: 'pointer', border: `1px solid ${C.border}`, background: 'none', color: C.text2, width: '100%' }}>
          Rediger kontrakt →
        </button>
      </Link>
    </div>
  )
}

function effectiveDone(task: Task, hasSections: boolean, quote: Quote | null): boolean {
  const cond = SMART_CONDITIONS[task.title]
  return cond ? cond(hasSections, quote) || task.status === 'done' : task.status === 'done'
}

function TaskChecklist({
  tasks,
  profiles,
  onToggle,
  onAssigneeToggle,
  togglingId,
  hasSections,
  quote,
  currentUserId,
  messageCounts,
  deepLinkTaskId,
}: {
  tasks: Task[]
  profiles: Profile[]
  onToggle: (id: string, s: Task['status']) => void
  onAssigneeToggle: (taskId: string, profileId: string) => void
  togglingId: string | null
  hasSections: boolean
  quote: Quote | null
  currentUserId: string | null
  messageCounts: Record<string, number>
  deepLinkTaskId: string | null
}) {
  if (tasks.length === 0) {
    return (
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, padding: '24px 0' }}>
        Ingen oppgaver for dette steget ennå.
      </p>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {tasks.map(task => {
        const isDone = effectiveDone(task, hasSections, quote)
        const isAutoChecked = isDone && task.status !== 'done'
        const isToggling = togglingId === task.id
        return (
          <div
            key={task.id}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: C.surface, border: `1px solid ${isDone ? 'rgba(76,175,125,0.2)' : C.border}`, borderRadius: 6, opacity: isToggling ? 0.5 : 1, transition: 'opacity 0.15s, border-color 0.2s', gap: 8, flexWrap: 'wrap' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
              <button
                onClick={() => !isAutoChecked && onToggle(task.id, task.status)}
                disabled={isToggling || isAutoChecked}
                title={isAutoChecked ? 'Auto-fullført basert på prosjektstatus' : undefined}
                style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${isDone ? C.success : C.text3}`, background: isDone ? 'rgba(76,175,125,0.15)' : 'transparent', cursor: isAutoChecked ? 'default' : 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, transition: 'all 0.15s' }}
              >
                {isDone && (
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path d="M1 4L3 6L7 2" stroke={C.success} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: isDone ? C.text3 : C.text, textDecoration: isDone ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {task.title}
              </span>
              {isAutoChecked && (
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.success, background: 'rgba(76,175,125,0.1)', padding: '1px 6px', borderRadius: 4, flexShrink: 0 }}>auto</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <AssigneePicker task={task} profiles={profiles} onToggle={onAssigneeToggle} />
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: isDone ? C.success : task.status === 'in_progress' ? '#F0A500' : C.text3 }}>
                {isDone ? 'Ferdig' : task.status === 'in_progress' ? 'Pågår' : 'Todo'}
              </span>
            </div>
            <TaskChatToggle
              taskId={task.id}
              taskTitle={task.title}
              currentUserId={currentUserId}
              profiles={profiles}
              messageCount={messageCounts[task.id] ?? 0}
              forceOpen={deepLinkTaskId === task.id}
            />
          </div>
        )
      })}
    </div>
  )
}


export default function ProjectHubPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = params.id as string
  const { profile: authProfile } = useAuth()

  const [hubData, setHubData] = useState<HubData>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    const tab = searchParams?.get('tab')
    if (tab === 'pitch' || tab === 'kontrakt') return tab
    return 'oversikt'
  })

  useEffect(() => {
    const tab = searchParams?.get('tab')
    if (tab === 'pitch' || tab === 'kontrakt') setActiveTab(tab)
  }, [searchParams])
  const [togglingTaskId, setTogglingTaskId] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [, startTransition] = useTransition()
  const [deliveryEdit, setDeliveryEdit] = useState(false)
  const [deliveryValue, setDeliveryValue] = useState('')
  const [savingDelivery, setSavingDelivery] = useState(false)
  const [shootEdit, setShootEdit] = useState(false)
  const [shootStart, setShootStart] = useState('')
  const [shootEnd, setShootEnd] = useState('')
  const [savingShoot, setSavingShoot] = useState(false)
  const [shootConfirmedManually, setShootConfirmedManually] = useState(false)
  const [contractSigned, setContractSigned] = useState(false)
  const [confirmingShoot, setConfirmingShoot] = useState(false)

  const [titleEdit, setTitleEdit] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const [savingTitle, setSavingTitle] = useState(false)

  const [customerPickerOpen, setCustomerPickerOpen] = useState(false)
  const [customerOptions, setCustomerOptions] = useState<{ id: string; name: string; company: string | null }[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [savingCustomer, setSavingCustomer] = useState(false)
  const customerDropdownRef = useRef<HTMLDivElement>(null)

  const [stepperContractPublished, setStepperContractPublished] = useState(false)
  const [contractText, setContractText] = useState('')
  const [contractIsPublished, setContractIsPublished] = useState(false)
  const [contractSignature, setContractSignature] = useState<{ signerName: string; signerEmail: string; signedAt: string } | null>(null)
  const [contractPdfUrl, setContractPdfUrl] = useState<string | null>(null)
  const [loadingContract, setLoadingContract] = useState(false)
  const [publishingContract, setPublishingContract] = useState(false)
  const [downloadingContractPdf, setDownloadingContractPdf] = useState(false)
  const [unsigningContract, setUnsigningContract] = useState(false)
  const [contractSaved, setContractSaved] = useState(false)
  const [contractHasText, setContractHasText] = useState(false)
  const [contractAutoVars, setContractAutoVars] = useState<{
    bedrift: string; kunde_kontakt: string; oppstart_dato: string; opptak_datoer: string; leveranse: string; totalpris: string
  } | null>(null)
  const [contractFormOpen, setContractFormOpen] = useState(false)
  const [contractForm, setContractForm] = useState({
    orgNummer: '', produksjonsPeriode: '', signeringsSted: '', signeringsDato: '',
    bedrift: '', kundeKontakt: '', oppstartDato: '', opptakDatoer: '', leveranse: '', totalpris: '',
    reiseDekkesAv: 'oppdragsgiver' as 'oppdragsgiver' | 'oppdragstaker', antallCrew: '',
  })
  const [generatingContract, setGeneratingContract] = useState(false)
  // Snapshot av kontraktForm på det tidspunktet kontraktteksten sist ble generert/lastet —
  // brukes til å oppdage om noen har endret felt (org.nummer m.fl.) uten å regenerere teksten
  // før publisering (feedback 2702e25d: feltet ble lagret, men PDF-en fikk aldri den nye teksten).
  const [lastGeneratedFormFields, setLastGeneratedFormFields] = useState<ContractFormFields | null>(null)

  const [contractOurSignature, setContractOurSignature] = useState<OurSignature | null>(null)
  const [mySignatureImage, setMySignatureImage] = useState<string | null>(null)
  const [myName, setMyName] = useState('')
  const [signModalOpen, setSignModalOpen] = useState(false)
  const [signModalRedraw, setSignModalRedraw] = useState(false)
  const [saveSignatureToProfile, setSaveSignatureToProfile] = useState(true)
  const [signingAndPublishing, setSigningAndPublishing] = useState(false)
  const sigCanvasRef = useRef<SignatureCanvasHandle>(null)
  const [sigCanvasHasSigned, setSigCanvasHasSigned] = useState(false)

  const [showLostModal, setShowLostModal] = useState(false)
  const [lostReason, setLostReason] = useState<LostReason | null>(null)
  const [lostNotes, setLostNotes] = useState('')
  const [markingLost, setMarkingLost] = useState(false)

  // Møtenotater / e-posttråd
  const [notesValue, setNotesValue] = useState('')
  const [notesSaved, setNotesSaved] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  type MeetingSummary = {
    sammendrag?: string
  }
  const [summary, setSummary] = useState<MeetingSummary | null>(null)
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [projectLead, setProjectLead_] = useState<{ id: string; name: string | null; email: string; color: string | null } | null>(null)
  const [leadDropdownOpen, setLeadDropdownOpen] = useState(false)
  const leadDropdownRef = useRef<HTMLDivElement>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [messageCounts, setMessageCounts] = useState<Record<string, number>>({})
  const [deepLinkNoticeDismissed, setDeepLinkNoticeDismissed] = useState(false)
  const deepLinkTaskId = searchParams?.get('task') ?? null
  const forceOpenChat = searchParams?.get('chat') === '1'

  async function fetchHub() {
    setLoading(true)
    setError(null)
    const [data, allProfiles] = await Promise.all([
      getProjectHub(projectId),
      getAllProfiles(),
    ])
    if (!data) setError('Fant ikke prosjektet.')
    else {
      setHubData(data)
      setDeliveryValue(data.project.delivery_description ?? '')
      setShootStart(data.project.shoot_start ?? '')
      setShootEnd(data.project.shoot_end ?? '')
      setShootConfirmedManually(data.project.shoot_confirmed ?? false)
      setNotesValue(data.project.meeting_notes ?? '')
      setSummary(data.project.meeting_summary ?? null)
      setProjectLead_(data.project.project_lead
        ? { ...data.project.project_lead, color: allProfiles.find(p => p.id === data.project.project_lead!.id)?.color ?? null }
        : null)
      // Kontrakt-status brukes både av stepperen (tilbud_sendt/kontrakt-steg) og av
      // opptak-bekreftelsen — sistnevnte gjelder uansett pipeline_stage, siden prosjekter
      // kan flyttes forbi kontrakt-steget uten signatur (advanceFromKontraktUnsigned)
      const cs = await getContractStatus(projectId)
      setContractSigned(cs.isSigned)
      if (data.project.pipeline_stage === 'tilbud_sendt' || data.project.pipeline_stage === 'kontrakt') {
        setStepperContractPublished(cs.isPublished)
      }

    }
    setProfiles(allProfiles)
    if (data && data.tasks.length > 0) {
      getTaskMessageCounts(data.tasks.map(t => t.id)).then(setMessageCounts)
    }
    setLoading(false)
  }

  useEffect(() => { if (projectId) fetchHub() }, [projectId])
  useEffect(() => {
    getCurrentUserProfile().then(profile => setCurrentUserId(profile?.id ?? null))
  }, [])

  // Sales/produksjon skal ikke kunne åpne prosjekter som ligger utenfor rollens
  // pipeline-steg (f.eks. produksjon som prøver seg på et lead-stadium-prosjekt via direkte
  // lenke) — samme regler som filtrerer prosjektlisten i /admin/projects. Hard redirect (ikke
  // router.push) — samme grunn som i app/admin/layout.tsx: en client-side push i en effect
  // rett etter mount kan bli stille droppet før routeren er klar.
  useEffect(() => {
    if (!hubData || !isStaffRole(authProfile?.role)) return
    if (!isStageAllowed(authProfile.role, hubData.project.pipeline_stage)) {
      window.location.href = '/admin/projects'
    }
  }, [hubData, authProfile])

  function handleNotesChange(value: string) {
    setNotesValue(value)
    setNotesSaved(false)
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    notesTimerRef.current = setTimeout(async () => {
      await saveProjectMeetingNotes(projectId, value)
      setNotesSaved(true)
    }, 1200)
  }

  async function handleAnalyze() {
    if (!notesValue.trim()) return
    setAnalyzing(true)
    await saveProjectMeetingNotes(projectId, notesValue)
    const result = await analyzeProjectNotes(projectId, notesValue, project?.title ?? '')
    if (result) {
      setSummary(result)
      setHubData(prev => prev ? { ...prev, project: { ...prev.project, meeting_notes: notesValue, meeting_summary: result } } : prev)
    }
    setAnalyzing(false)
  }

  async function handleTaskToggle(taskId: string, currentStatus: Task['status']) {
    const nextStatus: Task['status'] = currentStatus === 'done' ? 'todo' : 'done'
    setTogglingTaskId(taskId)
    setHubData(prev => {
      if (!prev) return prev
      return { ...prev, tasks: prev.tasks.map(t => t.id === taskId ? { ...t, status: nextStatus } : t) }
    })
    startTransition(async () => {
      await updateTaskStatus(taskId, nextStatus)
      setTogglingTaskId(null)
    })
  }

  async function handleSaveDelivery() {
    setSavingDelivery(true)
    await updateProjectDeliveryInfo(projectId, deliveryValue.trim() || null, null)
    setHubData(prev => prev ? { ...prev, project: { ...prev.project, delivery_description: deliveryValue.trim() || null } } : prev)
    setSavingDelivery(false)
    setDeliveryEdit(false)
  }

  async function handleSaveShootDates() {
    setSavingShoot(true)
    await updateProjectShootDates(projectId, shootStart || null, shootEnd || null)
    setSavingShoot(false)
    setShootEdit(false)
  }

  async function handleConfirmShoot() {
    setConfirmingShoot(true)
    await setShootConfirmedAction(projectId, true)
    setShootConfirmedManually(true)
    setConfirmingShoot(false)
  }

  async function handleSaveTitle() {
    if (!titleValue.trim()) return
    setSavingTitle(true)
    const result = await updateProjectTitle(projectId, titleValue)
    setSavingTitle(false)
    if (result.ok) {
      setHubData(prev => prev ? { ...prev, project: { ...prev.project, title: titleValue.trim() } } : prev)
      setTitleEdit(false)
    }
  }

  async function handleOpenCustomerPicker() {
    setCustomerPickerOpen(true)
    if (customerOptions.length === 0) {
      const list = await getCustomersList()
      setCustomerOptions(list)
    }
  }

  async function handleSelectCustomer(customerId: string) {
    setSavingCustomer(true)
    const result = await updateProjectCustomer(projectId, customerId)
    setSavingCustomer(false)
    if (result.ok) {
      const picked = customerOptions.find(c => c.id === customerId)
      setHubData(prev => prev ? { ...prev, project: { ...prev.project, customer_id: customerId, customer: picked ? { id: picked.id, name: picked.name, company: picked.company } : prev.project.customer } } : prev)
      setCustomerPickerOpen(false)
      setCustomerSearch('')
    }
  }

  async function handleAssigneeToggle(taskId: string, profileId: string) {
    const profile = profiles.find(p => p.id === profileId)
    if (!profile) return
    setHubData(prev => {
      if (!prev) return prev
      return {
        ...prev,
        tasks: prev.tasks.map(t => {
          if (t.id !== taskId) return t
          const isAssigned = t.assignees.some(a => a.id === profileId)
          const newAssignees = isAssigned
            ? t.assignees.filter(a => a.id !== profileId)
            : [...t.assignees, { id: profile.id, name: profile.name, email: profile.email }]
          return { ...t, assignees: newAssignees }
        }),
      }
    })
    await toggleTaskAssignee(taskId, profileId)
  }

  async function handleMarkAsLost() {
    if (!lostReason) return
    setMarkingLost(true)
    const { error } = await markAsLost(
      projectId,
      lostReason,
      lostNotes.trim() || null,
      project.pipeline_stage,
    )
    if (error) {
      alert('Noe gikk galt. Prøv igjen.')
      setMarkingLost(false)
      return
    }
    window.location.href = '/admin/projects'
  }

  async function loadContract() {
    setLoadingContract(true)
    const data = await getProjectContractData(projectId)
    setContractText(data.contractText)
    setContractIsPublished(data.isPublished)
    setContractSignature(data.signature)
    setContractPdfUrl(data.pdfUrl)
    setContractHasText(data.hasContractText)
    setContractAutoVars(data.autoVars)
    const loadedForm = {
      orgNummer: data.formDefaults.orgNummer,
      produksjonsPeriode: data.formDefaults.produksjonsPeriode,
      signeringsSted: data.formDefaults.signeringsSted,
      signeringsDato: data.formDefaults.signeringsDato,
      bedrift: data.formDefaults.bedrift,
      kundeKontakt: data.formDefaults.kundeKontakt,
      oppstartDato: data.formDefaults.oppstartDato,
      opptakDatoer: data.formDefaults.opptakDatoer,
      leveranse: data.formDefaults.leveranse,
      totalpris: data.formDefaults.totalpris,
      reiseDekkesAv: data.formDefaults.reiseDekkesAv,
      antallCrew: data.formDefaults.antallCrew,
    }
    setContractForm(loadedForm)
    // data.formDefaults kommer fra samme lagrede rad som data.contractText (begge satt sammen
    // i publishContract), så de er garantert i sync akkurat nå ved innlasting.
    setLastGeneratedFormFields(toContractFormFields(loadedForm))
    setContractFormOpen(!data.hasContractText)
    setContractOurSignature(data.ourSignature)
    setMySignatureImage(data.mySignatureImage)
    setMyName(data.myName)
    setLoadingContract(false)
  }

  async function handleUnsignContract() {
    if (!confirm('Angre signeringen? Kontrakten åpnes for redigering og kunden må signere på nytt — signaturen og den signerte PDF-en beholdes som historikk til det skjer.')) {
      return
    }
    setUnsigningContract(true)
    try {
      await unsignContract(projectId)
      await loadContract()
    } catch (error) {
      alert('Kunne ikke angre signeringen: ' + (error instanceof Error ? error.message : 'Ukjent feil'))
    } finally {
      setUnsigningContract(false)
    }
  }

  function toContractFormFields(form: typeof contractForm): ContractFormFields {
    return {
      orgNummerOverride: form.orgNummer || undefined,
      produksjonsPeriode: form.produksjonsPeriode || undefined,
      signeringsSted: form.signeringsSted || undefined,
      signeringsDato: form.signeringsDato || undefined,
      bedriftOverride: form.bedrift || undefined,
      kundeKontaktOverride: form.kundeKontakt || undefined,
      oppstartDatoOverride: form.oppstartDato || undefined,
      opptakDatoerOverride: form.opptakDatoer || undefined,
      leveranseOverride: form.leveranse || undefined,
      totalprisOverride: form.totalpris || undefined,
      reiseDekkesAv: form.reiseDekkesAv,
      antallCrewOverride: form.antallCrew || undefined,
    }
  }

  async function handleGenerateContract() {
    const hasExistingText = contractText.trim().length > 0
    if (hasExistingText && !confirm('Dette bygger kontraktteksten på nytt fra mal og felt, og overskriver eventuelle manuelle endringer i teksten under. Fortsette?')) {
      return
    }
    setGeneratingContract(true)
    try {
      const formFields = toContractFormFields(contractForm)
      const text = await generateContractText(projectId, formFields)
      setContractText(text)
      setLastGeneratedFormFields(formFields)
      setContractSaved(false)
      setContractFormOpen(false)
    } finally {
      setGeneratingContract(false)
    }
  }

  async function doPublishContract(newSignature?: { signatureImage: string; saveToProfile: boolean }) {
    const formFields = toContractFormFields(contractForm)
    // Feltene kan være endret siden kontraktteksten sist ble generert (f.eks. org.nummer eller
    // signeringssted redigert uten å trykke "Regenerer kontrakt" etterpå) — uten dette varselet
    // publiseres da en tekst som ikke stemmer med de nye feltverdiene, selv om feltene i seg selv
    // lagres riktig (feedback 2702e25d).
    const fieldsChangedSinceGenerate =
      lastGeneratedFormFields !== null &&
      JSON.stringify(formFields) !== JSON.stringify(lastGeneratedFormFields)
    if (fieldsChangedSinceGenerate) {
      const proceed = confirm(
        'Feltene (org.nummer, produksjonsperiode, e.l.) er endret siden kontraktteksten sist ble generert — den publiserte teksten vil derfor ikke ta med de nye verdiene.\n\nTrykk Avbryt, gå til "Rediger felt" og trykk "Regenerer kontrakt" først. Eller trykk OK for å publisere gjeldende tekst som den er.'
      )
      if (!proceed) return
    }
    setPublishingContract(true)
    await publishContract(projectId, contractText, formFields, newSignature)
    setLastGeneratedFormFields(formFields)
    setContractHasText(true)
    setContractIsPublished(true)
    setStepperContractPublished(true)
    setContractSaved(true)
    setPublishingContract(false)
  }

  async function handleDownloadContractPdf() {
    setDownloadingContractPdf(true)
    try {
      const response = await fetch('/api/contracts/download-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Kunne ikke laste ned kontrakt')
      }
      const blob = await response.blob()
      const contentDisposition = response.headers.get('Content-Disposition')
      const match = contentDisposition?.match(/filename="(.+)"/)
      const filename = match?.[1] || `Produksjonsavtale_${project?.title || 'Prosjekt'}.pdf`
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (error) {
      alert('Kunne ikke laste ned kontrakt: ' + (error instanceof Error ? error.message : 'Ukjent feil'))
    } finally {
      setDownloadingContractPdf(false)
    }
  }

  function handlePublishClick() {
    if (!contractOurSignature) {
      setSignModalRedraw(!mySignatureImage)
      setSaveSignatureToProfile(true)
      setSignModalOpen(true)
      return
    }
    doPublishContract()
  }

  async function handleConfirmSignAndPublish() {
    const signatureImage = signModalRedraw ? sigCanvasRef.current?.getDataUrl() ?? null : mySignatureImage
    if (!signatureImage) return
    setSigningAndPublishing(true)
    try {
      await doPublishContract({ signatureImage, saveToProfile: signModalRedraw ? saveSignatureToProfile : false })
      setContractOurSignature({ profileId: '', signerName: myName, signatureImage, signedAt: new Date().toISOString() })
      setSignModalOpen(false)
    } finally {
      setSigningAndPublishing(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'kontrakt') loadContract()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, projectId])

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

  useEffect(() => {
    if (!customerPickerOpen) return
    function handleClick(e: MouseEvent) {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target as Node)) {
        setCustomerPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [customerPickerOpen])

  async function handleSetLead(profileId: string | null) {
    const prev = projectLead
    const profile = profileId ? profiles.find(p => p.id === profileId) ?? null : null
    setProjectLead_(profile)
    const result = await setProjectLead(projectId, profileId)
    if (!result.ok) setProjectLead_(prev)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>Laster prosjekt...</p>
      </div>
    )
  }

  if (error || !hubData) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, marginBottom: 16 }}>{error ?? 'Noe gikk galt'}</p>
          <button onClick={() => router.push('/admin/pipeline')} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, padding: '6px 14px', borderRadius: 6, cursor: 'pointer', background: C.surface2, color: C.text2, border: `1px solid ${C.border}` }}>
            ← Pipeline
          </button>
        </div>
      </div>
    )
  }

  const { project, tasks, quote, pitchToken, hasSections } = hubData
  const currentStageLabel = PIPELINE_STAGES.find(s => s.value === project.pipeline_stage)?.label ?? project.pipeline_stage
  const TABS: { id: ActiveTab; label: string }[] = [
    { id: 'oversikt', label: 'Oversikt' },
    { id: 'pitch',    label: 'Pitch & Tilbud' },
    { id: 'kontrakt', label: 'Kontrakt' },
  ]

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh' }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 24px 48px' }}>

        {/* Header */}
        <div style={{ marginBottom: 28, paddingBottom: 24, borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
            <div>
              {titleEdit ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                  <input
                    autoFocus
                    value={titleValue}
                    onChange={e => setTitleValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveTitle(); if (e.key === 'Escape') setTitleEdit(false) }}
                    style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.3rem', fontWeight: 600, color: C.text, background: C.surface2, border: `1px solid ${C.accent}`, borderRadius: 6, padding: '4px 8px', outline: 'none', minWidth: 240 }}
                  />
                  <button onClick={handleSaveTitle} disabled={savingTitle} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, padding: '5px 12px', borderRadius: 6, background: C.accent, color: '#fff', border: 'none', cursor: 'pointer', opacity: savingTitle ? 0.6 : 1 }}>
                    {savingTitle ? '...' : 'Lagre'}
                  </button>
                  <button onClick={() => setTitleEdit(false)} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, background: 'none', border: `1px solid ${C.border}`, padding: '5px 10px', borderRadius: 6, cursor: 'pointer' }}>
                    Avbryt
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.5rem', fontWeight: 600, color: C.text, lineHeight: 1.2 }}>
                    {project.title}
                  </h1>
                  <button
                    onClick={() => { setTitleValue(project.title); setTitleEdit(true) }}
                    title="Endre prosjektnavn"
                    style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, background: 'none', border: `1px solid ${C.border}`, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }}
                  >
                    Rediger
                  </button>
                </div>
              )}

              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }} ref={customerDropdownRef}>
                {project.customer && (
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>
                    {project.customer.name}{project.customer.company ? ` — ${project.customer.company}` : ''}
                  </p>
                )}
                <button
                  onClick={handleOpenCustomerPicker}
                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, background: 'none', border: `1px solid ${C.border}`, padding: '2px 7px', borderRadius: 4, cursor: 'pointer' }}
                >
                  Bytt kunde
                </button>
                {project.customer && (
                  <Link href={`/admin/customers/${project.customer.id}/edit`} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, textDecoration: 'underline' }}>
                    Rediger kontaktinfo →
                  </Link>
                )}

                {customerPickerOpen && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 5px)', left: 0, zIndex: 150,
                    background: C.surface2, border: `1px solid ${C.border}`,
                    borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    minWidth: 240, maxHeight: 280, overflowY: 'auto', padding: '4px 0',
                  }}>
                    <div style={{ padding: '6px 10px' }}>
                      <input
                        autoFocus
                        value={customerSearch}
                        onChange={e => setCustomerSearch(e.target.value)}
                        placeholder="Søk kunde..."
                        style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: '5px 8px', outline: 'none' }}
                      />
                    </div>
                    {customerOptions
                      .filter(c => `${c.name} ${c.company ?? ''}`.toLowerCase().includes(customerSearch.toLowerCase()))
                      .map(c => (
                        <button
                          key={c.id}
                          onClick={() => handleSelectCustomer(c.id)}
                          disabled={savingCustomer}
                          style={{
                            width: '100%', textAlign: 'left',
                            fontFamily: 'var(--font-dm-sans)', fontSize: '0.73rem',
                            color: c.id === project.customer_id ? C.accent : C.text,
                            background: 'none', border: 'none',
                            padding: '7px 14px', cursor: 'pointer',
                          }}
                          onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = C.bg}
                          onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'none'}
                        >
                          {c.name}{c.company ? ` — ${c.company}` : ''}
                          {c.id === project.customer_id && <span style={{ marginLeft: 8, color: C.accent }}>✓</span>}
                        </button>
                      ))}
                    {customerOptions.length === 0 && (
                      <p style={{ padding: '10px 14px', fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>Laster...</p>
                    )}
                  </div>
                )}
              </div>
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
                      {(profiles as { id: string; name: string | null; email: string }[]).map(p => (
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
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={() => setShowLostModal(true)}
                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: 'transparent', color: C.danger, border: `1px solid ${C.danger}`, flexShrink: 0, opacity: 0.7 }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.7' }}
              >
                Marker som tapt
              </button>
              <Link href={`/admin/projects/${projectId}/edit`}>
                <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: C.surface2, color: C.text2, border: `1px solid ${C.border}`, flexShrink: 0 }}>
                  Rediger →
                </button>
              </Link>
            </div>
          </div>
          <PipelineProgress currentStage={project.pipeline_stage} />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: `1px solid ${C.border}`, marginBottom: 24, gap: 0 }}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.75rem',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? C.text : C.text3,
                  background: 'none',
                  border: 'none',
                  borderBottom: `2px solid ${isActive ? C.accent : 'transparent'}`,
                  padding: '10px 16px',
                  cursor: 'pointer',
                  marginBottom: -1,
                  transition: 'color 0.12s',
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Tab content */}
        {activeTab === 'oversikt' && (
          <div>
            {/* Leveranse */}
            <div style={{ marginBottom: 24, padding: '14px 18px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: deliveryEdit ? 10 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.text3, flexShrink: 0 }}>Leveres</span>
                  {!deliveryEdit && (
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: project.delivery_description ? C.text : C.text3, fontStyle: project.delivery_description ? 'normal' : 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {project.delivery_description || 'Ikke satt — legg til i tilbud eller her'}
                    </span>
                  )}
                </div>
                {!deliveryEdit && (
                  <button onClick={() => setDeliveryEdit(true)} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, background: 'none', border: `1px solid ${C.border}`, padding: '2px 8px', borderRadius: 4, cursor: 'pointer', flexShrink: 0, marginLeft: 8 }}>
                    Rediger
                  </button>
                )}
              </div>
              {deliveryEdit && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    autoFocus
                    value={deliveryValue}
                    onChange={e => setDeliveryValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveDelivery() }}
                    placeholder="F.eks. 2 kampanjefilmer á 90 sek + 30 produktbilder"
                    style={{ flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text, background: C.surface2, border: `1px solid ${C.accent}`, borderRadius: 6, padding: '6px 10px', outline: 'none' }}
                  />
                  <button onClick={handleSaveDelivery} disabled={savingDelivery} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, padding: '5px 12px', borderRadius: 6, background: C.accent, color: '#fff', border: 'none', cursor: 'pointer', opacity: savingDelivery ? 0.6 : 1 }}>
                    {savingDelivery ? '...' : 'Lagre'}
                  </button>
                  <button onClick={() => { setDeliveryEdit(false); setDeliveryValue(project.delivery_description ?? '') }} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, background: 'none', border: `1px solid ${C.border}`, padding: '5px 10px', borderRadius: 6, cursor: 'pointer' }}>
                    Avbryt
                  </button>
                </div>
              )}
            </div>

            {/* Opptaksdatoer */}
            <div style={{ marginBottom: 24, padding: '14px 18px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: shootEdit ? 10 : 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.text3, flexShrink: 0 }}>🎬 Opptak</span>
                  {!shootEdit && (
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: shootStart ? C.text : C.text3, fontStyle: shootStart ? 'normal' : 'italic' }}>
                      {shootStart
                        ? shootEnd && shootEnd !== shootStart
                          ? `${new Date(shootStart + 'T12:00:00').toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })} – ${new Date(shootEnd + 'T12:00:00').toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' })}`
                          : new Date(shootStart + 'T12:00:00').toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })
                        : 'Ikke satt'}
                    </span>
                  )}
                  {!shootEdit && shootStart && (
                    <span style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600,
                      color: (contractSigned || shootConfirmedManually) ? '#4CAF7D' : '#F0A500',
                      background: (contractSigned || shootConfirmedManually) ? 'rgba(76,175,125,0.12)' : 'rgba(240,165,0,0.12)',
                      border: `1px solid ${(contractSigned || shootConfirmedManually) ? 'rgba(76,175,125,0.35)' : 'rgba(240,165,0,0.35)'}`,
                      borderRadius: 4, padding: '2px 7px', flexShrink: 0,
                    }}>
                      {contractSigned ? 'Bekreftet — kontrakt signert' : shootConfirmedManually ? 'Bekreftet manuelt' : 'Ikke bekreftet'}
                    </span>
                  )}
                </div>
                {!shootEdit && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                    {shootStart && !contractSigned && !shootConfirmedManually && (
                      <button onClick={handleConfirmShoot} disabled={confirmingShoot} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 500, color: '#4CAF7D', background: 'rgba(76,175,125,0.1)', border: '1px solid rgba(76,175,125,0.35)', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', opacity: confirmingShoot ? 0.6 : 1 }}>
                        {confirmingShoot ? '...' : 'Bekreft manuelt'}
                      </button>
                    )}
                    <button onClick={() => setShootEdit(true)} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, background: 'none', border: `1px solid ${C.border}`, padding: '2px 8px', borderRadius: 4, cursor: 'pointer' }}>
                      Sett dato
                    </button>
                  </div>
                )}
              </div>
              {shootEdit && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div>
                    <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600, color: C.text3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Fra</label>
                    <input autoFocus type="date" value={shootStart} onChange={e => setShootStart(e.target.value)}
                      style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text, background: C.surface2, border: `1px solid ${C.accent}`, borderRadius: 6, padding: '6px 10px', outline: 'none' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', fontWeight: 600, color: C.text3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Til</label>
                    <input type="date" value={shootEnd} onChange={e => setShootEnd(e.target.value)}
                      style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '6px 10px', outline: 'none' }}
                      onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
                      onBlur={e => { e.currentTarget.style.borderColor = C.border }} />
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={handleSaveShootDates} disabled={savingShoot} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 500, padding: '7px 14px', borderRadius: 6, background: C.accent, color: '#fff', border: 'none', cursor: 'pointer', opacity: savingShoot ? 0.6 : 1 }}>
                      {savingShoot ? '...' : 'Lagre'}
                    </button>
                    <button onClick={() => setShootEdit(false)} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, background: 'none', border: `1px solid ${C.border}`, padding: '7px 12px', borderRadius: 6, cursor: 'pointer' }}>
                      Avbryt
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Kontakt-informasjon */}
            <div style={{ marginBottom: 24, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 500, color: C.text, marginBottom: 3 }}>Kontaktinformasjon</p>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>Lead-profil, salgspunkter og kald e-post</p>
              </div>
              <Link href={`/admin/projects/${projectId}/contact`}>
                <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: C.surface2, color: C.text2, border: `1px solid ${C.border}` }}>
                  Åpne →
                </button>
              </Link>
            </div>

            {/* Møtenotater / e-posttråd */}
            <div style={{ marginBottom: 24, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.text3 }}>
                  Bakgrunn / e-posttråd
                </span>
                {notesSaved && !analyzing && (
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.success }}>Lagret</span>
                )}
              </div>
              <div style={{ padding: '14px 18px' }}>
                <textarea
                  value={notesValue}
                  onChange={e => handleNotesChange(e.target.value)}
                  placeholder="Lim inn e-posttråd, møtenotater eller annen bakgrunnsinformasjon om prosjektet her..."
                  rows={6}
                  style={{
                    width: '100%', boxSizing: 'border-box', resize: 'vertical',
                    fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text,
                    background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6,
                    padding: '10px 12px', outline: 'none', lineHeight: 1.6,
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
                  onBlur={e => { e.currentTarget.style.borderColor = C.border }}
                />
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    onClick={handleAnalyze}
                    disabled={analyzing || !notesValue.trim()}
                    style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600,
                      padding: '6px 16px', borderRadius: 6, cursor: notesValue.trim() ? 'pointer' : 'not-allowed',
                      background: notesValue.trim() ? C.accent : C.surface2,
                      color: notesValue.trim() ? '#fff' : C.text3, border: 'none',
                      opacity: analyzing ? 0.7 : 1, transition: 'background 0.15s',
                    }}
                  >
                    {analyzing ? 'Analyserer...' : summary?.sammendrag ? 'Analyser på nytt' : 'Analyser med AI'}
                  </button>
                  {analyzing && (
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>Claude leser notater...</span>
                  )}
                </div>

                {/* AI-oppsummering — kort, lettlest tekst så andre i teamet raskt forstår prosjektet */}
                {summary?.sammendrag && (
                  <div style={{ marginTop: 16, padding: '14px 16px', background: C.surface2, borderRadius: 7, border: `1px solid ${C.border}` }}>
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.accent }}>
                      AI-oppsummering
                    </span>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text, marginTop: 10, lineHeight: 1.6 }}>
                      {summary.sammendrag}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {project.pipeline_stage === 'tilbud_sendt' ? (
              <div>
                <h3 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 16 }}>
                  Sende tilbud
                </h3>
                <TilbudStepper
                  projectId={projectId}
                  hasSections={hasSections}
                  quote={quote}
                  notesValue={notesValue}
                  customerId={project.customer_id ?? null}
                  projectTitle={project.title}
                  isContractPublished={stepperContractPublished}
                />
              </div>
            ) : project.pipeline_stage === 'kontrakt' ? (
              <div style={{ marginTop: 8 }}>
                {(project.pipeline_data as { contract_unsigned_proceed?: boolean } | null)?.contract_unsigned_proceed && (
                  <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 6, background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.3)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F0A500" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: '#F0A500' }}>
                      Advarsel: prosjektet ble manuelt flyttet uten signert kontrakt.
                    </p>
                  </div>
                )}
                <h3 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 18 }}>
                  Kontrakt
                </h3>
                <KontraktStageView project={project} pitchToken={pitchToken} />
              </div>
            ) : (
              <>
                {deepLinkTaskId && !deepLinkNoticeDismissed && !tasks.some(t => t.id === deepLinkTaskId) && (
                  <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 6, background: 'rgba(124,92,252,0.08)', border: '1px solid rgba(124,92,252,0.3)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                    <p style={{ flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.accent }}>
                      Oppgaven fra varselet tilhører et tidligere steg og vises ikke lenger her.
                    </p>
                    <button
                      onClick={() => setDeepLinkNoticeDismissed(true)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.accent, padding: 2, lineHeight: 0, flexShrink: 0 }}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l8 8M10 2L2 10" /></svg>
                    </button>
                  </div>
                )}
                <h3 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                  Oppgaver — {currentStageLabel}
                </h3>
                <TaskChecklist
                  tasks={tasks}
                  profiles={profiles}
                  onToggle={handleTaskToggle}
                  onAssigneeToggle={handleAssigneeToggle}
                  togglingId={togglingTaskId}
                  hasSections={hasSections}
                  quote={quote}
                  currentUserId={currentUserId}
                  messageCounts={messageCounts}
                  deepLinkTaskId={deepLinkTaskId}
                />
                {project.pipeline_stage === 'post_prod' && (
                  <div style={{ marginTop: 20 }}>
                    <h3 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                      Kundeseleksjon
                    </h3>
                    <Link
                      href={`/admin/projects/${projectId}/selection`}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '8px 14px', borderRadius: 7,
                        border: `1px solid ${C.border}`, background: 'none',
                        color: C.text2, fontFamily: 'var(--font-dm-sans)',
                        fontSize: '0.78rem', textDecoration: 'none',
                      }}
                    >
                      → Administrer seleksjon
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'pitch' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {!hasSections ? (
              /* Ingen pitch opprettet enda */
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '20px 18px' }}>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.88rem', fontWeight: 600, color: C.text, marginBottom: 6 }}>
                  Ingen pitch opprettet enda
                </p>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, marginBottom: 18, lineHeight: 1.6 }}>
                  Opprett en pitch med AI. Kundeinformasjon hentes automatisk fra prosjektet.
                  {notesValue.trim() && ' E-posttråden du har limt inn vil bli brukt som kontekst.'}
                </p>
                <Link href={`/admin/projects/new?customer_id=${project.customer_id ?? ''}&title=${encodeURIComponent(project.title)}&context=${encodeURIComponent(notesValue.trim())}`}>
                  <button style={{
                    fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600,
                    padding: '8px 18px', borderRadius: 7, cursor: 'pointer',
                    background: C.accent, color: '#fff', border: 'none',
                  }}>
                    Opprett pitch med AI →
                  </button>
                </Link>
              </div>
            ) : (
              /* Pitch finnes — vis vanlige lenker */
              <>
                {[
                  { title: 'Pitch-dokument', desc: 'Rediger pitchens innhold og seksjoner', href: `/admin/projects/${projectId}/edit`, btn: 'Åpne editor →' },
                  { title: 'Tilbud', desc: 'Bygg og administrer tilbudet', href: `/admin/projects/${projectId}/quote`, btn: 'Åpne tilbud →', badge: quote?.status },
                ].map(item => (
                  <div key={item.href} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 500, color: C.text }}>{item.title}</p>
                        {item.badge && (
                          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 500, color: item.badge === 'accepted' ? C.success : item.badge === 'sent' ? C.accent : C.text3, background: `${item.badge === 'accepted' ? C.success : item.badge === 'sent' ? C.accent : C.text3}18`, padding: '2px 7px', borderRadius: 4 }}>
                            {item.badge === 'draft' ? 'Utkast' : item.badge === 'sent' ? 'Sendt' : item.badge === 'accepted' ? 'Akseptert' : 'Avslått'}
                          </span>
                        )}
                      </div>
                      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>{item.desc}</p>
                    </div>
                    <Link href={item.href}>
                      <button style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: C.surface2, color: C.text2, border: `1px solid ${C.border}` }}>
                        {item.btn}
                      </button>
                    </Link>
                  </div>
                ))}
              </>
            )}

            {pitchToken && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 500, color: C.text, marginBottom: 3 }}>
                    Offentlig pitch-lenke
                  </p>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {typeof window !== 'undefined' ? `${window.location.origin}/p/${pitchToken}` : `/p/${pitchToken}`}
                  </p>
                </div>
                <a
                  href={`/p/${pitchToken}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: C.accentBg, color: C.accent, border: `1px solid rgba(124,92,252,0.25)`, flexShrink: 0, textDecoration: 'none', whiteSpace: 'nowrap' }}
                >
                  Åpne →
                </a>
              </div>
            )}
          </div>
        )}

        {activeTab === 'kontrakt' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Signert-banner — vises når signert */}
            {contractSignature && (
              <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(76,175,125,0.08)', border: '1px solid rgba(76,175,125,0.25)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600, color: C.success, marginBottom: 2 }}>
                    ✓ Signert av {contractSignature.signerName}
                  </p>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
                    {contractSignature.signerEmail} · {new Date(contractSignature.signedAt).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                  {contractPdfUrl && (
                    <a
                      href={contractPdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        fontFamily: 'var(--font-dm-sans)',
                        fontSize: '0.72rem',
                        color: C.accent,
                        textDecoration: 'none',
                        display: 'inline-block',
                        marginTop: 4,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
                      onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
                    >
                      Åpne signert kontrakt →
                    </a>
                  )}
                  <button
                    onClick={handleUnsignContract}
                    disabled={unsigningContract}
                    style={{
                      fontFamily: 'var(--font-dm-sans)',
                      fontSize: '0.72rem',
                      color: C.danger,
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      marginTop: 8,
                      cursor: unsigningContract ? 'default' : 'pointer',
                      opacity: unsigningContract ? 0.6 : 0.85,
                      display: 'block',
                      textDecoration: 'underline',
                    }}
                    onMouseEnter={e => { if (!unsigningContract) (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = unsigningContract ? '0.6' : '0.85' }}
                  >
                    {unsigningContract ? 'Angrer signering...' : 'Angre signering'}
                  </button>
                </div>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.success, background: 'rgba(76,175,125,0.1)', padding: '3px 10px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                  Bindende
                </span>
              </div>
            )}

            {/* Kontraktskjema — fyll inn felt, generer hele kontraktteksten */}
            {contractFormOpen && !loadingContract && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.text3 }}>
                    Kontraktskjema
                  </span>
                  {contractText.trim() && (
                    <button
                      type="button"
                      onClick={() => setContractFormOpen(false)}
                      style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      ← Tilbake til kontraktteksten
                    </button>
                  )}
                </div>

                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Auto-utfylt fra prosjekt/tilbud — redigerbart */}
                  {contractAutoVars && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, padding: '12px 14px', background: C.surface2, borderRadius: 6 }}>
                      {(
                        [
                          ['Bedrift', 'bedrift', contractAutoVars.bedrift],
                          ['Kundekontakt', 'kundeKontakt', contractAutoVars.kunde_kontakt],
                          ['Oppstartsdato', 'oppstartDato', contractAutoVars.oppstart_dato],
                          ['Opptaksdatoer', 'opptakDatoer', contractAutoVars.opptak_datoer],
                          ['Leveranse', 'leveranse', contractAutoVars.leveranse],
                          ['Totalpris', 'totalpris', contractAutoVars.totalpris],
                        ] as const
                      ).map(([label, field, placeholder]) => (
                        <div key={field}>
                          <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 4 }}>{label}</label>
                          <input
                            value={contractForm[field]}
                            onChange={e => setContractForm(f => ({ ...f, [field]: e.target.value }))}
                            placeholder={placeholder || '—'}
                            style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', outline: 'none' }}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Felt som må fylles inn / bekreftes */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                    <div>
                      <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text2, marginBottom: 4 }}>Org.nummer</label>
                      <input
                        value={contractForm.orgNummer}
                        onChange={e => setContractForm(f => ({ ...f, orgNummer: e.target.value }))}
                        placeholder="923 456 789"
                        style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', outline: 'none' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text2, marginBottom: 4 }}>Produksjonsperiode</label>
                      <input
                        value={contractForm.produksjonsPeriode}
                        onChange={e => setContractForm(f => ({ ...f, produksjonsPeriode: e.target.value }))}
                        placeholder="juli 2026"
                        style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', outline: 'none' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text2, marginBottom: 4 }}>Signeringssted</label>
                      <input
                        value={contractForm.signeringsSted}
                        onChange={e => setContractForm(f => ({ ...f, signeringsSted: e.target.value }))}
                        placeholder="Asker"
                        style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', outline: 'none' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text2, marginBottom: 4 }}>Signeringsdato</label>
                      <input
                        type="date"
                        value={contractForm.signeringsDato}
                        onChange={e => setContractForm(f => ({ ...f, signeringsDato: e.target.value }))}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', outline: 'none' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text2, marginBottom: 4 }}>Antall crew (§5.1)</label>
                      <input
                        value={contractForm.antallCrew}
                        onChange={e => setContractForm(f => ({ ...f, antallCrew: e.target.value }))}
                        placeholder="Auto-utfylt fra pristilbud"
                        style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', outline: 'none' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text2, marginBottom: 4 }}>Reise/kost/losji dekkes av</label>
                      <select
                        value={contractForm.reiseDekkesAv}
                        onChange={e => setContractForm(f => ({ ...f, reiseDekkesAv: e.target.value as 'oppdragsgiver' | 'oppdragstaker' }))}
                        style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', outline: 'none' }}
                      >
                        <option value="oppdragsgiver">Oppdragsgiver (kunden)</option>
                        <option value="oppdragstaker">Oppdragstaker (Leafilms)</option>
                      </select>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerateContract}
                    disabled={generatingContract}
                    style={{
                      alignSelf: 'flex-start', fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', fontWeight: 600,
                      padding: '10px 20px', borderRadius: 8, cursor: generatingContract ? 'not-allowed' : 'pointer',
                      background: generatingContract ? C.surface2 : C.accent, color: generatingContract ? C.text3 : '#fff',
                      border: 'none', transition: 'background 0.15s',
                    }}
                  >
                    {generatingContract ? 'Genererer...' : contractText.trim() ? 'Regenerer kontrakt' : 'Generer kontrakt'}
                  </button>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, fontStyle: 'italic', margin: 0 }}>
                    Feltene over lagres først når du trykker Publiser (se under) — «{contractText.trim() ? 'Regenerer' : 'Generer'} kontrakt» bygger kun en forhåndsvisning.
                  </p>
                </div>
              </div>
            )}

            {/* Kontrakttekst-editor */}
            {!contractFormOpen && (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.text3 }}>
                    Kontrakttekst
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {contractSaved && <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.success }}>Publisert ✓</span>}
                    {contractOurSignature && (
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3 }}>
                        Signert av {contractOurSignature.signerName} for Leafilms
                      </span>
                    )}
                    {contractIsPublished && !contractSignature && (
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 500, color: C.accent, background: 'rgba(124,92,252,0.1)', padding: '2px 8px', borderRadius: 4 }}>
                        Publisert — venter på signering
                      </span>
                    )}
                    {!loadingContract && (
                      <button
                        type="button"
                        onClick={() => setContractFormOpen(true)}
                        style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.accent, background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        Rediger felt →
                      </button>
                    )}
                  </div>
                </div>
                {loadingContract ? (
                  <div style={{ padding: '32px', textAlign: 'center' }}>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>Laster kontrakt...</p>
                  </div>
                ) : (
                  <textarea
                    value={contractText}
                    onChange={e => { setContractText(e.target.value); setContractSaved(false) }}
                    rows={24}
                    style={{
                      width: '100%', boxSizing: 'border-box', resize: 'vertical',
                      fontFamily: 'monospace', fontSize: '0.78rem', color: C.text,
                      background: C.surface2, border: 'none', borderRadius: 0,
                      padding: '16px', outline: 'none', lineHeight: 1.7,
                    }}
                  />
                )}
              </div>
            )}

            {/* Publish / fjern-knapper */}
            {!contractSignature && !contractFormOpen && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handlePublishClick}
                  disabled={publishingContract || loadingContract || !contractText.trim()}
                  style={{
                    flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600,
                    padding: '12px', borderRadius: 8, cursor: 'pointer',
                    background: contractText.trim() && !publishingContract ? C.accent : C.surface2,
                    color: contractText.trim() && !publishingContract ? '#fff' : C.text3,
                    border: 'none', transition: 'background 0.15s',
                  }}
                >
                  {publishingContract ? 'Publiserer...' : contractIsPublished ? 'Oppdater kontrakt' : 'Publiser kontrakt til kunde'}
                </button>
                {contractIsPublished && (
                  <button
                    onClick={async () => {
                      if (!confirm('Fjerne publiseringen av kontrakten?')) return
                      await unpublishContract(projectId)
                      setContractIsPublished(false)
                      setStepperContractPublished(false)
                      setContractSaved(false)
                    }}
                    style={{
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 500,
                      padding: '12px 16px', borderRadius: 8, cursor: 'pointer',
                      background: 'none', color: C.danger, border: `1px solid ${C.danger}`,
                      opacity: 0.7, transition: 'opacity 0.12s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.7' }}
                  >
                    Fjern
                  </button>
                )}
              </div>
            )}

            {/* Last ned PDF — tilgjengelig så snart det finnes kontrakttekst, uansett
                publiserings-/signeringsstatus, slik at vi kan se nøyaktig hva kunden ser. */}
            {contractText.trim() && !contractFormOpen && (
              <button
                onClick={handleDownloadContractPdf}
                disabled={downloadingContractPdf}
                style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 500,
                  padding: '10px 16px', borderRadius: 8, cursor: downloadingContractPdf ? 'default' : 'pointer',
                  background: 'none', color: C.text2, border: `1px solid ${C.border}`,
                  opacity: downloadingContractPdf ? 0.6 : 1, alignSelf: 'flex-start',
                }}
              >
                {downloadingContractPdf ? 'Genererer PDF...' : 'Last ned kontrakt (PDF) ↓'}
              </button>
            )}

            {/* Lenke til mal-redigering */}
            <Link href="/admin/contracts/template" style={{ textDecoration: 'none' }}>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>
                Rediger global kontraktmal →
              </span>
            </Link>

            {/* E-post shortcut */}
            <Link href={`/admin/projects/${projectId}/email`} style={{ textDecoration: 'none' }}>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', transition: 'border-color 0.12s' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = '#3D3D4E'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = C.border}
              >
                <div>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 500, color: C.text, marginBottom: 3 }}>Send kontrakt-epost</p>
                  <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>Følg opp eller send bekreftelse til kunden</p>
                </div>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.accent }}>E-post →</span>
              </div>
            </Link>

          </div>
        )}

        {/* Bekreft signering-modal — vises før første publisering av en kontrakt */}
        {signModalOpen && (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }}
            onClick={e => { if (e.target === e.currentTarget && !signingAndPublishing) setSignModalOpen(false) }}
          >
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '28px 28px 24px', width: '100%', maxWidth: 460, margin: '0 16px' }}>
              <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', fontWeight: 600, color: C.text, marginBottom: 6 }}>
                Bekreft signering
              </h2>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, marginBottom: 20 }}>
                Du signerer denne kontrakten for Leafilms før den sendes til kunden.
              </p>

              {!signModalRedraw && mySignatureImage ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                  <div style={{ padding: '14px 16px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, display: 'flex', alignItems: 'center', gap: 14 }}>
                    <img src={mySignatureImage} alt={`Signatur — ${myName}`} style={{ height: 40, width: 'auto', maxWidth: 140, objectFit: 'contain' }} />
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text2 }}>{myName}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSignModalRedraw(true)}
                    style={{ alignSelf: 'flex-start', fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.accent, background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Ikke deg? Tegn på nytt →
                  </button>
                </div>
              ) : (
                <div style={{ marginBottom: 20 }}>
                  {!mySignatureImage && (
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, marginBottom: 10 }}>
                      Du har ingen lagret signatur ennå.
                    </p>
                  )}
                  <SignatureCanvas
                    ref={sigCanvasRef}
                    onChange={setSigCanvasHasSigned}
                    background={C.surface2}
                    borderColor={C.border}
                    activeBorderColor={C.accent}
                    strokeColor={C.text}
                    placeholderColor={C.text3}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={saveSignatureToProfile}
                      onChange={e => setSaveSignatureToProfile(e.target.checked)}
                      style={{ accentColor: C.accent }}
                    />
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text2 }}>Lagre til neste gang</span>
                  </label>
                  {mySignatureImage && (
                    <button
                      type="button"
                      onClick={() => setSignModalRedraw(false)}
                      style={{ display: 'block', marginTop: 8, fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      ← Bruk lagret signatur
                    </button>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleConfirmSignAndPublish}
                  disabled={signingAndPublishing || (signModalRedraw ? !sigCanvasHasSigned : !mySignatureImage)}
                  style={{
                    flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600,
                    padding: '10px', borderRadius: 8, cursor: 'pointer',
                    background: signingAndPublishing ? C.surface2 : C.accent,
                    color: signingAndPublishing ? C.text3 : '#fff',
                    border: 'none', transition: 'background 0.15s',
                  }}
                >
                  {signingAndPublishing ? 'Signerer...' : 'Signer og publiser'}
                </button>
                <button
                  type="button"
                  onClick={() => setSignModalOpen(false)}
                  disabled={signingAndPublishing}
                  style={{
                    fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 500,
                    padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
                    background: 'none', color: C.text3, border: `1px solid ${C.border}`,
                  }}
                >
                  Avbryt
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lost modal */}
        {showLostModal && (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)' }}
            onClick={e => { if (e.target === e.currentTarget) setShowLostModal(false) }}
          >
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '28px 28px 24px', width: '100%', maxWidth: 440, margin: '0 16px' }}>
              <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', fontWeight: 600, color: C.text, marginBottom: 6 }}>
                Marker prosjekt som tapt
              </h2>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, marginBottom: 20 }}>
                {project.title}
              </p>

              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 10 }}>
                Årsak
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20 }}>
                {(Object.entries(LOST_REASON_LABELS) as [LostReason, string][]).map(([value, label]) => (
                  <label
                    key={value}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 6, border: `1px solid ${lostReason === value ? 'rgba(224,85,85,0.4)' : C.border}`, background: lostReason === value ? 'rgba(224,85,85,0.08)' : C.surface2, cursor: 'pointer' }}
                  >
                    <input
                      type="radio"
                      name="lost_reason"
                      value={value}
                      checked={lostReason === value}
                      onChange={() => setLostReason(value)}
                      style={{ accentColor: C.danger }}
                    />
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: lostReason === value ? '#E8A0A0' : C.text2 }}>
                      {label}
                    </span>
                  </label>
                ))}
              </div>

              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 8 }}>
                Notater (valgfritt)
              </p>
              <textarea
                value={lostNotes}
                onChange={e => setLostNotes(e.target.value)}
                placeholder="Hva vet vi om hvorfor dette ikke gikk gjennom?"
                rows={3}
                style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '8px 10px', outline: 'none', resize: 'vertical', marginBottom: 20 }}
                onFocus={e => { e.currentTarget.style.borderColor = C.danger }}
                onBlur={e => { e.currentTarget.style.borderColor = C.border }}
              />

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setShowLostModal(false); setLostReason(null); setLostNotes('') }}
                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, background: 'none', border: `1px solid ${C.border}`, padding: '7px 14px', borderRadius: 6, cursor: 'pointer' }}
                >
                  Avbryt
                </button>
                <button
                  onClick={handleMarkAsLost}
                  disabled={!lostReason || markingLost}
                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600, padding: '7px 16px', borderRadius: 6, background: lostReason ? C.danger : C.surface2, color: lostReason ? '#fff' : C.text3, border: 'none', cursor: lostReason ? 'pointer' : 'not-allowed', opacity: markingLost ? 0.6 : 1 }}
                >
                  {markingLost ? 'Lagrer...' : 'Marker som tapt'}
                </button>
              </div>
            </div>
          </div>
        )}

        <ProjectChat projectId={projectId} forceOpen={forceOpenChat} />
      </div>
    </div>
  )
}

