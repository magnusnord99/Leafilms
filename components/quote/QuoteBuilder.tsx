'use client'

import { useState, useCallback, useRef } from 'react'
import { QuoteBuilderData, CrewMember, QuoteBuilderItem, TeamMember, Customer, PriceCatalogItem, DiscountFactor } from '@/lib/types'
import { calculateQuoteTotals } from '@/lib/quote-builder-utils'
import { Button } from '@/components/ui'
import { C } from '@/lib/admin-theme'

const DEFAULT_TERMS = `Leafilms vil være ansvarlig for planleggingen, produksjonen og leveringen av prosjektet slik det er beskrevet i dette tilbudet.
Prosjektets omfang, tidslinje og leveranser avtales før produksjonen starter. Eventuelle endringer i omfanget underveis kan medføre ekstra kostnader.
Reise-, overnattings- og oppholdsutgifter for teamet er inkludert i budsjettet med mindre annet er spesifisert.
Dersom uforutsette omstendigheter (f.eks. ekstremvær eller andre faktorer utenfor Leafilms' kontroll) hindrer produksjonen i å gjennomføres som planlagt, vil alternative løsninger utarbeides i samråd med kunden. Eventuelle forsinkelser eller omlegginger kan medføre ekstra kostnader.
Kansellering innen 14 dager før startdato: 50 % av den avtalte prisen vil bli fakturert.
Kansellering innen 48 timer før startdato: 100 % av den avtalte prisen vil bli fakturert.
Leafilms beholder full opphavsrett til alt produsert materiale. Kunden gis bruksrettigheter for det avtalte formålet og prosjektet. Videre salg eller distribusjon er ikke tillatt uten skriftlig samtykke fra Leafilms. Leafilms må krediteres i henhold til bransjestandarder der materialet brukes, der det er praktisk mulig.
Alt materiale, inkludert opptak og prosjektfiler, vil bli levert til kunden som avtalt. Lagring og arkivering av materialet utover leveringsdatoen er kundens ansvar.
Fakturaen deles opp i to like betalinger. Den første halvparten faktureres ved signering av produksjonsavtalen, og den andre halvparten faktureres etter siste produksjonsdag. Vær oppmerksom på at forsinkede betalinger kan medføre ekstra gebyrer.`

export function createEmptyBuilderData(projectName = ''): QuoteBuilderData {
  return {
    version: 'V1',
    quoteDate: new Date().toISOString().split('T')[0],
    projectName,
    reference: 'Video produksjon',
    clientContact: '',
    customerNumber: '',
    ourContact: 'Bea Valand',
    paymentInfo: '14 dager',
    deliveryDate: '',
    deliveryDescription: '',
    terms: DEFAULT_TERMS,
    language: 'NO',
    startupCrew: [],
    shootDays: 1,
    crew: [],
    equipment: [],
    postProductionCrew: [],
    postProduction: [],
    otherCosts: [],
    licensing: [],
    vatRate: 25,
    discountFactor: 0,
    includeVat: true,
    companyEmail: 'eivind@leafilms.no',
  }
}

function newId() { return Math.random().toString(36).slice(2) }

function formatNOK(amount: number) {
  return new Intl.NumberFormat('no-NO', { style: 'currency', currency: 'NOK', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)
}

const inputBase: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  borderBottom: `1px solid ${C.border}`,
  outline: 'none',
  padding: '4px',
  fontSize: '0.8rem',
  color: C.text,
  width: '100%',
  fontFamily: 'var(--font-dm-sans)',
  transition: 'border-color 0.15s',
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 3,
  padding: '8px 12px',
  fontSize: '0.8rem',
  color: C.text,
  fontFamily: 'var(--font-dm-sans)',
  outline: 'none',
  transition: 'border-color 0.15s',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.62rem',
  color: C.text2,
  marginBottom: 4,
  fontFamily: 'var(--font-dm-sans)',
  letterSpacing: '0.05em',
}

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '0.58rem',
  fontWeight: 600,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: C.accent,
  fontFamily: 'var(--font-dm-sans)',
}

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 12,
  paddingBottom: 8,
  borderBottom: `1px solid ${C.border}`,
}

// ─── Shared: Price catalog picker ─────────────────────────────────────────────
const CATEGORY_LABELS: Record<string, string> = {
  kamera: 'Kamera',
  lys: 'Lys',
  lyd: 'Lyd',
  utstyr: 'Utstyr',
  post: 'Post',
  transport: 'Transport',
  annet: 'Annet',
}

