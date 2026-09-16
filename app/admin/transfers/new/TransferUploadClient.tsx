'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createTransfer, initiateUpload, getUploadPartUrl, completeUpload, abortUpload } from '@/lib/actions/transfers'
import { createClient } from '@/lib/supabase-client'
import { formatFileSize } from '@/lib/utils/file-size'
import type { ProjectForTransfer } from '@/lib/actions/transfers'
import { getCurrentUserProfile, getAllProfiles } from '@/lib/actions/pipeline'
import { getOrCreateEmailDiscussionConversation } from '@/lib/actions/email-discussion-chat'
import type { ConversationParticipant } from '@/lib/actions/messages'
import { ProductionChat } from '@/components/production/ProductionChat'

// Laster filen opp til R2 som en multipart-opplasting, rett fra nettleseren
// (filbitene går aldri innom Next.js-serveren — nødvendig for filer i
// GB/TB-klassen). Et lite antall deler lastes opp parallelt for å unngå at
// veldig store filer tar evigheter som ren sekvensiell opplasting.
async function uploadFileToR2(
  file: File,
  key: string,
  uploadId: string,
  partSize: number,
  onProgress: (pct: number) => void
): Promise<{ ETag: string; PartNumber: number }[]> {
  const totalParts = Math.max(1, Math.ceil(file.size / partSize))
  const parts: { ETag: string; PartNumber: number }[] = new Array(totalParts)
  const uploadedPerPart = new Array(totalParts).fill(0)
  const CONCURRENCY = 4
  let nextIndex = 0

  const reportProgress = () => {
    const uploaded = uploadedPerPart.reduce((a, b) => a + b, 0)
    onProgress(Math.min(99, (uploaded / file.size) * 100))
  }

  const worker = async () => {
    while (nextIndex < totalParts) {
      const i = nextIndex++
      const partNumber = i + 1
      const start = i * partSize
      const end = Math.min(start + partSize, file.size)
      const blob = file.slice(start, end)

      const urlResult = await getUploadPartUrl({ key, uploadId, partNumber })
      if ('error' in urlResult) throw new Error(urlResult.error)

      const res = await fetch(urlResult.url, { method: 'PUT', body: blob })
      if (!res.ok) throw new Error(`Opplasting av del ${partNumber} feilet (${res.status})`)
      const etag = res.headers.get('ETag')
      if (!etag) {
        throw new Error('Mangler ETag i svaret fra R2 — CORS-policyen på bucketen må inkludere "ExposeHeaders": ["ETag"]')
      }

      parts[i] = { ETag: etag, PartNumber: partNumber }
      uploadedPerPart[i] = end - start
      reportProgress()
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, totalParts) }, worker))
  return parts
}

const C = {
  bg: '#181920', surface: '#21212D', surface2: '#2A2A38',
  border: '#3C3C52', text: '#EEEEF2', text2: '#B4B4CC', text3: '#8484A0',
  accent: '#7C5CFC', accentBg: 'rgba(124,92,252,0.10)', accentBorder: 'rgba(124,92,252,0.35)',
  danger: '#E05555', success: '#4CAF7D', gold: '#C49434',
}

type Props = {
  initialProject?: ProjectForTransfer | null
  deliveryType?: 'video' | 'photo' | null
}

type UploadState =
  | { phase: 'idle' }
  | { phase: 'dragging' }
  | { phase: 'selected'; file: File }
  | { phase: 'uploading'; file: File; progress: number }
  | { phase: 'sending-email' }
  | { phase: 'done'; downloadUrl: string; filename: string; emailSent: boolean }
  | { phase: 'error'; message: string }

function buildDefaultMessage(project: ProjectForTransfer | null | undefined, type: 'video' | 'photo' | null | undefined, language: 'no' | 'en' = 'no'): string {
  if (!project) return ''
  const firstName = project.customer?.name?.split(' ')[0]

  const delivLines = project.deliverables
    .filter(d => d.name)
    .map(d => `• ${d.quantity ? `${d.quantity}× ` : ''}${d.name}${d.format ? ` (${d.format})` : ''}`)
    .join('\n')

  if (language === 'en') {
    const typeLabel = type === 'video' ? 'the finished film' : type === 'photo' ? 'the photos' : 'the files'
    const body = `Hi ${firstName ?? 'there'}!\n\nHere is ${typeLabel} from ${project.title}.`
    return delivLines ? `${body}\n\nThe delivery includes:\n${delivLines}` : body
  }

  const typeLabel = type === 'video' ? 'ferdig film' : type === 'photo' ? 'bildene' : 'filene'
  const body = `Hei ${firstName ?? ''}!\n\nHer er ${typeLabel} fra ${project.title}.`
  return delivLines ? `${body}\n\nLeveransen inkluderer:\n${delivLines}` : body
}

