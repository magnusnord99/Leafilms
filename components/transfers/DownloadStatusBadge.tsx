import { C } from '@/lib/admin-theme'

type Props = {
  downloadCount: number
  lastDownloadedAt: string | null
}

export function DownloadStatusBadge({ downloadCount, lastDownloadedAt }: Props) {
  if (downloadCount <= 0 || !lastDownloadedAt) {
    return (
      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3 }}>
        Ikke lastet ned ennå
      </span>
    )
  }

  const dateLabel = new Date(lastDownloadedAt).toLocaleDateString('nb-NO', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', fontWeight: 600, color: '#4CAF7D' }}>
      ✓ Lastet ned{downloadCount > 1 ? ` (${downloadCount}x)` : ''} <span style={{ fontWeight: 400, color: C.text3 }}>· {dateLabel}</span>
    </span>
  )
}
