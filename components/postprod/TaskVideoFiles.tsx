'use client'

import { useEffect, useState, useRef } from 'react'
import {
  initiateTaskFileUpload, completeTaskFileUpload, listTaskVideoFiles,
  sendTaskFileToCustomer, getLatestVideoReviewForFile,
  requestTaskFileReview, getLatestTaskFileReview,
} from '@/lib/actions/task-video-files'
import type { TaskVideoFile, TaskFileReview } from '@/lib/actions/task-video-files'
import { abortUpload } from '@/lib/actions/transfers'
import { uploadFileToR2 } from '@/lib/r2-upload-client'
import { getAllProfiles } from '@/lib/actions/pipeline'
import { formatFileSize } from '@/lib/utils/file-size'
import { TaskVideoFilePreview } from './TaskVideoFilePreview'
import { C } from '@/lib/admin-theme'

type Profile = { id: string; name: string | null; email: string; color: string | null; phone: string | null }

type UploadState =
  | { phase: 'idle' }
  | { phase: 'uploading'; filename: string; progress: number }
  | { phase: 'error'; message: string }

// Grupperer den flate fil-listen i versjonskjeder: nyeste versjon øverst,
// eldre versjoner i historikk under (spec §Datamodell — replaces_file_id).
function buildChains(files: TaskVideoFile[]): TaskVideoFile[][] {
  const byId = new Map(files.map(f => [f.id, f]))
  const superseded = new Set(files.map(f => f.replaces_file_id).filter((id): id is string => !!id))
  const latestFiles = files.filter(f => !superseded.has(f.id))

  return latestFiles
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(latest => {
      const chain: TaskVideoFile[] = [latest]
      let current = latest
      while (current.replaces_file_id) {
        const prev = byId.get(current.replaces_file_id)
        if (!prev) break
        chain.push(prev)
        current = prev
      }
      return chain
    })
}