function buildEmailHtml(params: {
  filename: string
  filesize: number
  downloadUrl: string
  message: string
  projectTitle: string
  expiryDays: number | null
  recipientName: string
  language?: 'no' | 'en'
}): string {
  const { filename, filesize, downloadUrl, message, projectTitle, expiryDays, recipientName, language = 'no' } = params
  const et = language === 'en'
    ? {
        expiry: (d: number) => `The download link is valid for ${d} day${d === 1 ? '' : 's'}.`,
        download: '↓ Download',
        cantClick: "Can't click the button? Copy this link:",
        sentBy: 'Sent by Leafilms',
      }
    : {
        expiry: (d: number) => `Nedlastingslenken er gyldig i ${d} ${d === 1 ? 'dag' : 'dager'}.`,
        download: '↓ Last ned',
        cantClick: 'Kan du ikke klikke knappen? Kopier denne lenken:',
        sentBy: 'Sendt av Leafilms',
      }
  const expiryLine = expiryDays
    ? `<p style="margin:0 0 8px;font-size:13px;color:#888;">${et.expiry(expiryDays)}</p>`
    : ''
  const messageHtml = message
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f0;font-family:system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f0;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#0C0B09;padding:24px 32px;">
            <p style="margin:0;font-family:Georgia,serif;font-size:18px;letter-spacing:0.14em;color:#C49434;text-transform:uppercase;">
              Leafilms
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">

            <p style="margin:0 0 20px;font-size:15px;color:#111;line-height:1.6;">
              ${messageHtml}
            </p>

            <!-- File card -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f5;border:1px solid #e4e2dc;border-radius:8px;margin:0 0 24px;">
              <tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0 0 3px;font-size:14px;font-weight:600;color:#111;">${filename}</p>
                  <p style="margin:0;font-size:12px;color:#888;">${formatFileSize(filesize)}</p>
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
              <tr>
                <td style="background:#C49434;border-radius:8px;">
                  <a href="${downloadUrl}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#0C0B09;text-decoration:none;letter-spacing:0.02em;">
                    ${et.download}
                  </a>
                </td>
              </tr>
            </table>

            ${expiryLine}

            <p style="margin:16px 0 0;font-size:12px;color:#aaa;">
              ${et.cantClick}<br>
              <a href="${downloadUrl}" style="color:#C49434;word-break:break-all;">${downloadUrl}</a>
            </p>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8f8f5;border-top:1px solid #e4e2dc;padding:16px 32px;">
            <p style="margin:0;font-size:11px;color:#aaa;">
              ${et.sentBy} · ${projectTitle}
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

export default function TransferUploadClient({ initialProject, deliveryType }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<UploadState>({ phase: 'idle' })

  const [recipientEmail, setRecipientEmail] = useState(initialProject?.customer?.email ?? '')
  const [recipientName, setRecipientName] = useState(initialProject?.customer?.name ?? '')
  const [message, setMessage] = useState(() => buildDefaultMessage(initialProject, deliveryType))
  const [expiry, setExpiry] = useState('7')
  const [usePassword, setUsePassword] = useState(false)
  const [password, setPassword] = useState('')
  const [sendEmail, setSendEmail] = useState(!!initialProject?.customer?.email)
  const [useLeafilmsAddress, setUseLeafilmsAddress] = useState(false)
  const [language, setLanguage] = useState<'no' | 'en'>(initialProject?.language ?? 'no')
  const [copied, setCopied] = useState(false)
  const [backgroundImage, setBackgroundImage] = useState<File | null>(null)
  const [backgroundImagePreview, setBackgroundImagePreview] = useState<string | null>(null)
  const [chatConversationId, setChatConversationId] = useState<string | null>(null)
  const [chatMembers, setChatMembers] = useState<ConversationParticipant[]>([])
  const [chatCurrentUser, setChatCurrentUser] = useState<ConversationParticipant | null>(null)
  const [chatAllProfiles, setChatAllProfiles] = useState<ConversationParticipant[]>([])

  // Bytt språk — regenerer standardmeldingen kun hvis den ikke er redigert manuelt
  const switchLanguage = (next: 'no' | 'en') => {
    setLanguage(prev => {
      if (next !== prev) {
        setMessage(m => m === buildDefaultMessage(initialProject, deliveryType, prev)
          ? buildDefaultMessage(initialProject, deliveryType, next)
          : m)
      }
      return next
    })
  }

  // Oppdater forhåndsutfylte verdier hvis project-prop endres (bør ikke skje, men for robusthet)
  useEffect(() => {
    if (initialProject?.customer?.email) setRecipientEmail(initialProject.customer.email)
    if (initialProject?.customer?.name) setRecipientName(initialProject.customer.name)
    if (initialProject) {
      setLanguage(initialProject.language)
      setMessage(buildDefaultMessage(initialProject, deliveryType, initialProject.language))
    }
  }, [initialProject?.id])

  // E-postdiskusjon — kun når et prosjekt er valgt (feedback e9431fb7).
  useEffect(() => {
    if (!initialProject?.id) return
    Promise.all([
      getOrCreateEmailDiscussionConversation(initialProject.id),
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
  }, [initialProject?.id])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) setState({ phase: 'selected', file })
    else setState({ phase: 'idle' })
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setState(s => s.phase === 'selected' ? s : { phase: 'dragging' })
  }, [])

  const onDragLeave = useCallback(() => {
    setState(s => s.phase === 'dragging' ? { phase: 'idle' } : s)
  }, [])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) setState({ phase: 'selected', file })
  }

  const onBackgroundImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setBackgroundImage(file)
    setBackgroundImagePreview(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
  }

  const removeBackgroundImage = () => {
    setBackgroundImage(null)
    setBackgroundImagePreview(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }

  const removeFile = () => {
    setState({ phase: 'idle' })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async () => {
    if (state.phase !== 'selected') return
    const file = state.file

    setState({ phase: 'uploading', file, progress: 0 })

    let uploadKey: string | undefined
    let uploadId: string | undefined

    try {
      const initResult = await initiateUpload({ filename: file.name, contentType: file.type || undefined })
      if ('error' in initResult) {
        setState({ phase: 'error', message: initResult.error })
        return
      }
      uploadKey = initResult.key
      uploadId = initResult.uploadId

      const parts = await uploadFileToR2(file, initResult.key, initResult.uploadId, initResult.partSize, (pct) => {
        setState({ phase: 'uploading', file, progress: pct })
      })

      const completeResult = await completeUpload({ key: initResult.key, uploadId: initResult.uploadId, parts })
      if ('error' in completeResult) {
        setState({ phase: 'error', message: completeResult.error })
        return
      }

      setState({ phase: 'uploading', file, progress: 100 })

      // Bakgrunnsbildet er dekorativt (ikke selve leveransefilen), så det går til det
      // eksisterende offentlige "assets"-bucketet i stedet for R2 — enklere enn presigned
      // URL-er, og trenger ingen utløp/tilgangskontroll utover selve /d/[token]-lenken.
      let backgroundImagePath: string | undefined
      if (backgroundImage) {
        const supabase = createClient()
        const path = `transfer-backgrounds/${initResult.key.split('/')[1]}/${Date.now()}-${backgroundImage.name}`
        const { error: bgError } = await supabase.storage.from('assets').upload(path, backgroundImage)
        if (bgError) {
          setState({ phase: 'error', message: 'Kunne ikke laste opp bakgrunnsbildet: ' + bgError.message })
          return
        }
        backgroundImagePath = path
      }

      const result = await createTransfer({
        filename: file.name,
        filesize_bytes: file.size,
        content_type: file.type || undefined,
        r2_key: initResult.key,
        message: message || undefined,
        expires_in_days: expiry === 'never' ? undefined : parseInt(expiry),
        recipient_email: recipientEmail || undefined,
        recipient_name: recipientName || undefined,
        title: initialProject
          ? language === 'en'
            ? `${deliveryType === 'video' ? 'Film' : deliveryType === 'photo' ? 'Photos' : 'Delivery'} — ${initialProject.title}`
            : `${deliveryType === 'video' ? 'Film' : deliveryType === 'photo' ? 'Bilder' : 'Leveranse'} — ${initialProject.title}`
          : undefined,
        language,
        customer_id: initialProject?.customer?.id,
        background_image_path: backgroundImagePath,
      })

      if ('error' in result) {
        setState({ phase: 'error', message: result.error })
        return
      }

      // Send e-post hvis aktivert og vi har e-postadresse
      let emailSent = false
      if (sendEmail && recipientEmail.trim()) {
        setState({ phase: 'sending-email' })
        const projectTitle = initialProject?.title ?? 'Leafilms'
        const subject = language === 'en'
          ? `${deliveryType === 'video' ? 'Film' : deliveryType === 'photo' ? 'Photos' : 'Files'} from Leafilms — ${projectTitle}`
          : `${deliveryType === 'video' ? 'Film' : deliveryType === 'photo' ? 'Bilder' : 'Filer'} fra Leafilms — ${projectTitle}`
        const htmlBody = buildEmailHtml({
          filename: file.name,
          filesize: file.size,
          downloadUrl: result.downloadUrl,
          message: message || (language === 'en'
            ? `Hi!\n\nHere is the delivery from ${projectTitle}.`
            : `Hei!\n\nHer er leveransen fra ${projectTitle}.`),
          projectTitle,
          expiryDays: expiry === 'never' ? null : parseInt(expiry),
          recipientName: recipientName || recipientEmail,
          language,
        })

        try {
          const emailRes = await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              projectId: initialProject?.id ?? null,
              emailType: 'delivery',
              to: recipientEmail.trim(),
              subject,
              body: htmlBody,
              useLeafilmsAddress,
            }),
          })
          emailSent = emailRes.ok
        } catch {
          // E-post feilet, men leveransen er opprettet — ikke fatal
        }
      }

      setState({ phase: 'done', downloadUrl: result.downloadUrl, filename: file.name, emailSent })
    } catch (err) {
      if (uploadKey && uploadId) abortUpload({ key: uploadKey, uploadId }).catch(() => {})
      setState({ phase: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }

  const copyLink = async (url: string) => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const isSubmittable = state.phase === 'selected'

  const inputStyle = {
    width: '100%', boxSizing: 'border-box' as const,
    background: C.surface2, border: `1px solid ${C.border}`,
    borderRadius: 8, padding: '10px 12px',
    fontFamily: 'var(--font-dm-sans)', fontSize: '0.84rem', color: C.text,
    outline: 'none', transition: 'border-color 0.15s',
  }

  const labelStyle = {
    fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem',
    fontWeight: 600, color: C.text3, letterSpacing: '0.04em',
    textTransform: 'uppercase' as const, marginBottom: 6, display: 'block',
  }

  if (state.phase === 'done') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 24px', textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'rgba(76,175,125,0.12)', border: '2px solid rgba(76,175,125,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.8rem', marginBottom: 20,
        }}>
          ✓
        </div>
        <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.1rem', fontWeight: 700, color: C.text, marginBottom: 8 }}>
          Leveranse sendt
        </h2>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text2, marginBottom: 6, maxWidth: 400 }}>
          {state.filename} er klar for nedlasting.
        </p>
        {state.emailSent && recipientEmail && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(76,175,125,0.08)', border: '1px solid rgba(76,175,125,0.25)',
            borderRadius: 6, padding: '6px 12px', marginBottom: 24,
          }}>
            <span style={{ fontSize: '0.8rem' }}>✉</span>
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.success }}>
              E-post sendt til {recipientEmail}
            </span>
          </div>
        )}
        {!state.emailSent && recipientEmail && sendEmail && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, marginBottom: 24 }}>
            E-post kunne ikke sendes — del lenken manuelt
          </p>
        )}
        {!state.emailSent && !sendEmail && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3, marginBottom: 24 }}>
            Del lenken nedenfor med kunden
          </p>
        )}

        {/* Nedlastingslenke */}
        <div style={{
          background: C.surface, border: `1px solid ${C.border}`,
          borderRadius: 10, padding: '16px 20px', width: '100%', maxWidth: 500, marginBottom: 20,
        }}>
          <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Nedlastingslenke
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{
              flex: 1, background: C.surface2, border: `1px solid ${C.border}`,
              borderRadius: 7, padding: '9px 12px',
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text2,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {state.downloadUrl}
            </div>
            <button
              onClick={() => copyLink(state.downloadUrl)}
              style={{
                background: copied ? 'rgba(76,175,125,0.15)' : C.accentBg,
                border: `1px solid ${copied ? 'rgba(76,175,125,0.4)' : C.accentBorder}`,
                borderRadius: 7, padding: '9px 14px', cursor: 'pointer',
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', fontWeight: 600,
                color: copied ? C.success : C.accent, whiteSpace: 'nowrap',
                transition: 'all 0.2s',
              }}
            >
              {copied ? '✓ Kopiert' : 'Kopier'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {initialProject && (
            <button
              onClick={() => router.push(`/admin/postprod/${initialProject.id}`)}
              style={{
                background: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: '9px 18px', cursor: 'pointer',
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text2,
              }}
            >
              ← Tilbake til prosjekt
            </button>
          )}
          <button
            onClick={() => router.push('/admin/transfers')}
            style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 8, padding: '9px 18px', cursor: 'pointer',
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text2,
            }}
          >
            Se alle leveranser
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_380px]" style={{ gap: 24, alignItems: 'start' }}>

      {/* Venstre: Upload-sone */}
      <div>
        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={() => {
            if (state.phase !== 'selected' && state.phase !== 'uploading' && state.phase !== 'sending-email') {
              fileInputRef.current?.click()
            }
          }}
          style={{
            border: `2px dashed ${
              state.phase === 'dragging' ? C.accent :
              state.phase === 'selected' ? 'rgba(76,175,125,0.5)' :
              state.phase === 'uploading' || state.phase === 'sending-email' ? C.accentBorder :
              C.border
            }`,
            borderRadius: 14,
            background: state.phase === 'dragging' ? C.accentBg : C.surface,
            padding: '60px 32px',
            textAlign: 'center',
            cursor: state.phase === 'selected' || state.phase === 'uploading' || state.phase === 'sending-email' ? 'default' : 'pointer',
            transition: 'border-color 0.2s, background 0.2s',
            minHeight: 320,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: 'none' }}
            onChange={onFileChange}
          />

          {(state.phase === 'idle' || state.phase === 'dragging') && (
            <>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: state.phase === 'dragging' ? C.accentBg : C.surface2,
                border: `1px solid ${state.phase === 'dragging' ? C.accentBorder : C.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.4rem', transition: 'all 0.2s',
              }}>
                {state.phase === 'dragging' ? '↓' : '↑'}
              </div>
              <div>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.95rem', fontWeight: 600, color: C.text, marginBottom: 4 }}>
                  {state.phase === 'dragging' ? 'Slipp filen her' : 'Dra og slipp filen her'}
                </p>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>
                  eller klikk for å velge — opptil 100 GB
                </p>
              </div>
              {deliveryType && (
                <div style={{
                  marginTop: 4, padding: '4px 12px',
                  background: deliveryType === 'video' ? 'rgba(124,92,252,0.08)' : 'rgba(74,154,196,0.08)',
                  border: `1px solid ${deliveryType === 'video' ? 'rgba(124,92,252,0.25)' : 'rgba(74,154,196,0.25)'}`,
                  borderRadius: 20,
                }}>
                  <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: deliveryType === 'video' ? C.accent : '#4A9AC4' }}>
                    {deliveryType === 'video' ? '🎬 Film-leveranse' : '🖼️ Bilde-leveranse'}
                  </span>
                </div>
              )}
            </>
          )}

          {state.phase === 'selected' && (
            <>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'rgba(76,175,125,0.10)',
                border: '1px solid rgba(76,175,125,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.4rem',
              }}>
                📄
              </div>
              <div>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.9rem', fontWeight: 600, color: C.text, marginBottom: 4 }}>
                  {state.file.name}
                </p>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>
                  {formatFileSize(state.file.size)}
                </p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); removeFile() }}
                style={{
                  marginTop: 4, background: 'none', border: 'none',
                  cursor: 'pointer', fontFamily: 'var(--font-dm-sans)',
                  fontSize: '0.72rem', color: C.text3, textDecoration: 'underline',
                }}
              >
                Fjern fil
              </button>
            </>
          )}

          {state.phase === 'uploading' && (
            <>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: C.accentBg, border: `1px solid ${C.accentBorder}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.4rem',
              }}>
                ⏫
              </div>
              <div style={{ width: '100%', maxWidth: 280 }}>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.88rem', fontWeight: 600, color: C.text, marginBottom: 10 }}>
                  {state.file.name}
                </p>
                <div style={{ height: 4, background: C.surface2, borderRadius: 2, overflow: 'hidden', marginBottom: 6 }}>
                  <div style={{
                    height: '100%', background: C.accent, borderRadius: 2,
                    width: `${state.progress}%`, transition: 'width 0.2s ease',
                  }} />
                </div>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
                  {Math.round(state.progress)}%
                  {state.progress < 88 ? ' — laster opp...' : ' — fullfører...'}
                </p>
              </div>
            </>
          )}

          {state.phase === 'sending-email' && (
            <>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'rgba(196,148,52,0.10)', border: '1px solid rgba(196,148,52,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.4rem',
              }}>
                ✉
              </div>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.88rem', fontWeight: 600, color: C.text }}>
                Sender e-post til {recipientEmail}...
              </p>
            </>
          )}
        </div>

        {state.phase === 'error' && (
          <div style={{
            marginTop: 12, background: 'rgba(224,85,85,0.08)',
            border: '1px solid rgba(224,85,85,0.3)', borderRadius: 8,
            padding: '10px 14px',
          }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.danger }}>
              {state.message}
            </p>
          </div>
        )}
      </div>

      {/* Høyre: Skjema + e-postdiskusjon */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 14, padding: '24px',
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        <div>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.88rem', fontWeight: 600, color: C.text, marginBottom: 2 }}>
            {initialProject ? 'Leveransedetaljer' : 'Leveransedetaljer'}
          </p>
          {initialProject?.customer && (
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>
              Forhåndsutfylt fra prosjektet
            </p>
          )}
        </div>

        {/* Mottakers e-post */}
        <div>
          <label style={labelStyle}>Mottakers e-post</label>
          <input
            type="email"
            placeholder="kunde@eksempel.no"
            value={recipientEmail}
            onChange={e => setRecipientEmail(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Mottakers navn */}
        <div>
          <label style={labelStyle}>
            Mottakers navn{' '}
            <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(valgfritt)</span>
          </label>
          <input
            type="text"
            placeholder="Ola Nordmann"
            value={recipientName}
            onChange={e => setRecipientName(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Språk for kunde */}
        <div>
          <label style={labelStyle}>Språk for kunde</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['no', 'en'] as const).map(l => (
              <button
                key={l}
                type="button"
                onClick={() => switchLanguage(l)}
                style={{
                  flex: 1, padding: '9px', borderRadius: 8,
                  border: `1px solid ${language === l ? C.accent : C.border}`,
                  background: language === l ? C.accentBg : C.surface2,
                  color: language === l ? C.text : C.text3,
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {l === 'no' ? 'Norsk' : 'Engelsk'}
              </button>
            ))}
          </div>
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, margin: '6px 0 0' }}>
            Styrer nedlastingssiden og e-posten kunden mottar
          </p>
        </div>

        {/* Melding */}
        <div>
          <label style={labelStyle}>
            Melding{' '}
            <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(valgfritt)</span>
          </label>
          <textarea
            placeholder="Hei! Her er råfilene fra oppdraget..."
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={4}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: '1.5' }}
          />
        </div>

        {/* Send e-post toggle */}
        <div style={{
          background: C.surface2, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: '12px 14px',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <div
              onClick={() => setSendEmail(p => !p)}
              style={{
                width: 34, height: 20, borderRadius: 10,
                background: sendEmail ? C.accent : C.surface2,
                border: `1px solid ${sendEmail ? C.accent : C.border}`,
                position: 'relative', transition: 'all 0.2s', cursor: 'pointer', flexShrink: 0,
              }}
            >
              <div style={{
                position: 'absolute', top: 2,
                left: sendEmail ? 16 : 2,
                width: 14, height: 14, borderRadius: '50%',
                background: '#fff', transition: 'left 0.2s',
              }} />
            </div>
            <div>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600, color: C.text, margin: 0 }}>
                Send e-post til kunden
              </p>
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, margin: 0, marginTop: 1 }}>
                {sendEmail
                  ? 'Kunden mottar en e-post med nedlastingslenke'
                  : 'Del lenken manuelt etter sending'}
              </p>
            </div>
          </label>
          {sendEmail && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
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
          )}
        </div>

        {/* Utløpsdato */}
        <div>
          <label style={labelStyle}>Lenken utløper om</label>
          <select
            value={expiry}
            onChange={e => setExpiry(e.target.value)}
            style={{ ...inputStyle, cursor: 'pointer' }}
          >
            <option value="1">1 dag</option>
            <option value="3">3 dager</option>
            <option value="7">7 dager</option>
            <option value="14">14 dager</option>
            <option value="30">30 dager</option>
            <option value="never">Aldri</option>
          </select>
        </div>

        {/* Bakgrunnsbilde på nedlastingssiden */}
        <div>
          <label style={labelStyle}>
            Bakgrunnsbilde{' '}
            <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(valgfritt)</span>
          </label>
          {backgroundImagePreview ? (
            <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.border}` }}>
              <img src={backgroundImagePreview} alt="Bakgrunnsbilde" style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }} />
              <button
                onClick={removeBackgroundImage}
                style={{
                  position: 'absolute', top: 6, right: 6, background: 'rgba(0,0,0,0.6)', border: 'none',
                  borderRadius: 5, color: '#fff', fontSize: '0.68rem', padding: '3px 8px', cursor: 'pointer',
                }}
              >
                Fjern
              </button>
            </div>
          ) : (
            <label
              htmlFor="background-image-upload"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: `1px dashed ${C.border}`, borderRadius: 8, padding: '14px', cursor: 'pointer',
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3,
              }}
            >
              + Last opp bakgrunnsbilde til nedlastingssiden
            </label>
          )}
          <input
            id="background-image-upload"
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={onBackgroundImageChange}
          />
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, margin: '6px 0 0' }}>
            Vises som bakgrunn på siden kunden lander på — f.eks. et av bildene fra leveransen. Uten dette brukes standard mørk bakgrunn.
          </p>
        </div>

        {/* Kundelogo — info, faktisk verdi kommer fra kundekortet (Kunder → logo) */}
        {initialProject?.customer?.logo_path && (
          <div style={{ background: C.accentBg, border: `1px solid ${C.accentBorder}`, borderRadius: 8, padding: '10px 14px' }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text2, margin: 0 }}>
              ✓ {initialProject.customer.name} sin lagrede logo vises automatisk på nedlastingssiden.
            </p>
          </div>
        )}

        {/* Passord-toggle */}
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: usePassword ? 8 : 0 }}>
            <div
              onClick={() => setUsePassword(p => !p)}
              style={{
                width: 34, height: 20, borderRadius: 10,
                background: usePassword ? C.accent : C.surface2,
                border: `1px solid ${usePassword ? C.accent : C.border}`,
                position: 'relative', transition: 'all 0.2s', cursor: 'pointer', flexShrink: 0,
              }}
            >
              <div style={{
                position: 'absolute', top: 2,
                left: usePassword ? 16 : 2,
                width: 14, height: 14, borderRadius: '50%',
                background: '#fff', transition: 'left 0.2s',
              }} />
            </div>
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text2 }}>
              Passordbeskytt lenken
            </span>
          </label>
          {usePassword && (
            <input
              type="password"
              placeholder="Passord til mottaker"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={inputStyle}
            />
          )}
        </div>

        {/* Send-knapp */}
        <button
          onClick={handleSubmit}
          disabled={!isSubmittable}
          style={{
            width: '100%', padding: '12px', borderRadius: 9, border: 'none',
            fontFamily: 'var(--font-dm-sans)', fontSize: '0.88rem', fontWeight: 600,
            cursor: isSubmittable ? 'pointer' : 'not-allowed',
            background: isSubmittable ? C.accent : C.surface2,
            color: isSubmittable ? '#fff' : C.text3,
            transition: 'background 0.15s',
          }}
        >
          {state.phase === 'uploading' || state.phase === 'sending-email'
            ? 'Sender...'
            : sendEmail && recipientEmail
            ? '↑ Last opp og send e-post'
            : '↑ Opprett leveranse'}
        </button>

        {!isSubmittable && state.phase === 'idle' && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3, textAlign: 'center', marginTop: -8 }}>
            Velg en fil for å fortsette
          </p>
        )}
      </div>

      {/* E-postdiskusjon — internt team-chat om denne leveransen/prosjektet,
          samme komponent som lead-chat og produksjonschatten (feedback e9431fb7) */}
      {chatConversationId && chatCurrentUser && (
        <div style={{ height: 420 }}>
          <ProductionChat
            conversationId={chatConversationId}
            currentUser={chatCurrentUser}
            initialMembers={chatMembers}
            allProfiles={chatAllProfiles.filter(p => p.id !== chatCurrentUser.id)}
            title="E-postdiskusjon"
            placeholder="Diskuter e-posten som skal sendes..."
          />
        </div>
      )}
      </div>
    </div>
  )
}
