'use client'

import { useEffect, useState } from 'react'
import { C } from '@/lib/admin-theme'
import { PageHeader, Btn } from '@/components/admin/dashboard/shared'
import { DEFAULT_WIDGET_ORDER } from '@/components/admin/dashboard/registry'
import { DashboardGrid } from '@/components/admin/dashboard/DashboardGrid'
import { getDashboardLayout } from '@/lib/actions/dashboard'
import type { DashboardLayoutItem } from '@/lib/types'

export default function AdminDashboard() {
  const [layout, setLayout] = useState<DashboardLayoutItem[] | null>(null)
  const [editing, setEditing] = useState(false)

  async function loadLayout() {
    const saved = await getDashboardLayout()
    // Legg til widgets fra registeret som ikke finnes i brukerens lagrede oppsett ennå
    // (f.eks. nye widgets lagt til etter at brukeren sist tilpasset dashboardet sitt)
    const known = new Set(saved.map((i) => i.widgetKey))
    const missing = DEFAULT_WIDGET_ORDER.filter((key) => !known.has(key))
    const nextPositionInColumn: Record<number, number> = {}
    for (const item of saved) {
      nextPositionInColumn[item.column] = Math.max(nextPositionInColumn[item.column] ?? -1, item.position) + 1
    }
    const merged = [
      ...saved,
      ...missing.map((widgetKey, i) => {
        const column = i % 2
        const position = nextPositionInColumn[column] ?? 0
        nextPositionInColumn[column] = position + 1
        return { widgetKey, column, position }
      }),
    ]
    setLayout(merged)
  }

  useEffect(() => { loadLayout() }, [])

  if (!layout) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text3 }}>Laster...</p>
      </div>
    )
  }

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '32px 32px 48px' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>

        <PageHeader
          title="Dashboard"
          action={
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant={editing ? 'primary' : 'secondary'} onClick={() => setEditing((e) => !e)}>
                {editing ? 'Ferdig' : 'Rediger dashboard'}
              </Btn>
              <Btn href="/admin/projects/new">+ Nytt prosjekt</Btn>
            </div>
          }
        />

        {layout.length === 0 && !editing ? (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '40px 24px', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, marginBottom: 16 }}>
              Ingen widgets er lagt til ennå.
            </p>
            <Btn onClick={() => setEditing(true)}>Rediger dashboard</Btn>
          </div>
        ) : (
          <DashboardGrid items={layout} editing={editing} onChange={setLayout} />
        )}

      </div>
    </div>
  )
}
