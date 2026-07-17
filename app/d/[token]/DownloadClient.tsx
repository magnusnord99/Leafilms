'use client'

import { useState } from 'react'
import { S } from '@/lib/client-theme'
import { formatFileSize } from '@/lib/utils/file-size'

type Props = {
  filename: string
  filesize: number
  message: string | null
  expiresAt: string | null
  hasPassword: boolean
  token: string
  senderName?: string
  language?: 'no' | 'en'
}

const DL_STRINGS = {
  no: {
    expiresTomorrow: 'Lenken utløper i morgen',
    expiresInDays: (d: number) => `Lenken utløper om ${d} dager`,
    from: (name: string) => `Fra ${name}`,
    passwordRequired: 'Passord kreves',
    enterPassword: 'Skriv inn passord',
    wrongPassword: 'Feil passord — prøv igjen',
    preparing: 'Forbereder nedlasting...',
    download: '↓ Last ned',
    downloadStarted: 'Nedlasting startet',
    deliveredBy: 'Levert av',
  },
  en: {
    expiresTomorrow: 'The link expires tomorrow',
    expiresInDays: (d: number) => `The link expires in ${d} days`,
    from: (name: string) => `From ${name}`,
    passwordRequired: 'Password required',
    enterPassword: 'Enter password',
    wrongPassword: 'Incorrect password — try again',
    preparing: 'Preparing download...',
    download: '↓ Download',
    downloadStarted: 'Download started',
    deliveredBy: 'Delivered by',
  },
}

type DlStrings = (typeof DL_STRINGS)['no']

function FileIcon({ filename }: { filename: string }) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const isVideo = ['mp4', 'mov', 'mxf', 'avi', 'mkv', 'r3d', 'braw', 'dng'].includes(ext)
  const isAudio = ['wav', 'aif', 'aiff', 'mp3', 'flac'].includes(ext)
  const isImage = ['jpg', 'jpeg', 'png', 'tiff', 'tif', 'raw', 'cr2', 'nef'].includes(ext)
  const isArchive = ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)

  const emoji = isVideo ? '🎬' : isAudio ? '🎵' : isImage ? '🖼️' : isArchive ? '📦' : '📄'
  return <span style={{ fontSize: '2.2rem' }}>{emoji}</span>
}

function ExpiryNotice({ expiresAt, t }: { expiresAt: string; t: DlStrings }) {
  const d = new Date(expiresAt)
  const diff = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  if (diff <= 0) return null
  const label = diff === 1 ? t.expiresTomorrow : t.expiresInDays(diff)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: S.goldBg, border: `1px solid ${S.goldBorder}`,
      borderRadius: S.radiusSm, padding: '7px 12px',
    }}>
      <span style={{ fontSize: '0.8rem' }}>⏱</span>
      <span style={{ fontFamily: S.fontBody, fontSize: '0.75rem', color: S.gold }}>
        {label}
      </span>
    </div>
  )
}

