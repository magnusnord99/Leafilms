'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui'
import { EquipmentGroupWithItems, PriceCatalogItem } from '@/lib/types'
import { C } from '@/lib/admin-theme'

const CATEGORY_LABELS: Record<string, string> = {
  kamera: 'Kamera',
  objektiver: 'Objektiver',
  lys: 'Lys',
  lyd: 'Lyd',
  utstyr: 'Utstyr',
  post: 'Post',
  transport: 'Transport',
  annet: 'Annet',
}

const label12 = {
  fontFamily: 'var(--font-dm-sans)',
  fontSize: '0.6rem',
  letterSpacing: '0.16em',
  color: C.accent,
  textTransform: 'uppercase' as const,
  fontWeight: 500,
}

const fieldStyle = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 3,
  padding: '8px 12px',
  fontSize: '0.8rem',
  color: C.text,
  fontFamily: 'var(--font-dm-sans)',
  width: '100%',
  outline: 'none',
}

type DraftItem = { catalog_item_id: string; quantity: number }

export function EquipmentGroupsPanel({ catalog }: { catalog: PriceCatalogItem[] }) {
  const [groups, setGroups] = useState<EquipmentGroupWithItems[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [draftItems, setDraftItems] = useState<DraftItem[]>([])
  const [pickerValue, setPickerValue] = useState('')

  async function fetchGroups() {
    const { data } = await supabase
      .from('equipment_groups')
      .select('*, items:equipment_group_items(*, catalog_item:price_catalog(*))')
      .order('name')
    setGroups((data || []) as EquipmentGroupWithItems[])
    setLoading(false)
  }

  useEffect(() => { fetchGroups() }, [])

  const catalogById = new Map(catalog.map(i => [i.id, i]))

  function startCreate() {
    setEditingId(null)
    setName('')
    setDraftItems([])
    setPickerValue('')
    setSaveError(null)
    setShowForm(true)
  }

  function startEdit(group: EquipmentGroupWithItems) {
    setEditingId(group.id)
    setName(group.name)
    setDraftItems(group.items.map(i => ({ catalog_item_id: i.catalog_item_id, quantity: i.quantity })))
    setPickerValue('')
    setSaveError(null)
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setSaveError(null)
  }

  function addDraftItem(catalogItemId: string) {
    if (!catalogItemId) return
    if (draftItems.some(d => d.catalog_item_id === catalogItemId)) return
    setDraftItems(prev => [...prev, { catalog_item_id: catalogItemId, quantity: 1 }])
    setPickerValue('')
  }

  function updateDraftQuantity(catalogItemId: string, quantity: number) {
    setDraftItems(prev => prev.map(d => (d.catalog_item_id === catalogItemId ? { ...d, quantity } : d)))
  }

  function removeDraftItem(catalogItemId: string) {
    setDraftItems(prev => prev.filter(d => d.catalog_item_id !== catalogItemId))
  }

  async function handleSave() {
    if (!name.trim() || draftItems.length === 0) return
    setSaving(true)
    setSaveError(null)

    let groupId = editingId
    if (groupId) {
      const { error } = await supabase.from('equipment_groups').update({ name: name.trim(), updated_at: new Date().toISOString() }).eq('id', groupId)
      if (error) { setSaving(false); setSaveError(`Kunne ikke lagre: ${error.message}`); return }
      await supabase.from('equipment_group_items').delete().eq('group_id', groupId)
    } else {
      const { data, error } = await supabase.from('equipment_groups').insert({ name: name.trim() }).select('id').single()
      if (error || !data) { setSaving(false); setSaveError(`Kunne ikke lagre: ${error?.message}`); return }
      groupId = data.id
    }

    const { error: itemsError } = await supabase.from('equipment_group_items').insert(
      draftItems.map(d => ({ group_id: groupId, catalog_item_id: d.catalog_item_id, quantity: d.quantity }))
    )
    setSaving(false)
    if (itemsError) { setSaveError(`Kunne ikke lagre varer: ${itemsError.message}`); return }

    setShowForm(false)
    setEditingId(null)
    fetchGroups()
  }

  async function handleDelete(id: string) {
    if (confirmDeleteId !== id) { setConfirmDeleteId(id); return }
    setConfirmDeleteId(null)
    await supabase.from('equipment_groups').delete().eq('id', id)
    fetchGroups()
  }

  if (loading) {
    return <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>Laster...</p>
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3 }}>
          Sett sammen katalogvarer til pakker (f.eks. «Liten kamerapakke») som kan legges til et tilbud i én operasjon
        </p>
        <Button variant="primary" size="sm" onClick={startCreate}>+ Ny pakke</Button>
      </div>

      {showForm && (
        <div className="mb-8 p-5 rounded-[3px]" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <p style={{ ...label12, marginBottom: 16 }}>{editingId ? 'Rediger pakke' : 'Ny pakke'}</p>
          <div className="mb-4">
            <label style={{ ...label12, display: 'block', marginBottom: 6 }}>Navn *</label>
            <input
              style={fieldStyle}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="f.eks. Liten kamerapakke"
              autoFocus
            />
          </div>

          <div className="mb-4">
            <label style={{ ...label12, display: 'block', marginBottom: 6 }}>Varer i pakken</label>
            {draftItems.length > 0 && (
              <div className="mb-3" style={{ border: `1px solid ${C.border}`, borderRadius: 3, overflow: 'hidden' }}>
                {draftItems.map((d, i) => {
                  const item = catalogById.get(d.catalog_item_id)
                  return (
                    <div
                      key={d.catalog_item_id}
                      className="flex items-center gap-3 px-3 py-2"
                      style={{ background: C.bg, borderBottom: i < draftItems.length - 1 ? `1px solid ${C.border}` : 'none' }}
                    >
                      <span style={{ flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text }}>
                        {item?.name ?? 'Ukjent vare'}
                      </span>
                      <input
                        type="number"
                        min={1}
                        style={{ ...fieldStyle, width: 64, textAlign: 'right' }}
                        value={d.quantity}
                        onChange={e => updateDraftQuantity(d.catalog_item_id, Number(e.target.value) || 1)}
                      />
                      <button
                        type="button"
                        onClick={() => removeDraftItem(d.catalog_item_id)}
                        style={{ color: C.text3, background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}
                        title="Fjern"
                      >×</button>
                    </div>
                  )
                })}
              </div>
            )}
            <select
              style={fieldStyle}
              value={pickerValue}
              onChange={e => addDraftItem(e.target.value)}
            >
              <option value="">+ Legg til vare fra katalogen...</option>
              {Object.entries(CATEGORY_LABELS).map(([cat, catLabel]) => {
                const options = catalog.filter(i => i.category === cat && !draftItems.some(d => d.catalog_item_id === i.id))
                if (options.length === 0) return null
                return (
                  <optgroup key={cat} label={catLabel}>
                    {options.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </optgroup>
                )
              })}
            </select>
          </div>

          {saveError && (
            <div style={{ background: 'rgba(224,85,85,0.08)', border: '1px solid rgba(224,85,85,0.25)', borderRadius: 3, padding: '8px 12px', marginBottom: 12, fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: '#E05555' }}>
              {saveError}
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || !name.trim() || draftItems.length === 0}>
              {saving ? 'Lagrer...' : editingId ? 'Lagre endringer' : 'Opprett pakke'}
            </Button>
            <Button variant="ghost" size="sm" onClick={cancelForm}>Avbryt</Button>
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="p-10 text-center" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 3 }}>
          <p style={{ color: C.text3, fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem' }}>Ingen pakker ennå</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(group => (
            <div key={group.id} style={{ border: `1px solid ${C.border}`, borderRadius: 3, overflow: 'hidden' }}>
              <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ background: C.surface }}>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: C.text }}>{group.name}</span>
                <div className="flex gap-2 flex-shrink-0" onMouseLeave={() => { if (confirmDeleteId === group.id) setConfirmDeleteId(null) }}>
                  <Button variant="ghost" size="sm" onClick={() => startEdit(group)}>Rediger</Button>
                  <Button variant="danger" size="sm" onClick={() => handleDelete(group.id)}>
                    {confirmDeleteId === group.id ? 'Sikker?' : 'Slett'}
                  </Button>
                </div>
              </div>
              <div style={{ padding: '10px 16px', background: C.bg }}>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
                  {group.items.map(i => `${i.quantity}× ${i.catalog_item?.name ?? 'Ukjent vare'}`).join(' · ') || 'Ingen varer'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