export function TaskVideoFiles({
  taskId, projectId, taskTitle, readOnly,
}: {
  taskId: string
  projectId: string
  taskTitle: string
  readOnly: boolean
}) {
  const [files, setFiles] = useState<TaskVideoFile[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadState, setUploadState] = useState<UploadState>({ phase: 'idle' })
  const [replacesFileId, setReplacesFileId] = useState<string | null>(null)
  const [expandedFileId, setExpandedFileId] = useState<string | null>(null)
  const [showHistoryFor, setShowHistoryFor] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function refresh() {
    setFiles(await listTaskVideoFiles(taskId))
    setLoading(false)
  }

  useEffect(() => { refresh() }, [taskId])

  async function handleFileSelected(file: File, asReplacesId: string | null) {
    setUploadState({ phase: 'uploading', filename: file.name, progress: 0 })
    let uploadKey: string | undefined
    let uploadId: string | undefined

    try {
      const initResult = await initiateTaskFileUpload({ taskId, filename: file.name, contentType: file.type || undefined })
      if ('error' in initResult) {
        setUploadState({ phase: 'error', message: initResult.error })
        return
      }
      uploadKey = initResult.key
      uploadId = initResult.uploadId

      const parts = await uploadFileToR2(file, initResult.key, initResult.uploadId, initResult.partSize, (pct) => {
        setUploadState({ phase: 'uploading', filename: file.name, progress: pct })
      })

      const result = await completeTaskFileUpload({
        taskId,
        projectId,
        key: initResult.key,
        uploadId: initResult.uploadId,
        parts,
        filename: file.name,
        sizeBytes: file.size,
        contentType: file.type || undefined,
        replacesFileId: asReplacesId ?? undefined,
      })

      if ('error' in result) {
        abortUpload({ key: initResult.key, uploadId: initResult.uploadId }).catch(() => {})
        setUploadState({ phase: 'error', message: result.error })
        return
      }

      setUploadState({ phase: 'idle' })
      setReplacesFileId(null)
      await refresh()
    } catch (err) {
      if (uploadKey && uploadId) abortUpload({ key: uploadKey, uploadId }).catch(() => {})
      setUploadState({ phase: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  function openFilePicker(asReplacesId: string | null) {
    setReplacesFileId(asReplacesId)
    fileInputRef.current?.click()
  }

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) handleFileSelected(file, replacesFileId)
  }

  const chains = buildChains(files)

  return (
    <div style={{ marginBottom: 24 }}>
      <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={onFileInputChange} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <label style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Filer i dette steget
        </label>
        {!readOnly && (
          <button
            onClick={() => openFilePicker(null)}
            disabled={uploadState.phase === 'uploading'}
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', fontWeight: 500,
              color: C.accent, background: C.accentBg, border: `1px solid ${C.border}`,
              borderRadius: 6, padding: '5px 10px', cursor: uploadState.phase === 'uploading' ? 'default' : 'pointer',
              opacity: uploadState.phase === 'uploading' ? 0.5 : 1,
            }}
          >
            + Last opp fil
          </button>
        )}
      </div>

      {uploadState.phase === 'uploading' && (
        <div style={{ marginBottom: 12, padding: '10px 14px', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8 }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text, marginBottom: 6 }}>
            {uploadState.filename}
          </p>
          <div style={{ height: 4, background: C.surface2, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${uploadState.progress}%`, background: C.accent, transition: 'width 0.2s' }} />
          </div>
        </div>
      )}

      {uploadState.phase === 'error' && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(224,85,85,0.08)', border: '1px solid rgba(224,85,85,0.3)', borderRadius: 8 }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.76rem', color: C.danger }}>{uploadState.message}</p>
        </div>
      )}

      {!loading && chains.length === 0 && uploadState.phase === 'idle' && (
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.76rem', color: C.text3 }}>
          Ingen filer lastet opp ennå.
        </p>
      )}

      {chains.map(chain => {
        const latest = chain[0]
        const older = chain.slice(1)
        return (
          <TaskFileRow
            key={latest.id}
            file={latest}
            olderVersions={older}
            projectId={projectId}
            taskTitle={taskTitle}
            readOnly={readOnly}
            expanded={expandedFileId === latest.id}
            onToggleExpand={() => setExpandedFileId(id => id === latest.id ? null : latest.id)}
            showHistory={showHistoryFor === latest.id}
            onToggleHistory={() => setShowHistoryFor(id => id === latest.id ? null : latest.id)}
            onUploadNewVersion={() => openFilePicker(latest.id)}
          />
        )
      })}
    </div>
  )
}

function TaskFileRow({
  file, olderVersions, projectId, taskTitle, readOnly,
  expanded, onToggleExpand, showHistory, onToggleHistory, onUploadNewVersion,
}: {
  file: TaskVideoFile
  olderVersions: TaskVideoFile[]
  projectId: string
  taskTitle: string
  readOnly: boolean
  expanded: boolean
  onToggleExpand: () => void
  showHistory: boolean
  onToggleHistory: () => void
  onUploadNewVersion: () => void
}) {
  const [customerReview, setCustomerReview] = useState<{ id: string; token: string; pin_code: string; status: 'open' | 'submitted' } | null>(null)
  const [colleagueReview, setColleagueReview] = useState<TaskFileReview | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [pickingReviewer, setPickingReviewer] = useState(false)
  const [reviewerId, setReviewerId] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    getLatestVideoReviewForFile(file.id).then(setCustomerReview)
    getLatestTaskFileReview(file.id).then(setColleagueReview)
  }, [file.id])

  async function handleSendToCustomer() {
    setSending(true)
    const result = await sendTaskFileToCustomer({ fileId: file.id, projectId, title: `${taskTitle} — ${file.filename}` })
    setSending(false)
    if ('error' in result) { alert(result.error); return }
    setCustomerReview({ id: '', token: result.token, pin_code: result.pinCode, status: 'open' })
  }

  async function handleSendToColleague() {
    if (!reviewerId) return
    setSending(true)
    const result = await requestTaskFileReview(file.id, reviewerId)
    setSending(false)
    if (!result.ok) { alert(result.error ?? 'Noe gikk galt'); return }
    setColleagueReview(await getLatestTaskFileReview(file.id))
    setPickingReviewer(false)
    setReviewerId('')
  }

  function openReviewerPicker() {
    if (profiles.length === 0) getAllProfiles().then(setProfiles)
    setPickingReviewer(true)
  }

  const colleagueStatusLabel = colleagueReview
    ? colleagueReview.status === 'pending' ? 'Venter på kollega-godkjenning'
      : colleagueReview.status === 'approved' ? 'Godkjent av kollega'
      : 'Endringer ønsket'
    : null

  return (
    <div style={{ marginBottom: 12, border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={onToggleExpand}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text, fontWeight: 600, textAlign: 'left', flex: 1, minWidth: 160 }}
        >
          {expanded ? '▾' : '▸'} {file.filename}
        </button>
        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>
          {formatFileSize(file.size_bytes)}
        </span>
        {colleagueStatusLabel && (
          <span style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: '0.66rem', padding: '2px 8px', borderRadius: 10,
            background: colleagueReview?.status === 'approved' ? 'rgba(76,175,125,0.12)' : colleagueReview?.status === 'changes_requested' ? 'rgba(212,100,90,0.12)' : 'rgba(196,148,52,0.12)',
            color: colleagueReview?.status === 'approved' ? C.success : colleagueReview?.status === 'changes_requested' ? C.danger : '#C49434',
          }}>
            {colleagueStatusLabel}
          </span>
        )}
        {customerReview && (
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.66rem', padding: '2px 8px', borderRadius: 10, background: 'rgba(124,92,252,0.12)', color: C.accent }}>
            {customerReview.status === 'submitted' ? 'Tilbakemelding mottatt' : 'Venter på kundetilbakemelding'}
          </span>
        )}
        {olderVersions.length > 0 && (
          <button
            onClick={onToggleHistory}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, textDecoration: 'underline' }}
          >
            {showHistory ? 'Skjul' : `${olderVersions.length} tidligere versjon${olderVersions.length > 1 ? 'er' : ''}`}
          </button>
        )}
      </div>

      {expanded && (
        <div style={{ padding: '0 14px 14px' }}>
          <TaskVideoFilePreview fileId={file.id} />

          {!readOnly && (
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button
                onClick={onUploadNewVersion}
                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500, padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: 'transparent', color: C.text2, border: `1px solid ${C.border}` }}
              >
                Ny versjon
              </button>
              <button
                onClick={handleSendToCustomer}
                disabled={sending || !!customerReview}
                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, padding: '6px 12px', borderRadius: 6, cursor: sending || customerReview ? 'default' : 'pointer', background: customerReview ? C.surface2 : C.accent, color: customerReview ? C.text3 : '#fff', border: 'none', opacity: sending ? 0.6 : 1 }}
              >
                {customerReview ? 'Sendt til kunde ✓' : 'Send til kunde'}
              </button>
              {!colleagueReview || colleagueReview.status === 'changes_requested' ? (
                <button
                  onClick={openReviewerPicker}
                  disabled={sending}
                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, padding: '6px 12px', borderRadius: 6, cursor: sending ? 'default' : 'pointer', background: 'transparent', color: C.text2, border: `1px solid ${C.border}`, opacity: sending ? 0.6 : 1 }}
                >
                  Send til kollega
                </button>
              ) : null}
            </div>
          )}

          {customerReview?.token && (
            <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginTop: 8 }}>
              <p style={{ margin: 0 }}>
                Kundelenke: {typeof window !== 'undefined' ? `${window.location.origin}/v/${customerReview.token}` : `/v/${customerReview.token}`}
              </p>
              <p style={{ margin: '2px 0 0' }}>
                PIN: <strong style={{ color: C.text, letterSpacing: '0.1em' }}>{customerReview.pin_code}</strong>
              </p>
            </div>
          )}

          {pickingReviewer && (
            <div style={{ marginTop: 10, padding: '10px 12px', background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <select
                value={reviewerId}
                onChange={e => setReviewerId(e.target.value)}
                style={{ width: '100%', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', padding: '7px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: C.text, marginBottom: 8 }}
              >
                <option value="">Velg kollega...</option>
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>{p.name ?? p.email}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleSendToColleague}
                  disabled={!reviewerId || sending}
                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, padding: '6px 12px', borderRadius: 6, cursor: reviewerId ? 'pointer' : 'default', background: C.accent, color: '#fff', border: 'none', opacity: reviewerId ? 1 : 0.5 }}
                >
                  Send
                </button>
                <button
                  onClick={() => { setPickingReviewer(false); setReviewerId('') }}
                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', background: 'none', color: C.text3, border: `1px solid ${C.border}` }}
                >
                  Avbryt
                </button>
              </div>
            </div>
          )}

          {showHistory && olderVersions.length > 0 && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
              {olderVersions.map(v => (
                <div key={v.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', fontFamily: 'var(--font-dm-sans)', fontSize: '0.74rem', color: C.text3 }}>
                  <span>{v.filename}</span>
                  <span>{formatFileSize(v.size_bytes)}</span>
                  <span>{new Date(v.created_at).toLocaleDateString('nb-NO')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
