'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button, Input } from '@/components/ui'
import { PriceCatalogItem } from '@/lib/types'
import { C } from '@/lib/admin-theme'

const CATEGORIES = [
  { value: 'kamera', label: 'Kamera' },
  { value: 'lys', label: 'Lys' },
  { value: 'lyd', label: 'Lyd' },
  { value: 'utstyr', label: 'Utstyr' },
  { value: 'transport', label: 'Transport' },
  { value: 'post', label: 'Post-produksjon' },
  { value: 'annet', label: 'Annet' },
]

const UNITS = ['stk', 'per dag', 'per time', 'per uke', 'per natt']

type FormData = {
  name: string
  category: string
  default_price: string
  unit: string
}

const emptyForm: FormData = { name: '', category: 'utstyr', default_price: '', unit: 'per dag' }

function formatNOK(amount: number) {
  return new Intl.NumberFormat('no-NO', { style: 'currency', currency: 'NOK', minimumFractionDigits: 0 }).format(amount)
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

export default function PricesPage() {
  const [items, setItems] = useState<PriceCatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [activeCategory, setActiveCategory] = useState<string>('alle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => { fetchItems() }, [])

  async function fetchItems() {
    const { data } = await supabase
      .from('price_catalog')
      .select('*')
      .order('category')
      .order('name')
    setItems((data || []) as PriceCatalogItem[])
    setLoading(false)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    setSaveError(null)
    const record = {
      name: form.name.trim(),
      category: form.category,
      default_price: Number(form.default_price) || 0,
      unit: form.unit,
    }
    const { error } = editingId
      ? await supabase.from('price_catalog').update(record).eq('id', editingId)
      : await supabase.from('price_catalog').insert(record)

    setSaving(false)
    if (error) {
      setSaveError(`Kunne ikke lagre: ${error.message}`)
      return
    }
    setEditingId(null)
    setShowAddForm(false)
    setForm(emptyForm)
    fetchItems()
  }

  async function handleDelete(id: string) {
    if (confirmDeleteId !== id) { setConfirmDeleteId(id); return }
    setConfirmDeleteId(null)
    await supabase.from('price_catalog').delete().eq('id', id)
    fetchItems()
  }

  function startEdit(item: PriceCatalogItem) {
    setEditingId(item.id)
    setForm({
      name: item.name,
      category: item.category,
      default_price: String(item.default_price),
      unit: item.unit,
    })
    setShowAddForm(true)
  }

  function cancelForm() {
    setEditingId(null)
    setShowAddForm(false)
    setForm(emptyForm)
    setSaveError(null)
  }

  const filtered = activeCategory === 'alle'
    ? items
    : items.filter(i => i.category === activeCategory)

  const grouped: Record<string, PriceCatalogItem[]> = {}
  filtered.forEach(item => {
    if (!grouped[item.category]) grouped[item.category] = []
    grouped[item.category].push(item)
  })

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: C.bg }}>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Laster...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 sm:p-8 md:p-12" style={{ background: C.bg, color: C.text }}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-6 mb-10">
          <div>
            <div className="flex items-center gap-4 mb-4">
              <div style={{ width: 32, height: 1, background: C.accent }} />
              <span style={label12}>Standardpriser</span>
            </div>
            <h1 style={{
              fontFamily: 'var(--font-cormorant)',
              fontSize: 'clamp(2rem, 4vw, 3rem)',
              fontWeight: 300,
              fontStyle: 'italic',
              color: C.text,
              lineHeight: 1,
            }}>Priskatalog</h1>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.7rem', color: C.text3, marginTop: 8 }}>
              Standardpriser brukes som utgangspunkt i pristilbud og kan alltid justeres per tilbud
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => { cancelForm(); setShowAddForm(true) }}>
            + Nytt element
          </Button>
        </div>

        {/* Add/edit form */}
        {showAddForm && (
          <div
            className="mb-8 p-5 rounded-[3px]"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}
          >
            <p style={{ ...label12, marginBottom: 16 }}>{editingId ? 'Rediger element' : 'Nytt element'}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label style={{ ...label12, display: 'block', marginBottom: 6 }}>Navn *</label>
                <input
                  style={fieldStyle}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="f.eks. Aputure 300D"
                  autoFocus
                />
              </div>
              <div>
                <label style={{ ...label12, display: 'block', marginBottom: 6 }}>Kategori</label>
                <select
                  style={fieldStyle}
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                >
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ ...label12, display: 'block', marginBottom: 6 }}>Standardpris (NOK)</label>
                <input
                  style={fieldStyle}
                  type="number"
                  value={form.default_price}
                  onChange={e => setForm(f => ({ ...f, default_price: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div>
                <label style={{ ...label12, display: 'block', marginBottom: 6 }}>Enhet</label>
                <select
                  style={fieldStyle}
                  value={form.unit}
                  onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                >
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
            {saveError && (
              <div style={{ background: 'rgba(224,85,85,0.08)', border: '1px solid rgba(224,85,85,0.25)', borderRadius: 3, padding: '8px 12px', marginBottom: 12, fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: '#E05555' }}>
                {saveError}
              </div>
            )}
            <div className="flex gap-3">
              <Button variant="primary" size="sm" onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? 'Lagrer...' : editingId ? 'Lagre endringer' : 'Legg til'}
              </Button>
              <Button variant="ghost" size="sm" onClick={cancelForm}>Avbryt</Button>
            </div>
          </div>
        )}

        {/* Category filter tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {[{ value: 'alle', label: 'Alle' }, ...CATEGORIES].map(cat => (
            <button
              key={cat.value}
              onClick={() => setActiveCategory(cat.value)}
              style={{
                fontFamily: 'var(--font-dm-sans)',
                fontSize: '0.6rem',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                padding: '5px 12px',
                borderRadius: 2,
                border: `1px solid ${activeCategory === cat.value ? C.accent : C.border}`,
                background: activeCategory === cat.value ? C.accentBg : 'transparent',
                color: activeCategory === cat.value ? C.accent : C.text3,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Items grouped by category */}
        {Object.keys(grouped).length === 0 ? (
          <div className="p-10 text-center" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 3 }}>
            <p style={{ color: C.text3, fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem' }}>
              Ingen elementer ennå
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([cat, catItems]) => {
              const catLabel = CATEGORIES.find(c => c.value === cat)?.label || cat
              return (
                <div key={cat} style={{ border: `1px solid ${C.border}`, borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ background: C.surface, padding: '10px 16px', borderBottom: `1px solid ${C.border}` }}>
                    <span style={label12}>{catLabel}</span>
                  </div>
                  {catItems.map((item, i) => (
                    <div
                      key={item.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                      style={{
                        background: C.bg,
                        borderBottom: i < catItems.length - 1 ? '1px solid #1A1713' : 'none',
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text }}>
                          {item.name}
                        </span>
                        <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, marginLeft: 12 }}>
                          {item.unit}
                        </span>
                      </div>
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: C.accent, fontWeight: 500, minWidth: 80, textAlign: 'right' }}>
                        {item.default_price > 0 ? formatNOK(item.default_price) : '—'}
                      </span>
                      <div className="flex gap-2 flex-shrink-0" onMouseLeave={() => { if (confirmDeleteId === item.id) setConfirmDeleteId(null) }}>
                        <Button variant="ghost" size="sm" onClick={() => startEdit(item)}>Rediger</Button>
                        <Button variant="danger" size="sm" onClick={() => handleDelete(item.id)}>
                          {confirmDeleteId === item.id ? 'Sikker?' : 'Slett'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