function CatalogPicker({
  catalog,
  onSelect,
  filterCategories,
}: {
  catalog: PriceCatalogItem[]
  onSelect: (item: PriceCatalogItem) => void
  filterCategories?: string[]
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = catalog
    .filter(i => !filterCategories || filterCategories.includes(i.category))
    .filter(i => i.name.toLowerCase().includes(search.toLowerCase()))

  const useGrouped = (filterCategories?.length ?? 0) >= 2

  const grouped: { cat: string; items: PriceCatalogItem[] }[] = useGrouped
    ? (filterCategories ?? [])
        .map(cat => ({ cat, items: filtered.filter(i => i.category === cat) }))
        .filter(g => g.items.length > 0)
    : []

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(o => !o)}>
        Fra katalog {open ? '▲' : '▼'}
      </Button>
      {open && (
        <div style={{
          position: 'absolute',
          zIndex: 50,
          top: '100%',
          left: 0,
          marginTop: 4,
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 3,
          minWidth: 280,
          maxHeight: 320,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {catalog.length > 0 && (
            <div style={{ padding: 8, flexShrink: 0 }}>
              <input
                autoFocus
                style={{ ...fieldStyle, background: C.bg, padding: '6px 12px', fontSize: '0.78rem' }}
                placeholder="Søk..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          )}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {catalog.length === 0 ? (
              <p style={{ padding: '12px 16px', fontSize: '0.72rem', color: C.text3, fontFamily: 'var(--font-dm-sans)' }}>
                Ingen elementer i katalogen ennå.{' '}
                <a href="/admin/prices" style={{ color: C.accent }} target="_blank">Legg til i Admin → Priskatalog</a>
              </p>
            ) : filtered.length === 0 ? (
              <p style={{ padding: '12px 16px', fontSize: '0.72rem', color: C.text3, fontFamily: 'var(--font-dm-sans)' }}>Ingen treff</p>
            ) : useGrouped ? (
              grouped.map(({ cat, items }) => (
                <div key={cat}>
                  <div style={{
                    padding: '6px 16px 4px',
                    fontSize: '0.58rem',
                    fontWeight: 600,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase' as const,
                    color: C.text3,
                    fontFamily: 'var(--font-dm-sans)',
                    borderTop: `1px solid ${C.border}`,
                  }}>
                    {CATEGORY_LABELS[cat] ?? cat}
                  </div>
                  {items.map(item => (
                    <CatalogItem key={item.id} item={item} onSelect={() => { onSelect(item); setOpen(false); setSearch('') }} />
                  ))}
                </div>
              ))
            ) : (
              filtered.map(item => (
                <CatalogItem key={item.id} item={item} onSelect={() => { onSelect(item); setOpen(false); setSearch('') }} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function CatalogItem({ item, onSelect }: { item: PriceCatalogItem; onSelect: () => void }) {
  return (
    <button
      type="button"
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '9px 16px',
        fontSize: '0.78rem',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'var(--font-dm-sans)',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = C.surface2}
      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}
      onClick={onSelect}
    >
      <span style={{ color: C.text }}>{item.name}</span>
      <span style={{ color: C.accent, fontSize: '0.72rem', marginLeft: 12, whiteSpace: 'nowrap' }}>
        {item.default_price.toLocaleString('nb-NO')} {item.unit}
      </span>
    </button>
  )
}

// ─── Customer selector ────────────────────────────────────────────────────────
function CustomerSelector({
  customers, selectedCustomerId, onSelect,
}: { customers: Customer[]; selectedCustomerId: string; onSelect: (c: Customer | null) => void }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.company?.toLowerCase().includes(search.toLowerCase())
  )
  const selected = customers.find(c => c.id === selectedCustomerId)
  return (
    <div style={{ position: 'relative' }}>
      <label style={labelStyle}>Kunde</label>
      <button type="button"
        style={{ ...fieldStyle, textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
        onClick={() => setOpen(o => !o)}>
        <span style={{ color: selected ? C.text : C.text3 }}>
          {selected ? `${selected.name}${selected.customer_number ? ` — #${selected.customer_number}` : ''}` : 'Velg kunde...'}
        </span>
        <span style={{ color: C.text2, fontSize: '0.72rem', marginLeft: 8 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute',
          zIndex: 50,
          top: '100%',
          left: 0,
          right: 0,
          marginTop: 4,
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 3,
          maxHeight: 260,
          overflow: 'hidden',
        }}>
          <div style={{ padding: 8 }}>
            <input autoFocus
              style={{ ...fieldStyle, background: C.bg, padding: '6px 12px', fontSize: '0.78rem' }}
              placeholder="Søk..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 200 }}>
            <button type="button"
              style={{ width: '100%', textAlign: 'left', padding: '10px 16px', fontSize: '0.8rem', color: C.text2, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-dm-sans)', transition: 'background 0.1s' }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = C.surface2}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}
              onClick={() => { onSelect(null); setOpen(false); setSearch('') }}>Ingen kunde valgt</button>
            {filtered.map(c => (
              <button key={c.id} type="button"
                style={{ width: '100%', textAlign: 'left', padding: '10px 16px', fontSize: '0.8rem', color: c.id === selectedCustomerId ? C.accent : C.text, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-dm-sans)', transition: 'background 0.1s' }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = C.surface2}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}
                onClick={() => { onSelect(c); setOpen(false); setSearch('') }}>
                <span>{c.name}</span>
                {c.customer_number && <span style={{ color: C.accent, marginLeft: 8, fontSize: '0.72rem' }}>#{c.customer_number}</span>}
                {c.company && <span style={{ color: C.text2, marginLeft: 8, fontSize: '0.72rem' }}>{c.company}</span>}
              </button>
            ))}
            {filtered.length === 0 && <p style={{ padding: '12px 16px', fontSize: '0.72rem', color: C.text3, fontFamily: 'var(--font-dm-sans)' }}>Ingen treff</p>}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Crew section (shared between Mannskap and Post-produksjon) ────────────────
function CrewSection({
  label, crew, teamMembers, catalog, onChange,
}: {
  label: string
  crew: CrewMember[]
  teamMembers: TeamMember[]
  catalog: PriceCatalogItem[]
  onChange: (crew: CrewMember[]) => void
}) {
  const [libraryOpen, setLibraryOpen] = useState(false)
  const update = (id: string, field: keyof CrewMember, value: string | number) =>
    onChange(crew.map(m => (m.id === id ? { ...m, [field]: value } : m)))
  const addManual = () => onChange([...crew, { id: newId(), role: '', name: '', dailyRate: 0, days: 1 }])
  const addFromLibrary = (member: TeamMember) => {
    onChange([...crew, { id: newId(), role: member.role, name: member.name, dailyRate: member.daily_rate ?? 0, days: 1 }])
  }
  const remove = (id: string) => onChange(crew.filter(m => m.id !== id))
  const alreadyAdded = new Set(crew.map(m => m.name))

  return (
    <div>
      <div style={sectionHeaderStyle}>
        <span style={sectionLabelStyle}>{label}</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {teamMembers.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setLibraryOpen(o => !o)} type="button">
              Fra teambibliotek {libraryOpen ? '▲' : '▼'}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={addManual} type="button">+ Manuell</Button>
        </div>
      </div>

      {libraryOpen && (
        <div style={{ marginBottom: 16, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 3, overflow: 'hidden' }}>
          <p style={{ padding: '12px 16px 4px', fontSize: '0.58rem', color: C.text2, letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: 'var(--font-dm-sans)' }}>Teambibliotek</p>
          {teamMembers.map(member => {
            const added = alreadyAdded.has(member.name)
            return (
              <button key={member.id} type="button" disabled={added}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', fontSize: '0.8rem', background: 'transparent', border: 'none', cursor: added ? 'not-allowed' : 'pointer', opacity: added ? 0.4 : 1, fontFamily: 'var(--font-dm-sans)', transition: 'background 0.1s' }}
                onMouseEnter={e => { if (!added) (e.currentTarget as HTMLButtonElement).style.background = C.surface2 }}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}
                onClick={() => { if (!added) { addFromLibrary(member); setLibraryOpen(false) } }}>
                <div style={{ textAlign: 'left' }}>
                  <span style={{ color: C.text }}>{member.name}</span>
                  <span style={{ color: C.text2, marginLeft: 8, fontSize: '0.72rem' }}>{member.role}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {member.daily_rate
                    ? <span style={{ color: C.accent, fontSize: '0.72rem' }}>{formatNOK(member.daily_rate)}/dag</span>
                    : <span style={{ color: C.text3, fontSize: '0.72rem' }}>ingen dagsats</span>}
                  {added && <span style={{ color: C.text3, fontSize: '0.72rem', marginLeft: 8 }}>lagt til</span>}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {crew.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Rolle', 'Navn', 'Dagsats', 'Dager', 'Total', ''].map((h, i) => (
                  <th key={h} style={{ textAlign: i >= 2 && i < 5 ? 'right' : i === 5 ? 'center' : 'left', paddingBottom: 8, paddingLeft: 4, fontSize: '0.62rem', color: C.text2, fontWeight: 400, fontFamily: 'var(--font-dm-sans)', whiteSpace: 'nowrap', width: i === 5 ? 24 : 'auto' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {crew.map(m => (
                <tr key={m.id} className="group">
                  <td style={{ padding: '4px 8px 4px 0' }}><input style={inputBase} value={m.role} onChange={e => update(m.id, 'role', e.target.value)} placeholder="Rolle" /></td>
                  <td style={{ padding: '4px 8px 4px 0' }}><input style={inputBase} value={m.name} onChange={e => update(m.id, 'name', e.target.value)} placeholder="Navn" /></td>
                  <td style={{ padding: '4px 8px 4px 0' }}><input style={{ ...inputBase, textAlign: 'right' }} type="number" value={m.dailyRate || ''} onChange={e => update(m.id, 'dailyRate', Number(e.target.value))} placeholder="0" /></td>
                  <td style={{ padding: '4px 8px 4px 0' }}><input style={{ ...inputBase, textAlign: 'right' }} type="number" min={0.5} step={0.5} value={m.days || ''} onChange={e => update(m.id, 'days', Number(e.target.value))} /></td>
                  <td style={{ padding: '4px 8px 4px 0', textAlign: 'right', color: C.text, whiteSpace: 'nowrap' }}>{formatNOK(m.dailyRate * m.days)}</td>
                  <td style={{ padding: 4 }}>
                    <button type="button" onClick={() => remove(m.id)} style={{ color: C.text3, background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, transition: 'opacity 0.1s, color 0.1s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = C.danger }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.text3 }}
                      className="opacity-0 group-hover:opacity-100"
                      title="Fjern">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {crew.length === 0 && !libraryOpen && <p style={{ color: C.text3, fontSize: '0.72rem', padding: '8px 0', fontFamily: 'var(--font-dm-sans)' }}>Ingen lagt til ennå</p>}
    </div>
  )
}

// ─── Item section (equipment, other costs, licensing) ─────────────────────────
function ItemSection({
  label, items, catalog, catalogCategories, onChange, addLabel = '+ Legg til', defaultQuantity = 1,
}: {
  label: string
  items: QuoteBuilderItem[]
  catalog: PriceCatalogItem[]
  catalogCategories?: string[]
  onChange: (items: QuoteBuilderItem[]) => void
  addLabel?: string
  defaultQuantity?: number
}) {
  const update = (id: string, field: keyof QuoteBuilderItem, value: string | number) =>
    onChange(items.map(i => (i.id === id ? { ...i, [field]: value } : i)))
  const add = () => onChange([...items, { id: newId(), description: '', quantity: defaultQuantity, unitPrice: 0 }])
  const addFromCatalog = (item: PriceCatalogItem) =>
    onChange([...items, { id: newId(), description: item.name, quantity: defaultQuantity, unitPrice: item.default_price }])
  const remove = (id: string) => onChange(items.filter(i => i.id !== id))

  return (
    <div>
      <div style={sectionHeaderStyle}>
        <span style={sectionLabelStyle}>{label}</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <CatalogPicker catalog={catalog} filterCategories={catalogCategories} onSelect={addFromCatalog} />
          <Button size="sm" variant="ghost" onClick={add} type="button">{addLabel}</Button>
        </div>
      </div>

      {items.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Beskrivelse', 'Antall', 'Stk.pris', 'Total', ''].map((h, i) => (
                  <th key={h} style={{ textAlign: i >= 1 && i < 4 ? 'right' : i === 4 ? 'center' : 'left', paddingBottom: 8, paddingLeft: 4, fontSize: '0.62rem', color: C.text2, fontWeight: 400, fontFamily: 'var(--font-dm-sans)', whiteSpace: 'nowrap', width: i === 1 ? 80 : i === 2 ? 112 : i === 4 ? 24 : 'auto' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="group">
                  <td style={{ padding: '4px 8px 4px 0' }}><input style={inputBase} value={item.description} onChange={e => update(item.id, 'description', e.target.value)} placeholder="Beskrivelse" /></td>
                  <td style={{ padding: '4px 8px 4px 0' }}><input style={{ ...inputBase, textAlign: 'right' }} type="number" min={1} value={item.quantity || ''} onChange={e => update(item.id, 'quantity', Number(e.target.value))} /></td>
                  <td style={{ padding: '4px 8px 4px 0' }}><input style={{ ...inputBase, textAlign: 'right' }} type="number" value={item.unitPrice || ''} onChange={e => update(item.id, 'unitPrice', Number(e.target.value))} placeholder="0" /></td>
                  <td style={{ padding: '4px 8px 4px 0', textAlign: 'right', color: C.text, whiteSpace: 'nowrap' }}>{formatNOK(item.quantity * item.unitPrice)}</td>
                  <td style={{ padding: 4 }}>
                    <button type="button" onClick={() => remove(item.id)} style={{ color: C.text3, background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, transition: 'opacity 0.1s, color 0.1s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = C.danger }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.text3 }}
                      className="opacity-0 group-hover:opacity-100"
                      title="Fjern">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {items.length === 0 && <p style={{ color: C.text3, fontSize: '0.72rem', padding: '8px 0', fontFamily: 'var(--font-dm-sans)' }}>Ingen rader lagt til ennå</p>}
    </div>
  )
}

// ─── Post-produksjon (combined crew + items) ──────────────────────────────────
function PostProductionSection({
  crew, items, teamMembers, catalog, onCrewChange, onItemsChange,
}: {
  crew: CrewMember[]
  items: QuoteBuilderItem[]
  teamMembers: TeamMember[]
  catalog: PriceCatalogItem[]
  onCrewChange: (crew: CrewMember[]) => void
  onItemsChange: (items: QuoteBuilderItem[]) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <CrewSection
        label="Post-produksjon — Team"
        crew={crew}
        teamMembers={teamMembers}
        catalog={catalog}
        onChange={onCrewChange}
      />
      <ItemSection
        label="Post-produksjon — Kostnader"
        items={items}
        catalog={catalog}
        catalogCategories={['post', 'annet']}
        onChange={onItemsChange}
        addLabel="+ Legg til kostnad"
      />
    </div>
  )
}

// ─── Totals panel ──────────────────────────────────────────────────────────────
function TotalsPanel({ data }: { data: QuoteBuilderData }) {
  const t = calculateQuoteTotals(data)
  const discountPct = Math.round((data.discountFactor ?? 0) * 100)
  const rowStyle = { display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: C.text2, fontFamily: 'var(--font-dm-sans)' }
  const discountRowStyle = { display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: C.danger, fontWeight: 600, fontFamily: 'var(--font-dm-sans)' }
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 3, padding: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <p style={{ ...sectionLabelStyle, marginBottom: 12 }}>Totaler</p>

      {t.crewTotal > 0 && (
        <div style={rowStyle}><span>Mannskap (opptak)</span><span>{formatNOK(t.crewTotal)}</span></div>
      )}
      {t.equipmentTotal > 0 && (
        <div style={rowStyle}><span>Utstyrsliste</span><span>{formatNOK(t.equipmentTotal)}</span></div>
      )}
      {t.postProductionTotal > 0 && <div style={rowStyle}><span>Post-produksjon</span><span>{formatNOK(t.postProductionTotal)}</span></div>}
      {t.otherCostsTotal > 0 && <div style={rowStyle}><span>Andre kostnader</span><span>{formatNOK(t.otherCostsTotal)}</span></div>}
      {t.licensingTotal > 0 && <div style={rowStyle}><span>Lisensiering</span><span>{formatNOK(t.licensingTotal)}</span></div>}

      {t.discountAmount > 0 && (
        <div style={discountRowStyle}>
          <span>Rabatt ({discountPct}%) på opptak + post-produksjon</span>
          <span>−{formatNOK(t.discountAmount)}</span>
        </div>
      )}

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: C.text, fontFamily: 'var(--font-dm-sans)' }}>
          <span>Eks. MVA</span><span>{formatNOK(t.afterDiscount)}</span>
        </div>
        {data.includeVat && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: C.text2, fontFamily: 'var(--font-dm-sans)' }}>
            <span>MVA ({data.vatRate}%)</span><span>{formatNOK(t.vatAmount)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 600, color: C.text, borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 4, fontFamily: 'var(--font-dm-sans)' }}>
          <span>Totalt ink. MVA</span><span style={{ color: C.accent }}>{formatNOK(t.finalInclVat)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Startup section (fixed: Oppstartsmøte + Locationscout) ──────────────
const STARTUP_ROLES = ['Oppstartsmøte', 'Locationscout'] as const

function StartupSection({
  crew,
  onChange,
}: {
  crew: CrewMember[]
  onChange: (crew: CrewMember[]) => void
}) {
  const getEntry = (role: string) => crew.find(m => m.role === role)

  const toggle = (role: string) => {
    const existing = getEntry(role)
    if (existing) {
      onChange(crew.filter(m => m.role !== role))
    } else {
      onChange([...crew, { id: newId(), role, name: '', dailyRate: 0, days: 1 }])
    }
  }

  const update = (role: string, field: 'dailyRate' | 'days', value: number) => {
    onChange(crew.map(m => m.role === role ? { ...m, [field]: value } : m))
  }

  return (
    <div>
      <div style={sectionHeaderStyle}>
        <span style={sectionLabelStyle}>Oppstart/planlegging</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {STARTUP_ROLES.map(role => {
          const entry = getEntry(role)
          const active = !!entry
          return (
            <div key={role}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                borderRadius: 3,
                padding: '8px 12px',
                transition: 'background 0.1s',
                background: active ? C.surface : 'transparent',
                border: `1px solid ${active ? C.border : 'transparent'}`,
              }}>
              <button
                type="button"
                onClick={() => toggle(role)}
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 3,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  cursor: 'pointer',
                  transition: 'background 0.15s, border-color 0.15s',
                  background: active ? C.accent : C.surface2,
                  border: `1px solid ${active ? C.accent : C.border}`,
                }}
              >
                {active && <span style={{ color: '#fff', fontSize: '0.65rem', fontWeight: 700, lineHeight: 1 }}>✓</span>}
              </button>
              <span style={{ fontSize: '0.8rem', width: 144, color: active ? C.text : C.text3, fontFamily: 'var(--font-dm-sans)' }}>{role}</span>
              {active && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: '0.72rem', color: C.text2, whiteSpace: 'nowrap', fontFamily: 'var(--font-dm-sans)' }}>Dager:</span>
                    <input
                      type="number" min={0.5} step={0.5} value={entry.days || ''}
                      onChange={e => update(role, 'days', Number(e.target.value))}
                      style={{ width: 56, fontSize: '0.72rem', textAlign: 'center', borderRadius: 3, background: C.bg, border: `1px solid ${C.border}`, color: C.text, outline: 'none', padding: '4px 8px', fontFamily: 'var(--font-dm-sans)' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: '0.72rem', color: C.text2, whiteSpace: 'nowrap', fontFamily: 'var(--font-dm-sans)' }}>Sats:</span>
                    <input
                      type="number" value={entry.dailyRate || ''}
                      onChange={e => update(role, 'dailyRate', Number(e.target.value))}
                      style={{ width: 96, fontSize: '0.72rem', textAlign: 'right', borderRadius: 3, background: C.bg, border: `1px solid ${C.border}`, color: C.text, outline: 'none', padding: '4px 8px', fontFamily: 'var(--font-dm-sans)' }}
                      placeholder="0"
                    />
                  </div>
                  <span style={{ fontSize: '0.72rem', color: C.accent, marginLeft: 'auto', fontFamily: 'var(--font-dm-sans)' }}>{formatNOK(entry.dailyRate * entry.days)}</span>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Shoot crew section (Opptak) with shared days control ────────────────────
function ShootCrewSection({
  shootDays, crew, teamMembers, catalog, onShootDaysChange, onCrewChange,
}: {
  shootDays: number
  crew: CrewMember[]
  teamMembers: TeamMember[]
  catalog: PriceCatalogItem[]
  onShootDaysChange: (days: number) => void
  onCrewChange: (crew: CrewMember[]) => void
}) {
  const [libraryOpen, setLibraryOpen] = useState(false)
  const alreadyAdded = new Set(crew.map(m => m.name))

  const update = (id: string, field: keyof CrewMember, value: string | number) =>
    onCrewChange(crew.map(m => (m.id === id ? { ...m, [field]: value } : m)))
  const remove = (id: string) => onCrewChange(crew.filter(m => m.id !== id))

  const addManual = () =>
    onCrewChange([...crew, { id: newId(), role: '', name: '', dailyRate: 0, days: shootDays }])

  const addFromLibrary = (member: TeamMember) => {
    onCrewChange([...crew, { id: newId(), role: member.role, name: member.name, dailyRate: member.daily_rate ?? 0, days: shootDays }])
    setLibraryOpen(false)
  }

  const applyShootDays = (days: number) => {
    onShootDaysChange(days)
    onCrewChange(crew.map(m => ({ ...m, days })))
  }

  return (
    <div>
      <div style={sectionHeaderStyle}>
        <span style={sectionLabelStyle}>Opptak — Mannskap</span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {teamMembers.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setLibraryOpen(o => !o)} type="button">
              Fra teambibliotek {libraryOpen ? '▲' : '▼'}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={addManual} type="button">+ Manuell</Button>
        </div>
      </div>

      {/* Shared shoot days control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, padding: 12, borderRadius: 3, background: C.surface, border: `1px solid ${C.border}` }}>
        <span style={{ fontSize: '0.72rem', color: C.text2, whiteSpace: 'nowrap', fontFamily: 'var(--font-dm-sans)' }}>Opptaksdager:</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {([0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7] as number[]).map(d => {
            const label = d === 0.5 ? '½' : d === 1.5 ? '1½' : d === 2.5 ? '2½' : String(d)
            return (
              <button
                key={d}
                type="button"
                onClick={() => applyShootDays(d)}
                style={{
                  width: d % 1 === 0 ? 28 : 36,
                  height: 28,
                  fontSize: '0.72rem',
                  borderRadius: 3,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-dm-sans)',
                  transition: 'background 0.1s, color 0.1s',
                  background: shootDays === d ? C.accent : C.surface2,
                  color: shootDays === d ? '#fff' : C.text2,
                  border: `1px solid ${shootDays === d ? C.accent : C.border}`,
                  fontWeight: shootDays === d ? 600 : 400,
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
        <input
          type="number"
          min={0.5}
          step={0.5}
          value={shootDays}
          onChange={e => applyShootDays(Number(e.target.value))}
          style={{ width: 56, fontSize: '0.72rem', textAlign: 'center', borderRadius: 3, background: C.bg, border: `1px solid ${C.border}`, color: C.text, outline: 'none', padding: '4px 8px', fontFamily: 'var(--font-dm-sans)' }}
          placeholder="dager"
        />
        <span style={{ fontSize: '0.72rem', color: C.text3, fontFamily: 'var(--font-dm-sans)' }}>— setter alle til samme antall dager</span>
      </div>

      {libraryOpen && (
        <div style={{ marginBottom: 16, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 3, overflow: 'hidden' }}>
          <p style={{ padding: '12px 16px 4px', fontSize: '0.58rem', color: C.text2, letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: 'var(--font-dm-sans)' }}>Teambibliotek</p>
          {teamMembers.map(member => {
            const added = alreadyAdded.has(member.name)
            return (
              <button key={member.id} type="button" disabled={added}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', fontSize: '0.8rem', background: 'transparent', border: 'none', cursor: added ? 'not-allowed' : 'pointer', opacity: added ? 0.4 : 1, fontFamily: 'var(--font-dm-sans)', transition: 'background 0.1s' }}
                onMouseEnter={e => { if (!added) (e.currentTarget as HTMLButtonElement).style.background = C.surface2 }}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}
                onClick={() => { if (!added) addFromLibrary(member) }}>
                <div style={{ textAlign: 'left' }}>
                  <span style={{ color: C.text }}>{member.name}</span>
                  <span style={{ color: C.text2, marginLeft: 8, fontSize: '0.72rem' }}>{member.role}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {member.daily_rate
                    ? <span style={{ color: C.accent, fontSize: '0.72rem' }}>{formatNOK(member.daily_rate)}/dag</span>
                    : <span style={{ color: C.text3, fontSize: '0.72rem' }}>ingen dagsats</span>}
                  {added && <span style={{ color: C.text3, fontSize: '0.72rem', marginLeft: 8 }}>lagt til</span>}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {crew.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Rolle', 'Navn', 'Dagsats', 'Dager', 'Total', ''].map((h, i) => (
                  <th key={h} style={{ textAlign: i >= 2 && i < 5 ? 'right' : i === 5 ? 'center' : 'left', paddingBottom: 8, paddingLeft: 4, fontSize: '0.62rem', color: C.text2, fontWeight: 400, fontFamily: 'var(--font-dm-sans)', whiteSpace: 'nowrap', width: i === 5 ? 24 : 'auto' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {crew.map(m => (
                <tr key={m.id} className="group">
                  <td style={{ padding: '4px 8px 4px 0' }}><input style={inputBase} value={m.role} onChange={e => update(m.id, 'role', e.target.value)} placeholder="Rolle" /></td>
                  <td style={{ padding: '4px 8px 4px 0' }}><input style={inputBase} value={m.name} onChange={e => update(m.id, 'name', e.target.value)} placeholder="Navn" /></td>
                  <td style={{ padding: '4px 8px 4px 0' }}><input style={{ ...inputBase, textAlign: 'right' }} type="number" value={m.dailyRate || ''} onChange={e => update(m.id, 'dailyRate', Number(e.target.value))} placeholder="0" /></td>
                  <td style={{ padding: '4px 8px 4px 0' }}>
                    <input
                      style={{ ...inputBase, textAlign: 'right', color: m.days !== shootDays ? C.accent : C.text }}
                      type="number" min={0.5} step={0.5} value={m.days || ''}
                      onChange={e => update(m.id, 'days', Number(e.target.value))}
                      title={m.days !== shootDays ? `Avviker fra opptaksdager (${shootDays})` : undefined}
                    />
                  </td>
                  <td style={{ padding: '4px 8px 4px 0', textAlign: 'right', color: C.text, whiteSpace: 'nowrap' }}>{formatNOK(m.dailyRate * m.days)}</td>
                  <td style={{ padding: 4 }}>
                    <button type="button" onClick={() => remove(m.id)} style={{ color: C.text3, background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', lineHeight: 1, transition: 'opacity 0.1s, color 0.1s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = C.danger }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.text3 }}
                      className="opacity-0 group-hover:opacity-100"
                      title="Fjern">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {crew.length === 0 && !libraryOpen && <p style={{ color: C.text3, fontSize: '0.72rem', padding: '8px 0', fontFamily: 'var(--font-dm-sans)' }}>Ingen lagt til ennå</p>}
    </div>
  )
}

// ─── Main QuoteBuilder ─────────────────────────────────────────────────────────
interface QuoteBuilderProps {
  initialData: QuoteBuilderData
  teamMembers?: TeamMember[]
  customers?: Customer[]
  priceCatalog?: PriceCatalogItem[]
  discountFactors?: DiscountFactor[]
  onSave: (data: QuoteBuilderData) => void
  onGeneratePDF: (data: QuoteBuilderData) => void
  saving?: boolean
  generatingPDF?: boolean
  profiles?: { id: string; name: string | null }[]
}

export function QuoteBuilder({
  initialData,
  teamMembers = [],
  customers = [],
  priceCatalog = [],
  discountFactors = [],
  onSave,
  onGeneratePDF,
  saving = false,
  generatingPDF = false,
}: QuoteBuilderProps) {
  const [data, setData] = useState<QuoteBuilderData>({
    ...initialData,
    startupCrew: initialData.startupCrew ?? [],
    shootDays: initialData.shootDays ?? 1,
    postProductionCrew: initialData.postProductionCrew ?? [],
    discountFactor: initialData.discountFactor ?? 0,
    companyEmail: initialData.companyEmail ?? 'eivind@leafilms.no',
  })
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(() => {
    if (!initialData.customerNumber) return ''
    return customers.find(c => String(c.customer_number) === initialData.customerNumber)?.id ?? ''
  })
  const [headerOpen, setHeaderOpen] = useState(true)
  const [termsOpen, setTermsOpen] = useState(false)

  const REQUIRED_FIELDS: { key: keyof QuoteBuilderData; label: string }[] = [
    { key: 'clientContact', label: 'Kundekontakt' },
    { key: 'deliveryDate', label: 'Leveringsdato' },
    { key: 'ourContact', label: 'Vår kontakt' },
  ]

  const missingFields = REQUIRED_FIELDS.filter(f => !data[f.key])

  const fieldRefs = {
    clientContact: useRef<HTMLInputElement>(null),
    deliveryDate: useRef<HTMLInputElement>(null),
    ourContact: useRef<HTMLInputElement>(null),
  }

  const set = useCallback(
    <K extends keyof QuoteBuilderData>(field: K, value: QuoteBuilderData[K]) => {
      setData(prev => ({ ...prev, [field]: value }))
    }, []
  )

  const handleCustomerSelect = (customer: Customer | null) => {
    setSelectedCustomerId(customer?.id ?? '')
    if (customer) {
      setData(prev => ({ ...prev, clientContact: customer.name, customerNumber: String(customer.customer_number) }))
    } else {
      setData(prev => ({ ...prev, clientContact: '', customerNumber: '' }))
    }
  }

  const handleShootDaysChange = useCallback((days: number) => {
    const factor = discountFactors.find(f => f.shoot_day === days)
    setData(prev => ({
      ...prev,
      shootDays: days,
      discountFactor: factor !== undefined ? Number(factor.discount_factor) : prev.discountFactor ?? 0,
      equipment: prev.equipment.map(e => ({ ...e, quantity: days })),
    }))
  }, [discountFactors])

  const collapsibleHeader = (label: string, open: boolean, onToggle: () => void) => (
    <button type="button"
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        background: C.surface,
        border: 'none',
        cursor: 'pointer',
        transition: 'background 0.1s',
        fontFamily: 'var(--font-dm-sans)',
      }}
      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = C.surface2}
      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = C.surface}
      onClick={onToggle}>
      <span style={sectionLabelStyle}>{label}</span>
      <span style={{ color: C.text2, fontSize: '0.8rem' }}>{open ? '▲' : '▼'}</span>
    </button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {missingFields.length > 0 && (
        <div style={{
          background: 'rgba(240,165,0,0.08)',
          border: '1px solid rgba(240,165,0,0.3)',
          borderRadius: 6,
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap' as const,
          marginBottom: 16,
        }}>
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: '#F0A500', fontWeight: 600, flexShrink: 0 }}>
            Mangler:
          </span>
          {missingFields.map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => fieldRefs[f.key as keyof typeof fieldRefs]?.current?.focus()}
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem',
                color: '#F0A500', background: 'rgba(240,165,0,0.12)',
                border: '1px solid rgba(240,165,0,0.25)', borderRadius: 4,
                padding: '2px 8px', cursor: 'pointer',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Header info ── */}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 3, overflow: 'hidden' }}>
        {collapsibleHeader('Tilbudsinformasjon', headerOpen, () => setHeaderOpen(o => !o))}
        {headerOpen && (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16, background: C.bg }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
              <div>
                <label style={labelStyle}>Versjon</label>
                <input style={fieldStyle} value={data.version} onChange={e => set('version', e.target.value)} placeholder="V1" />
              </div>
              <div>
                <label style={labelStyle}>Tilbudsdato</label>
                <input style={fieldStyle} type="date" value={data.quoteDate} onChange={e => set('quoteDate', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Leveringsdato</label>
                <input ref={fieldRefs.deliveryDate} style={fieldStyle} type="date" value={data.deliveryDate} onChange={e => set('deliveryDate', e.target.value)} />
              </div>
              <div>
                <label style={labelStyle}>Språk</label>
                <select style={fieldStyle} value={data.language} onChange={e => set('language', e.target.value as 'NO' | 'EN')}>
                  <option value="NO">Norsk</option>
                  <option value="EN">English</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>Prosjektnavn</label>
                <input style={fieldStyle} value={data.projectName} onChange={e => set('projectName', e.target.value)} placeholder="Prosjektnavn" />
              </div>
              <div>
                <label style={labelStyle}>Referanse</label>
                <input style={fieldStyle} value={data.reference} onChange={e => set('reference', e.target.value)} placeholder="Video produksjon" />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Hva leveres til kunden</label>
              <input
                style={fieldStyle}
                value={data.deliveryDescription ?? ''}
                onChange={e => set('deliveryDescription', e.target.value)}
                placeholder="F.eks. 2 kampanjefilmer á 90 sek + 30 retuserte produktbilder"
              />
            </div>
            {customers.length > 0 && (
              <CustomerSelector customers={customers} selectedCustomerId={selectedCustomerId} onSelect={handleCustomerSelect} />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
              <div>
                <label style={labelStyle}>Kundekontakt</label>
                <input ref={fieldRefs.clientContact} style={fieldStyle} value={data.clientContact} onChange={e => set('clientContact', e.target.value)} placeholder="Navn" />
              </div>
              <div>
                <label style={labelStyle}>Kundenummer</label>
                <input style={fieldStyle} value={data.customerNumber} onChange={e => set('customerNumber', e.target.value)} placeholder="101" />
              </div>
              <div>
                <label style={labelStyle}>Vår kontakt</label>
                <input ref={fieldRefs.ourContact} style={fieldStyle} value={data.ourContact} onChange={e => set('ourContact', e.target.value)} placeholder="Bea Valand" />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Betalingsbetingelser</label>
              <input style={fieldStyle} value={data.paymentInfo} onChange={e => set('paymentInfo', e.target.value)} placeholder="14 dager" />
            </div>
          </div>
        )}
      </div>

      {/* ── Line item sections ── */}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 3, padding: 16, display: 'flex', flexDirection: 'column', gap: 32, background: C.bg }}>
        <StartupSection
          crew={data.startupCrew}
          onChange={v => set('startupCrew', v)}
        />
        <ShootCrewSection
          shootDays={data.shootDays}
          crew={data.crew}
          teamMembers={teamMembers}
          catalog={priceCatalog}
          onShootDaysChange={handleShootDaysChange}
          onCrewChange={v => set('crew', v)}
        />
        <ItemSection
          label="Utstyrsliste"
          items={data.equipment}
          catalog={priceCatalog}
          catalogCategories={['kamera', 'lys', 'lyd', 'utstyr']}
          onChange={v => set('equipment', v)}
          addLabel="+ Legg til utstyr"
          defaultQuantity={data.shootDays}
        />
        <PostProductionSection
          crew={data.postProductionCrew ?? []}
          items={data.postProduction}
          teamMembers={teamMembers}
          catalog={priceCatalog}
          onCrewChange={v => set('postProductionCrew', v)}
          onItemsChange={v => set('postProduction', v)}
        />
        <ItemSection
          label="Andre kostnader"
          items={data.otherCosts}
          catalog={priceCatalog}
          catalogCategories={['transport', 'annet']}
          onChange={v => set('otherCosts', v)}
          addLabel="+ Legg til kostnad"
        />
        <ItemSection
          label="Lisensiering"
          items={data.licensing}
          catalog={priceCatalog}
          catalogCategories={['annet']}
          onChange={v => set('licensing', v)}
          addLabel="+ Legg til lisens"
        />
      </div>

      {/* ── Settings ── */}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 3, padding: 16, background: C.bg }}>
        <p style={{ ...sectionLabelStyle, marginBottom: 16 }}>Innstillinger</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 16 }}>
          <div>
            <label style={labelStyle}>MVA</label>
            <select style={fieldStyle} value={data.includeVat ? 'y' : 'n'} onChange={e => set('includeVat', e.target.value === 'y')}>
              <option value="y">Ja</option><option value="n">Nei</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>MVA-sats (%)</label>
            <input style={{ ...fieldStyle, opacity: data.includeVat ? 1 : 0.5 }} type="number" value={data.vatRate} onChange={e => set('vatRate', Number(e.target.value))} disabled={!data.includeVat} />
          </div>
          <div>
            <label style={labelStyle}>Rabatt (%)</label>
            <input
              style={fieldStyle}
              type="number" min={0} max={100} step={1}
              value={Math.round((data.discountFactor ?? 0) * 100)}
              onChange={e => set('discountFactor', Number(e.target.value) / 100)}
              placeholder="0"
            />
          </div>
          <div>
            <label style={labelStyle}>E-post (på PDF)</label>
            <input
              style={fieldStyle}
              type="email"
              value={data.companyEmail ?? ''}
              onChange={e => set('companyEmail', e.target.value)}
              placeholder="eivind@leafilms.no"
            />
          </div>
        </div>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, marginTop: 10 }}>
          Rabatten gjelder kun opptak (inkl. oppstart) og post-produksjon — ikke utstyr, lisensiering eller andre kostnader.
          {discountFactors.length > 0 && ' Oppdateres automatisk fra flerdagsrabatt-tabellen når opptaksdager endres.'}
        </p>
      </div>

      {/* ── Totals ── */}
      <TotalsPanel data={data} />

      {/* ── Terms ── */}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 3, overflow: 'hidden' }}>
        {collapsibleHeader('Vilkår og betingelser', termsOpen, () => setTermsOpen(o => !o))}
        {termsOpen && (
          <div style={{ padding: 16, background: C.bg }}>
            <textarea
              style={{ ...fieldStyle, minHeight: 200, resize: 'vertical', lineHeight: 1.6 }}
              value={data.terms}
              onChange={e => set('terms', e.target.value)}
            />
          </div>
        )}
      </div>

      {/* ── Actions ── */}
      <div style={{ display: 'flex', gap: 12, paddingTop: 8 }}>
        <Button variant="secondary" onClick={() => onSave(data)} disabled={saving} type="button">
          {saving ? 'Lagrer...' : 'Lagre tilbud'}
        </Button>
        <Button variant="primary" onClick={() => onGeneratePDF(data)} disabled={generatingPDF} type="button">
          {generatingPDF ? 'Genererer...' : 'Generer PDF'}
        </Button>
      </div>
    </div>
  )
}
