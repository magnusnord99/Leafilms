'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { getProjectHub, generateEmailDraft, updatePipelineStage, getCurrentUserProfile, getAllProfiles } from '@/lib/actions/pipeline'
import { createTransfer, getTransfersForProject } from '@/lib/actions/transfers'
import type { TransferWithLink } from '@/lib/actions/transfers'
import { uploadDeliveryItems } from '@/lib/delivery-upload-client'
import type { DroppedItem } from '@/lib/delivery-upload-client'
import { DeliveryDropzone } from '@/components/transfers/DeliveryDropzone'
import type { SelectionMeta } from '@/components/transfers/DeliveryDropzone'
import { formatFileSize } from '@/lib/utils/file-size'
import { getOrCreateEmailDiscussionConversation } from '@/lib/actions/email-discussion-chat'
import type { ConversationParticipant } from '@/lib/actions/messages'
import { ProductionChat } from '@/components/production/ProductionChat'
import type { PipelineStage } from '@/lib/types'
import { C } from '@/lib/admin-theme'

type EmailType = 'meeting' | 'pitch' | 'follow_up' | 'general' | 'delivery'
type EmailLog = { id: string; project_id: string; type: string; to_email: string; subject: string; sent_at: string }
type HubData = Awaited<ReturnType<typeof getProjectHub>>

type DeliveryUpload = {
  tempId: string
  filename: string
  filesize: number
} & (
  | { status: 'uploading'; progress: number }
  | { status: 'done'; downloadUrl: string }
  | { status: 'error'; error: string }
)

function resolveEmailType(stage: PipelineStage | undefined): EmailType {
  if (stage === 'møte') return 'meeting'
  if (stage === 'tilbud_sendt') return 'pitch'
  if (stage === 'videresalg') return 'follow_up'
  if (stage === 'levering') return 'delivery'
  return 'general'
}

const EMAIL_TYPE_CONTEXT: Record<EmailType, string> = {
  meeting:   'Sender møteinvitasjon til kunden. Legg inn Google Meet- eller Zoom-link.',
  pitch:     'Sender prosjektbeskrivelse og tilbud til kunden for gjennomgang.',
  follow_up: 'Videresalgs-oppfølging til eksisterende kunde.',
  general:   'Generell kommunikasjon med kunden.',
  delivery:  'Sender leveransen til kunden sammen med nedlastingslenke til ferdig materiale.',
}

const inputStyle: React.CSSProperties = {
  width: '100%', fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem',
  background: C.surface2, border: `1px solid ${C.border}`,
  color: C.text, padding: '10px 14px', borderRadius: 8,
  outline: 'none', boxSizing: 'border-box',
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.text3, display: 'block', marginBottom: 6 }}>
      {children}
    </span>
  )
}

