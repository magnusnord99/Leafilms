'use client'

import { useEffect, useState } from 'react'
import { C } from '@/lib/admin-theme'
import { PageHeader, Btn } from '@/components/admin/dashboard/shared'
import { WIDGET_REGISTRY, DEFAULT_WIDGET_ORDER } from '@/components/admin/dashboard/registry'
import { DashboardCustomizePanel } from '@/components/admin/dashboard/DashboardCustomizePanel'
import { getDashboardLayout } from '@/lib/actions/dashboard'
import type { DashboardLayoutItem } from '@/lib/types'

export default function AdminDashboard() {
  const [layout, setLayout] = useState<DashboardLayoutItem[] | null>(null)
  const [customizing, setCustomizing] = useState(false)

  async function loadLayout() {
    const saved = await getDashboardLayout()
    // Legg til widgets fra registeret som ikke finnes i brukerens lagrede oppsett ennå
    // (f.eks. nye widgets lagt til etter at brukeren sist tilpasset dashboardet sitt)
    const known = new Set(saved.map((i) => i.widgetKey))
    const merged = [
      ...saved,
      ...DEFAULT_WIDGET_ORDER.filter((key) => !known.has(key)).map((widgetKey, i) => ({
        widgetKey, position: saved.length + i, enabled: true,
      })),
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

  const visibleWidgets = layout
    .filter((i) => i.enabled)
    .sort((a, b) => a.position - b.position)
    .map((i) => WIDGET_REGISTRY.find((w) => w.key === i.widgetKey))
    .filter((w): w is (typeof WIDGET_REGISTRY)[number] => !!w)

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: '100vh', padding: '32px 32px 48px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        <PageHeader
          title="Dashboard"
          action={
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="secondary" onClick={() => setCustomizing(true)}>Tilpass dashboard</Btn>
              <Btn href="/admin/projects/new">+ Nytt prosjekt</Btn>
            </div>
          }
        />

        {visibleWidgets.length === 0 ? (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '40px 24px', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text3, marginBottom: 16 }}>
              Ingen widgets er valgt. Klikk &quot;Tilpass dashboard&quot; for å velge hva som skal vises.
            </p>
            <Btn onClick={() => setCustomizing(true)}>Tilpass dashboard</Btn>
          </div>
        ) : (
          visibleWidgets.map((widget) => (
            <div key={widget.key} style={{ marginBottom: 40 }}>
              <widget.component />
            </div>
          ))
        )}

      </div>

      {customizing && (
        <DashboardCustomizePanel
          items={layout}
          onClose={() => setCustomizing(false)}
          onSaved={setLayout}
        />
      )}
    </div>
  )
}