export default function DownloadClient({
  filename, filesize, message, expiresAt, hasPassword, token, senderName, language = 'no',
}: Props) {
  const t = DL_STRINGS[language]
  const [passwordInput, setPasswordInput] = useState('')
  const [phase, setPhase] = useState<'idle' | 'downloading' | 'done' | 'error' | 'wrong-password'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleDownload = async () => {
    if (hasPassword && !passwordInput.trim()) {
      setPhase('wrong-password')
      return
    }

    setPhase('downloading')

    // TODO: Kall server action for å hente presigned R2-URL og verifisere passord
    // Simulerer en forsinkelse for prototypen
    await new Promise(r => setTimeout(r, 1400))

    // Prototype: simuler vellykket nedlasting
    setPhase('done')

    // Ved ekte implementasjon:
    // const result = await recordDownload(token, passwordInput)
    // if ('error' in result) { setPhase('error'); setErrorMsg(result.error); return }
    // window.location.href = result.downloadUrl
  }

  return (
    <div style={{
      minHeight: '100dvh',
      background: S.bg,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '32px 20px',
      position: 'relative',
    }}>

      {/* Logo øverst */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        padding: '20px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `1px solid ${S.border}`,
        background: S.surface,
      }}>
        <span style={{
          fontFamily: S.fontDisplay,
          fontSize: '1.15rem',
          letterSpacing: '0.14em',
          color: S.gold,
          textTransform: 'uppercase',
        }}>
          Leafilms
        </span>
        {senderName && (
          <span style={{ fontFamily: S.fontBody, fontSize: '0.72rem', color: S.text3 }}>
            {t.from(senderName)}
          </span>
        )}
      </div>

      {/* Kort */}
      <div style={{
        width: '100%',
        maxWidth: 480,
        background: S.surface,
        border: `1px solid ${S.border}`,
        borderRadius: S.radiusLg,
        overflow: 'hidden',
        marginTop: 60,
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>

        {/* Fil-header med gull-gradient */}
        <div style={{
          background: `linear-gradient(135deg, ${S.surface2} 0%, rgba(196,148,52,0.06) 100%)`,
          borderBottom: `1px solid ${S.border}`,
          padding: '32px 28px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          textAlign: 'center',
        }}>
          <div style={{
            width: 68, height: 68, borderRadius: '50%',
            background: S.goldBg,
            border: `1.5px solid ${S.goldBorder}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <FileIcon filename={filename} />
          </div>

          <div>
            <h1 style={{
              fontFamily: S.fontBody, fontSize: '1rem', fontWeight: 700,
              color: S.text, margin: 0, marginBottom: 4,
              wordBreak: 'break-all',
            }}>
              {filename}
            </h1>
            <span style={{ fontFamily: S.fontBody, fontSize: '0.78rem', color: S.text2 }}>
              {formatFileSize(filesize)}
            </span>
          </div>
        </div>

        {/* Innhold */}
        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Melding fra sender */}
          {message && (
            <div style={{
              background: S.surface2, borderRadius: S.radiusSm,
              padding: '14px 16px',
              borderLeft: `2px solid ${S.goldBorder}`,
            }}>
              <p style={{
                fontFamily: S.fontBody, fontSize: '0.82rem',
                color: S.text2, lineHeight: '1.6', margin: 0,
              }}>
                {message}
              </p>
            </div>
          )}

          {/* Utløpsvarsel */}
          {expiresAt && <ExpiryNotice expiresAt={expiresAt} t={t} />}

          {/* Passord */}
          {hasPassword && (
            <div>
              <label style={{
                fontFamily: S.fontBody, fontSize: '0.7rem', fontWeight: 600,
                color: S.text3, letterSpacing: '0.05em', textTransform: 'uppercase',
                display: 'block', marginBottom: 8,
              }}>
                {t.passwordRequired}
              </label>
              <input
                type="password"
                placeholder={t.enterPassword}
                value={passwordInput}
                onChange={e => { setPasswordInput(e.target.value); setPhase('idle') }}
                onKeyDown={e => e.key === 'Enter' && handleDownload()}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: S.surface2, border: `1px solid ${phase === 'wrong-password' ? S.danger : S.border}`,
                  borderRadius: S.radiusSm, padding: '10px 12px',
                  fontFamily: S.fontBody, fontSize: '0.84rem', color: S.text,
                  outline: 'none',
                }}
              />
              {phase === 'wrong-password' && (
                <p style={{ fontFamily: S.fontBody, fontSize: '0.72rem', color: S.danger, marginTop: 6 }}>
                  {t.wrongPassword}
                </p>
              )}
            </div>
          )}

          {/* Feilmelding */}
          {phase === 'error' && (
            <div style={{
              background: S.dangerBg, border: `1px solid rgba(184,64,64,0.3)`,
              borderRadius: S.radiusSm, padding: '10px 14px',
            }}>
              <p style={{ fontFamily: S.fontBody, fontSize: '0.8rem', color: S.danger, margin: 0 }}>
                {errorMsg}
              </p>
            </div>
          )}

          {/* Nedlastingsknapp */}
          {phase !== 'done' ? (
            <button
              onClick={handleDownload}
              disabled={phase === 'downloading'}
              style={{
                width: '100%', padding: '14px',
                borderRadius: S.radius,
                border: phase === 'downloading' ? `1px solid ${S.goldBorder}` : 'none',
                background: phase === 'downloading'
                  ? S.goldBg
                  : `linear-gradient(135deg, ${S.gold} 0%, ${S.goldHover} 100%)`,
                color: phase === 'downloading' ? S.gold : S.bg,
                fontFamily: S.fontBody, fontSize: '0.9rem', fontWeight: 700,
                cursor: phase === 'downloading' ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                letterSpacing: '0.02em',
              }}
            >
              {phase === 'downloading' ? (
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span style={{ animation: 'pulse 1s infinite', display: 'inline-block' }}>⏳</span>
                  {t.preparing}
                </span>
              ) : (
                t.download
              )}
            </button>
          ) : (
            <div style={{
              width: '100%', padding: '14px',
              borderRadius: S.radius,
              background: S.greenBg, border: `1px solid rgba(76,175,125,0.35)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <span style={{ fontSize: '1rem' }}>✓</span>
              <span style={{ fontFamily: S.fontBody, fontSize: '0.88rem', fontWeight: 600, color: S.green }}>
                {t.downloadStarted}
              </span>
            </div>
          )}

          {/* Branding */}
          <div style={{
            paddingTop: 4, borderTop: `1px solid ${S.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <span style={{ fontFamily: S.fontBody, fontSize: '0.68rem', color: S.text3 }}>
              {t.deliveredBy}
            </span>
            <span style={{
              fontFamily: S.fontDisplay, fontSize: '0.78rem',
              color: S.gold, letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>
              Leafilms
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
