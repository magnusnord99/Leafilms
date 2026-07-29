import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { getTransfers } from '@/lib/actions/transfers'
import { formatFileSize } from '@/lib/utils/file-size'

const C = {
  bg: '#181920', surface: '#21212D', surface2: '#2A2A38',
  border: '#3C3C52', text: '#EEEEF2', text2: '#B4B4CC', text3: '#8484A0',
  accent: '#7C5CFC', accentBg: 'rgba(124,92,252,0.10)',
  danger: '#E05555',
}

function StatusBadge({ transfer }: { transfer: { status: string; expires_at: string | null; download_count: number; max_downloads: number | null } }) {
  const isExpired = transfer.expires_at && new Date(transfer.expires_at) < new Date()
  const isMaxed = transfer.max_downloads != null && transfer.download_count >= transfer.max_downloads

  if (transfer.status === 'deleted') {
    return <span style={{ fontSize: '0.68rem', fontWeight: 600, color: C.danger }}>Slettet</span>
  }
  if (isExpired || isMaxed) {
    return <span style={{ fontSize: '0.68rem', fontWeight: 600, color: C.text3 }}>Utløpt</span>
  }
  return <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#4CAF7D' }}>Aktiv</span>
}

function ExpiryCell({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) return <span style={{ color: C.text3, fontSize: '0.78rem' }}>Aldri</span>
  const d = new Date(expiresAt)
  const isExpired = d < new Date()
  const diff = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  const label = isExpired
    ? 'Utløpt'
    : diff === 0
    ? 'I dag'
    : diff === 1
    ? 'I morgen'
    : `${diff} dager`
  return (
    <span style={{ fontSize: '0.78rem', color: isExpired ? C.danger : diff <= 2 ? '#D4863A' : C.text2 }}>
      {label}
    </span>
  )
}

export default async function TransfersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const transfers = await getTransfers()

  const totalActive = transfers.filter(t => {
    if (t.status === 'deleted') return false
    if (t.expires_at && new Date(t.expires_at) < new Date()) return false
    return true
  }).length

  const totalDownloads = transfers.reduce((s, t) => s + t.download_count, 0)

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://leafilms.no'

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '32px 24px' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.2rem', fontWeight: 700, color: C.text, marginBottom: 4 }}>
              Leveranser
            </h1>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>
              Send store filer direkte til kunder — erstatter Filemail
            </p>
          </div>
          <Link href="/admin/transfers/new" style={{ textDecoration: 'none' }}>
            <button style={{
              background: C.accent, color: '#fff', border: 'none',
              borderRadius: 8, padding: '9px 18px', cursor: 'pointer',
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600,
              whiteSpace: 'nowrap',
            }}>
              + Ny leveranse
            </button>
          </Link>
        </div>

        {/* Statistikk-kort */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 28 }}>
          {[
            { label: 'Aktive leveranser', value: totalActive },
            { label: 'Totale leveranser', value: transfers.length },
            { label: 'Totale nedlastinger', value: totalDownloads },
          ].map(stat => (
            <div key={stat.label} style={{
              background: C.surface, border: `1px solid ${C.border}`,
              borderRadius: 10, padding: '16px 18px',
            }}>
              <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.4rem', fontWeight: 700, color: C.text, marginBottom: 4 }}>
                {stat.value}
              </div>
              <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Leveranseliste */}
        {transfers.length === 0 ? (
          <div style={{
            background: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: '64px 24px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>📦</div>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.88rem', color: C.text2, marginBottom: 6 }}>
              Ingen leveranser ennå
            </p>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, marginBottom: 20 }}>
              Send store filer til kunder uten å bruke Filemail eller WeTransfer.
            </p>
            <Link href="/admin/transfers/new" style={{ textDecoration: 'none' }}>
              <button style={{
                background: C.accent, color: '#fff', border: 'none',
                borderRadius: 8, padding: '10px 20px', cursor: 'pointer',
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600,
              }}>
                Send din første fil
              </button>
            </Link>
          </div>
        ) : (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Fil', 'Mottaker', 'Størrelse', 'Nedlastinger', 'Utløper', 'Status', ''].map(h => (
                    <th key={h} style={{
                      padding: '10px 16px', textAlign: 'left',
                      fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      color: C.text3, fontWeight: 600,
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transfers.map((t, i) => {
                  const token = t.primary_link?.token
                  const downloadUrl = token ? `${siteUrl}/d/${token}` : null
                  return (
                    <tr
                      key={t.id}
                      style={{ borderBottom: i < transfers.length - 1 ? `1px solid ${C.border}` : 'none' }}
                    >
                      {/* Fil */}
                      <td style={{ padding: '13px 16px', maxWidth: 260 }}>
                        <div style={{
                          fontFamily: 'var(--font-dm-sans)', fontSize: '0.84rem',
                          fontWeight: 600, color: C.text,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {t.title || t.filename}
                        </div>
                        {t.title && (
                          <div style={{
                            fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem',
                            color: C.text3, marginTop: 2,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>
                            {t.filename}
                          </div>
                        )}
                      </td>

                      {/* Mottaker */}
                      <td style={{ padding: '13px 16px' }}>
                        <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text2 }}>
                          {t.primary_link?.recipient_name || t.primary_link?.recipient_email || (
                            <span style={{ color: C.text3 }}>—</span>
                          )}
                        </div>
                        {t.primary_link?.recipient_name && t.primary_link.recipient_email && (
                          <div style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginTop: 1 }}>
                            {t.primary_link.recipient_email}
                          </div>
                        )}
                      </td>

                      {/* Størrelse */}
                      <td style={{ padding: '13px 16px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text2 }}>
                          {formatFileSize(t.filesize_bytes)}
                        </span>
                      </td>

                      {/* Nedlastinger */}
                      <td style={{ padding: '13px 16px' }}>
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text2 }}>
                          {t.download_count}{t.max_downloads != null ? ` / ${t.max_downloads}` : ''}
                        </span>
                      </td>

                      {/* Utløper */}
                      <td style={{ padding: '13px 16px' }}>
                        <ExpiryCell expiresAt={t.expires_at} />
                      </td>

                      {/* Status */}
                      <td style={{ padding: '13px 16px' }}>
                        <StatusBadge transfer={t} />
                      </td>

                      {/* Handlinger */}
                      <td style={{ padding: '13px 16px' }}>
                        {downloadUrl && (
                          <CopyLinkButton url={downloadUrl} />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function CopyLinkButton({ url }: { url: string }) {
  return (
    <form action={async () => { 'use server' }}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem',
          color: C.accent, textDecoration: 'none',
          padding: '4px 10px', border: `1px solid rgba(124,92,252,0.3)`,
          borderRadius: 6, background: C.accentBg, whiteSpace: 'nowrap',
        }}
      >
        Åpne lenke
      </a>
    </form>
  )
}
