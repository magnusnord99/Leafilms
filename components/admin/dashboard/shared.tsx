'use client'

import Link from 'next/link'
import { C } from '@/lib/admin-theme'

export const WEEKDAY_LABELS = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn']
export const MONTH_LABELS = [
  'Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Desember',
]

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 32 }}>
      <div>
        <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.5rem', fontWeight: 600, color: C.text, lineHeight: 1.2, marginBottom: subtitle ? 4 : 0 }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3 }}>{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  )
}

export function WidgetHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.text2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {title}
      </h2>
      {action}
    </div>
  )
}

export function Btn({ href, onClick, children, variant = 'primary', size = 'sm' }: {
  href?: string
  onClick?: () => void
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
}) {
  const styles: React.CSSProperties = {
    fontFamily: 'var(--font-dm-sans)',
    fontSize: size === 'sm' ? '0.75rem' : '0.8rem',
    fontWeight: 500,
    padding: size === 'sm' ? '6px 12px' : '8px 16px',
    borderRadius: 6,
    cursor: 'pointer',
    border: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    textDecoration: 'none',
    transition: 'opacity 0.12s',
    ...(variant === 'primary' && { background: C.accent, color: '#fff' }),
    ...(variant === 'secondary' && { background: C.surface2, color: C.text2, border: `1px solid ${C.border}` }),
    ...(variant === 'ghost' && { background: 'transparent', color: C.text3 }),
    ...(variant === 'danger' && { background: 'transparent', color: C.danger }),
  }
  if (href) return <Link href={href} style={styles}>{children}</Link>
  return <button onClick={onClick} style={styles}>{children}</button>
}
