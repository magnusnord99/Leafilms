import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { getTransferByToken } from '@/lib/actions/transfers'
import DownloadClient from './DownloadClient'
import { S } from '@/lib/client-theme'

type Props = { params: Promise<{ token: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params
  const result = await getTransferByToken(token)
  if (!result) return { title: 'Leafilms' }

  return {
    title: `${result.transfer.title || result.transfer.filename} — Leafilms`,
    description: result.transfer.language === 'en'
      ? 'Download the file sent from Leafilms.'
      : 'Last ned filen sendt fra Leafilms.',
    robots: { index: false, follow: false },
  }
}

export default async function DownloadPage({ params }: Props) {
  const { token } = await params
  const result = await getTransferByToken(token)

  if (!result) {
    return (
      <div style={{
        minHeight: '100dvh', background: S.bg,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}>
        <div style={{
          background: S.surface, border: `1px solid ${S.border}`,
          borderRadius: S.radiusLg, padding: '48px 36px',
          textAlign: 'center', maxWidth: 400,
        }}>
          <div style={{ fontSize: '2rem', marginBottom: 16 }}>🔒</div>
          <h1 style={{
            fontFamily: S.fontBody, fontSize: '1rem', fontWeight: 700,
            color: S.text, marginBottom: 8,
          }}>
            Lenken er ikke tilgjengelig
          </h1>
          <p style={{ fontFamily: S.fontBody, fontSize: '0.82rem', color: S.text2, lineHeight: '1.6' }}>
            Filen kan ha utløpt, nådd maks antall nedlastinger, eller blitt slettet.
            Ta kontakt med avsenderen for en ny lenke.
          </p>
          {/* Lenken finnes ikke → språket er ukjent, vis også engelsk */}
          <p lang="en" style={{ fontFamily: S.fontBody, fontSize: '0.78rem', color: S.text3, lineHeight: '1.6', marginTop: 10 }}>
            This link is no longer available — the file may have expired, reached its
            download limit, or been deleted. Contact the sender for a new link.
          </p>
          <div style={{
            marginTop: 24, paddingTop: 20,
            borderTop: `1px solid ${S.border}`,
          }}>
            <span style={{
              fontFamily: S.fontDisplay, fontSize: '0.9rem',
              color: S.gold, letterSpacing: '0.14em', textTransform: 'uppercase',
            }}>
              Leafilms
            </span>
          </div>
        </div>
      </div>
    )
  }

  const { transfer } = result

  return (
    <DownloadClient
      filename={transfer.filename}
      filesize={transfer.filesize_bytes}
      message={transfer.message}
      expiresAt={transfer.expires_at}
      hasPassword={!!transfer.password_hash}
      token={token}
      language={transfer.language === 'en' ? 'en' : 'no'}
    />
  )
}