export default function EmailPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [hubData, setHubData] = useState<HubData>(null)
  const [loadingHub, setLoadingHub] = useState(true)
  const [toEmail, setToEmail] = useState('')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [meetingLink, setMeetingLink] = useState('')
  const [useLeafilmsAddress, setUseLeafilmsAddress] = useState(false)
  const [generatingDraft, setGeneratingDraft] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [chatConversationId, setChatConversationId] = useState<string | null>(null)
  const [chatMembers, setChatMembers] = useState<ConversationParticipant[]>([])
  const [chatCurrentUser, setChatCurrentUser] = useState<ConversationParticipant | null>(null)
  const [chatAllProfiles, setChatAllProfiles] = useState<ConversationParticipant[]>([])
  const [sessionUploads, setSessionUploads] = useState<DeliveryUpload[]>([])
  const [pendingSelection, setPendingSelection] = useState<SelectionMeta | null>(null)
  const [existingTransfers, setExistingTransfers] = useState<TransferWithLink[]>([])
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!projectId) return
    setLoadingHub(true)
    getProjectHub(projectId).then(data => {
      setHubData(data)
      if (data?.project.customer) {
        setToEmail((data.project.customer as { email?: string | null }).email ?? '')
      }
      setLoadingHub(false)
    })
  }, [projectId])

  const emailType = resolveEmailType(hubData?.project.pipeline_stage)

  useEffect(() => {
    if (!hubData) return
    loadDraft()
  }, [hubData?.project.id])

  async function fetchEmailLogs() {
    if (!projectId) return
    setLoadingLogs(true)
    import('@/lib/supabase-client')
      .then(({ createClient }) => createClient())
      .then(async supabase => {
        const { data } = await supabase
          .from('email_log')
          .select('id, project_id, type, to_email, subject, sent_at')
          .eq('project_id', projectId)
          .order('sent_at', { ascending: false })
          .limit(10)
        setEmailLogs((data as EmailLog[]) ?? [])
      })
      .catch(() => {})
      .finally(() => setLoadingLogs(false))
  }

  useEffect(() => { fetchEmailLogs() }, [projectId])

  useEffect(() => {
    if (!projectId) return
    Promise.all([
      getOrCreateEmailDiscussionConversation(projectId),
      getCurrentUserProfile(),
      getAllProfiles(),
    ]).then(([chat, user, profiles]) => {
      if (chat) {
        setChatConversationId(chat.conversationId)
        setChatMembers(chat.members)
      }
      setChatCurrentUser(user)
      setChatAllProfiles(profiles)
    })
  }, [projectId])

  // Last inn tidligere leveranser knyttet til dette prosjektet (lesevisning)
  useEffect(() => {
    if (!projectId) return
    getTransfersForProject(projectId)
      .then(transfers => setExistingTransfers(transfers))
      .catch(() => {})
  }, [projectId])

  async function loadDraft() {
    if (!hubData) return
    setGeneratingDraft(true)
    try {
      let extraContext: string | undefined
      if (emailType === 'delivery') {
        // For leveranse-type: send deliverables-info, men IKKE noen nedlastingslenke
        // (lenken finnes ikke før en fil er lastet opp — se handleDeliveryFileUpload)
        const deliverables = (hubData.project as {
          deliverables?: Array<{ name?: string; quantity?: number | null; format?: string }>
        }).deliverables ?? []
        const delivLines = deliverables
          .filter(d => d.name)
          .map(d => `• ${d.quantity ? `${d.quantity}× ` : ''}${d.name}${d.format ? ` (${d.format})` : ''}`)
          .join('\n')
        extraContext = delivLines ? `Leveransen inkluderer:\n${delivLines}` : undefined
      } else {
        extraContext = hubData.pitchToken
          ? `Lenke til prosjektside (pitch, tilbud og signerbar kontrakt): ${window.location.origin}/p/${hubData.pitchToken}`
          : undefined
      }
      const draft = await generateEmailDraft(projectId, emailType, extraContext)
      if (draft) { setSubject(draft.subject ?? ''); setBody(draft.body ?? '') }
    } catch {}
    finally { setGeneratingDraft(false) }
  }

  async function handleDeliveryItemsUpload(items: DroppedItem[]) {
    const willZip = items.length > 1
    // Vis-navn og estimert størrelse for optimistisk UI under opplasting
    const displayName = willZip
      ? `${items.length} filer (zippes)`
      : (items[0].relativePath.split('/').pop() ?? items[0].file.name)
    const approxSize = items.reduce((s, { file }) => s + file.size, 0)

    const tempId = `${Date.now()}-${Math.random()}`
    setSessionUploads(prev => [
      ...prev,
      { tempId, filename: displayName, filesize: approxSize, status: 'uploading', progress: 0 },
    ])

    try {
      const uploadResult = await uploadDeliveryItems(
        items,
        (hubData?.project as { title?: string })?.title ?? 'Leveranse',
        (bytesUploaded, totalBytes) => {
          const progress = totalBytes > 0
            ? Math.min(99, Math.round((bytesUploaded / totalBytes) * 100))
            : 0
          setSessionUploads(prev => prev.map(u =>
            u.tempId === tempId
              ? { tempId: u.tempId, filename: displayName, filesize: totalBytes, status: 'uploading' as const, progress }
              : u
          ))
        }
      )

      const transferResult = await createTransfer({
        filename: uploadResult.filename,
        filesize_bytes: uploadResult.filesize,
        content_type: uploadResult.contentType,
        r2_key: uploadResult.r2Key,
        project_id: projectId,
        customer_id: (hubData?.project.customer as { id?: string } | null)?.id,
        recipient_email: toEmail || undefined,
        expires_in_days: 14,
      })

      if ('error' in transferResult) {
        setSessionUploads(prev => prev.map(u =>
          u.tempId === tempId
            ? { tempId: u.tempId, filename: u.filename, filesize: u.filesize, status: 'error' as const, error: transferResult.error }
            : u
        ))
        return
      }

      const newUrl = transferResult.downloadUrl
      setSessionUploads(prev => prev.map(u =>
        u.tempId === tempId
          ? { tempId: u.tempId, filename: uploadResult.filename, filesize: uploadResult.filesize, status: 'done' as const, downloadUrl: newUrl }
          : u
      ))

      // Sett inn nedlastingslenken i meldingsteksten som hyperlenke ("Klikk her") — én samlet seksjon, unngå duplikat
      setBody(prev => {
        if (prev.includes(newUrl)) return prev
        const linkLine = `[Klikk her](${newUrl}) for å laste ned.`
        return prev.trim().length > 0 ? `${prev}\n\n${linkLine}` : linkLine
      })

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setSessionUploads(prev => prev.map(u =>
        u.tempId === tempId
          ? { tempId: u.tempId, filename: u.filename, filesize: u.filesize, status: 'error' as const, error: msg }
          : u
      ))
    }
  }

  async function handleSend() {
    if (!toEmail.trim() || !subject.trim() || !body.trim()) return
    setSending(true)
    setSendResult(null)
    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, emailType, to: toEmail.trim(), cc: cc.trim() || undefined, subject: subject.trim(), body: body.trim(), meetingLink: meetingLink.trim() || undefined, useLeafilmsAddress }),
      })
      if (res.ok) {
        if (emailType === 'pitch' && hubData?.project.pipeline_stage === 'tilbud_sendt') {
          await updatePipelineStage(projectId, 'kontrakt')
          setSendResult({ ok: true, message: 'E-post sendt. Prosjekt flyttet til Kontrakt.' })
        } else if (emailType === 'delivery' && sessionUploads.some(u => u.status === 'done')) {
          await updatePipelineStage(projectId, 'fakturert')
          setSendResult({ ok: true, message: 'E-post sendt. Prosjekt flyttet til Fakturert.' })
        } else {
          setSendResult({ ok: true, message: 'E-post sendt.' })
        }
        fetchEmailLogs()
      } else {
        const err = await res.json().catch(() => ({}))
        setSendResult({ ok: false, message: err.error ?? 'Sending feilet.' })
      }
    } catch {
      setSendResult({ ok: false, message: 'Nettverksfeil — prøv igjen.' })
    } finally {
      setSending(false)
    }
  }

  const canSend = !sending && !generatingDraft && !!toEmail.trim() && !!subject.trim() && !!body.trim()
    && !sessionUploads.some(u => u.status === 'uploading')

  // Cmd/Ctrl+K — samme snarvei som i vanlige mailklienter — gjør markert tekst
  // om til en ordentlig lenke ([visningstekst](url)) i stedet for en rå URL i
  // meldingsteksten. Se feedback 4c2cadff.
  function handleBodyKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.key === 'k' && (e.metaKey || e.ctrlKey))) return
    e.preventDefault()
    const el = bodyRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = body.slice(start, end)
    const url = window.prompt('Lenke (URL):', 'https://')
    if (!url || !url.trim()) return
    const label = selected || url.trim()
    const next = body.slice(0, start) + `[${label}](${url.trim()})` + body.slice(end)
    setBody(next)
    requestAnimationFrame(() => el.focus())
  }

  if (loadingHub) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>Laster prosjekt...</p>
      </div>
    )
  }

  if (!hubData) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, marginBottom: 16 }}>Fant ikke prosjektet.</p>
          <button onClick={() => router.push('/admin/pipeline')} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, background: 'none', border: 'none', cursor: 'pointer' }}>
            ← Tilbake til pipeline
          </button>
        </div>
      </div>
    )
  }

  const { project } = hubData
  const customerName = project.customer?.name ?? ''
  const customerCompany = (project.customer as { company?: string | null } | null)?.company ?? ''

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ maxWidth: 1100, padding: '20px 32px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <Link href={`/admin/projects/${projectId}`} style={{ textDecoration: 'none' }}>
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}
              onMouseEnter={e => { (e.currentTarget as HTMLSpanElement).style.color = C.text2 }}
              onMouseLeave={e => { (e.currentTarget as HTMLSpanElement).style.color = C.text3 }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 2L4 6l3.5 4" /></svg>
              {project.title}
            </span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {customerName && <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3 }}>{customerName}</span>}
            {customerName && customerCompany && <span style={{ color: C.text3, fontSize: '0.55rem' }}>·</span>}
            {customerCompany && <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3 }}>{customerCompany}</span>}
          </div>
        </div>
        <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', fontWeight: 600, color: C.text, marginBottom: 20 }}>Send e-post</h2>
      </div>

      <div style={{ padding: '0 32px 48px', display: 'flex', gap: 24, alignItems: 'flex-start', maxWidth: 1100 }}>

        {/* Venstre: komponist */}
        <div style={{ flex: '0 0 60%', minWidth: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <div>
              <FieldLabel>Til</FieldLabel>
              <input type="email" value={toEmail} onChange={e => setToEmail(e.target.value)} placeholder="kunde@selskap.no" style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
                onBlur={e => { e.currentTarget.style.borderColor = C.border }} />
            </div>

            <div>
              <FieldLabel>Kopi (CC)</FieldLabel>
              <input type="text" value={cc} onChange={e => setCc(e.target.value)} placeholder="valgfritt, kommaseparert" style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
                onBlur={e => { e.currentTarget.style.borderColor = C.border }} />
            </div>

            <div>
              <FieldLabel>Emne</FieldLabel>
              <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Emnefelt..." style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
                onBlur={e => { e.currentTarget.style.borderColor = C.border }} />
            </div>

            <div>
              <FieldLabel>Melding</FieldLabel>
              <textarea
                ref={bodyRef}
                value={generatingDraft ? '' : body}
                onChange={e => setBody(e.target.value)}
                onKeyDown={handleBodyKeyDown}
                placeholder={generatingDraft ? 'Genererer utkast...' : 'Skriv melding...'}
                disabled={generatingDraft}
                style={{ ...inputStyle, minHeight: 220, resize: 'vertical', lineHeight: 1.6, opacity: generatingDraft ? 0.5 : 1, transition: 'opacity 0.2s' }}
                onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
                onBlur={e => { e.currentTarget.style.borderColor = C.border }}
              />
              {generatingDraft ? (
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, marginTop: 6, fontStyle: 'italic' }}>
                  Genererer utkast med AI...
                </p>
              ) : (
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3, marginTop: 6 }}>
                  Marker tekst og trykk {typeof navigator !== 'undefined' && navigator.platform?.includes('Mac') ? '⌘K' : 'Ctrl+K'} for å gjøre den om til en lenke.
                </p>
              )}
            </div>

            <div>
              <button
                onClick={loadDraft}
                disabled={generatingDraft}
                style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.text3, background: 'none', border: `1px solid ${C.border}`, borderRadius: 7, padding: '7px 16px', cursor: generatingDraft ? 'default' : 'pointer', opacity: generatingDraft ? 0.5 : 1 }}
              >
                {generatingDraft ? 'Genererer...' : '↺ Generer nytt utkast'}
              </button>
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={useLeafilmsAddress}
                onChange={e => setUseLeafilmsAddress(e.target.checked)}
                style={{ accentColor: C.accent, width: 14, height: 14, cursor: 'pointer' }}
              />
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text2 }}>
                Send fra post@leafilms.no i stedet for min egen adresse
              </span>
            </label>

            {sendResult && (
              <div style={{ padding: '10px 14px', borderRadius: 8, background: sendResult.ok ? 'rgba(76,175,125,0.08)' : 'rgba(224,85,85,0.08)', border: `1px solid ${sendResult.ok ? 'rgba(76,175,125,0.25)' : 'rgba(224,85,85,0.25)'}` }}>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: sendResult.ok ? C.success : C.danger }}>
                  {sendResult.message}
                </p>
              </div>
            )}

            <button
              onClick={handleSend}
              disabled={!canSend}
              style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600, padding: '12px', borderRadius: 8, cursor: canSend ? 'pointer' : 'default', background: canSend ? C.accent : C.surface2, color: canSend ? '#fff' : C.text3, border: 'none', transition: 'background 0.15s, transform 0.1s' }}
              onMouseEnter={e => { if (canSend) (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)' }}
            >
              {sending ? 'Sender...' : 'Send e-post'}
            </button>
          </div>
        </div>

        {/* Høyre: kontekst */}
        <div style={{ flex: '0 0 calc(40% - 24px)', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 18px' }}>
            <FieldLabel>Om denne e-posten</FieldLabel>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text2, lineHeight: 1.6 }}>
              {EMAIL_TYPE_CONTEXT[emailType]}
            </p>
          </div>

          {/* E-postdiskusjon — egen tråd for å snakke om e-poster som skal
              sendes ut, adskilt fra produksjonschatten (feedback e9431fb7) */}
          {chatConversationId && chatCurrentUser && (
            <div style={{ height: 360 }}>
              <ProductionChat
                conversationId={chatConversationId}
                currentUser={chatCurrentUser}
                initialMembers={chatMembers}
                allProfiles={chatAllProfiles.filter(p => p.id !== chatCurrentUser.id)}
                title="E-postdiskusjon"
                placeholder="Skriv en melding om denne e-posten..."
              />
            </div>
          )}

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 18px' }}>
            <FieldLabel>Vedlegg / Lenker</FieldLabel>

            {/* Møtelink */}
            {emailType === 'meeting' && (
              <div>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginBottom: 8 }}>Møtelink</p>
                <input type="url" value={meetingLink} onChange={e => setMeetingLink(e.target.value)} placeholder="https://meet.google.com/..." style={inputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
                  onBlur={e => { e.currentTarget.style.borderColor = C.border }} />
              </div>
            )}

            {/* Leveranseopplasting — kun synlig for levering-steget */}
            {emailType === 'delivery' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Kompakt dropsone — støtter enkeltfiler, flere filer og mapper */}
                <DeliveryDropzone
                  variant="compact"
                  disabled={sessionUploads.some(u => u.status === 'uploading')}
                  onFilesSelected={meta => setPendingSelection(meta)}
                  onClear={() => setPendingSelection(null)}
                />

                {/* Bekreft-steg — opplasting starter ikke før dette trykkes */}
                {pendingSelection && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => {
                        const items = pendingSelection.items
                        setPendingSelection(null)
                        handleDeliveryItemsUpload(items)
                      }}
                      style={{
                        flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600,
                        padding: '8px', borderRadius: 7, cursor: 'pointer',
                        background: C.accent, color: '#fff', border: 'none',
                      }}
                    >
                      ↑ Last opp{pendingSelection.willZip ? ' og zip' : ''}
                    </button>
                  </div>
                )}

                {/* Filer lastet opp i denne økten */}
                {sessionUploads.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {sessionUploads.map(u => (
                      <div key={u.tempId} style={{
                        background: C.surface2,
                        border: `1px solid ${
                          u.status === 'done'  ? 'rgba(76,175,125,0.3)' :
                          u.status === 'error' ? 'rgba(224,85,85,0.3)' :
                          C.border
                        }`,
                        borderRadius: 7, padding: '8px 10px',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, color: C.text, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {u.filename}
                            </p>
                            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3 }}>
                              {formatFileSize(u.filesize)}
                            </p>
                          </div>
                          <span style={{
                            fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', fontWeight: 600,
                            letterSpacing: '0.05em', textTransform: 'uppercase', flexShrink: 0,
                            color: u.status === 'done' ? C.success : u.status === 'error' ? C.danger : C.text3,
                          }}>
                            {u.status === 'done' ? '✓ Klar'
                              : u.status === 'error' ? '✗ Feil'
                              : `${Math.round(u.progress)}%`}
                          </span>
                        </div>

                        {u.status === 'uploading' && (
                          <div style={{ height: 2, background: C.border, borderRadius: 1, marginTop: 6, overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: C.accent, borderRadius: 1, width: `${u.progress}%`, transition: 'width 0.2s ease' }} />
                          </div>
                        )}
                        {u.status === 'done' && (
                          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.accent, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {u.downloadUrl}
                          </p>
                        )}
                        {u.status === 'error' && (
                          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', color: C.danger, marginTop: 4 }}>
                            {u.error}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Tidligere leveranser for dette prosjektet — lesevisning */}
                {existingTransfers.length > 0 && (
                  <div>
                    <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.text3, marginBottom: 6 }}>
                      Tidligere sendt
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {existingTransfers.map(t => (
                        <div key={t.id} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 10px' }}>
                          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text2, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.filename}
                          </p>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3 }}>
                              {formatFileSize(t.filesize_bytes)}
                            </span>
                            <span style={{ color: C.border, fontSize: '0.5rem' }}>&#9679;</span>
                            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3 }}>
                              {new Date(t.created_at).toLocaleDateString('nb-NO', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                            {t.primary_link && (
                              <>
                                <span style={{ color: C.border, fontSize: '0.5rem' }}>&#9679;</span>
                                <a
                                  href={`${typeof window !== 'undefined' ? window.location.origin : ''}/d/${t.primary_link.token}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.accent, textDecoration: 'none' }}
                                >
                                  Åpne ↗
                                </a>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Pitch/tilbud-lenke for andre typer enn møte og levering */}
            {emailType !== 'meeting' && emailType !== 'delivery' && hubData.pitchToken && (
              <div>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginBottom: 6 }}>Pitch-, tilbud- og kontraktlenke</p>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.accent, wordBreak: 'break-all' }}>
                  {typeof window !== 'undefined' ? `${window.location.origin}/p/${hubData.pitchToken}` : `/p/${hubData.pitchToken}`}
                </p>
              </div>
            )}
            {emailType !== 'meeting' && emailType !== 'delivery' && !hubData.pitchToken && (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, fontStyle: 'italic' }}>
                Ingen vedlegg for denne e-posttypen.
              </p>
            )}
          </div>

          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 18px' }}>
            <FieldLabel>Samtalehistorikk</FieldLabel>
            {loadingLogs ? (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, fontStyle: 'italic' }}>Laster historikk...</p>
            ) : emailLogs.length === 0 ? (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, fontStyle: 'italic' }}>Ingen e-poster sendt ennå.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {emailLogs.map((log, idx) => {
                  const typeColor: Record<string, string> = {
                    pitch:      '#7C5CFC',
                    meeting:    '#4A9AC4',
                    follow_up:  '#4CAF7D',
                    general:    '#B4B4CC',
                    delivery:   '#C49434',
                  }
                  const typeLabel: Record<string, string> = {
                    pitch:      'Tilbud & pitch',
                    meeting:    'Møteinvitasjon',
                    follow_up:  'Videresalg',
                    general:    'Generell',
                    delivery:   'Leveranse',
                  }
                  const dotColor = typeColor[log.type] ?? '#B4B4CC'
                  const isLast = idx === emailLogs.length - 1
                  return (
                    <div key={log.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      {/* Tidslinje-søyle */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, paddingTop: 2 }}>
                        <div style={{ width: 12, height: 12, borderRadius: '50%', background: dotColor, flexShrink: 0, boxShadow: `0 0 0 3px ${dotColor}22` }} />
                        {!isLast && (
                          <div style={{ width: 2, flex: 1, minHeight: 18, background: C.border, marginTop: 4 }} />
                        )}
                      </div>
                      {/* Innhold */}
                      <div style={{ flex: 1, minWidth: 0, paddingBottom: isLast ? 0 : 16 }}>
                        <div style={{ display: 'inline-block', marginBottom: 5 }}>
                          <span style={{
                            fontFamily: 'var(--font-dm-sans)', fontSize: '0.6rem', fontWeight: 600,
                            letterSpacing: '0.06em', textTransform: 'uppercase',
                            color: dotColor, background: `${dotColor}18`,
                            padding: '2px 8px', borderRadius: 4,
                          }}>
                            {typeLabel[log.type] ?? log.type}
                          </span>
                        </div>
                        <p style={{
                          fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem',
                          fontWeight: 600, color: C.text,
                          marginBottom: 3, lineHeight: 1.35,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {log.subject}
                        </p>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3 }}>
                            {log.to_email}
                          </span>
                          <span style={{ color: C.border, fontSize: '0.55rem' }}>&#9679;</span>
                          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.62rem', color: C.text3 }}>
                            {new Date(log.sent_at).toLocaleDateString('nb-NO', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
