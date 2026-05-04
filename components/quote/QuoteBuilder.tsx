'use client'

import { useState, useCallback } from 'react'
import { QuoteBuilderData, CrewMember, QuoteBuilderItem, TeamMember, Customer, PriceCatalogItem } from '@/lib/types'
import { calculateQuoteTotals } from '@/lib/quote-builder-utils'
import { Button } from '@/components/ui'

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
    discountPercentage: 0,
    includeVat: true,
  }
}

function newId() { return Math.random().toString(36).slice(2) }

function formatNOK(amount: number) {
  return new Intl.NumberFormat('no-NO', { style: 'currency', currency: 'NOK', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)
}

const cellInput = 'bg-transparent border-0 border-b border-[#38332A] focus:outline-none focus:border-[#C49434] px-1 py-1 text-sm text-[#E8E1D5] w-full transition placeholder-[#6B6358]'
const sectionHeader = 'flex items-center justify-between mb-3 pb-2 border-b border-[#38332A]'
const labelClass = 'block text-xs text-[#9E9287] mb-1'
const fieldInput = 'w-full bg-[#1A1713] border border-[#38332A] rounded-[3px] px-3 py-2 text-sm text-[#E8E1D5] placeholder-[#6B6358] focus:outline-none focus:border-[#C49434] transition'

// ─── Shared: Price catalog picker ─────────────────────────────────────────────
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

  return (
    <div className="relative inline-block">
      <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(o => !o)}>
        Fra katalog {open ? '▲' : '▼'}
      </Button>
      {open && (
        <div
          className="absolute z-50 top-full left-0 mt-1 rounded-[3px] overflow-hidden"
          style={{ background: '#1A1713', border: '1px solid #38332A', minWidth: 260, maxHeight: 280 }}
        >
          {catalog.length > 0 && (
            <div className="p-2">
              <input
                autoFocus
                className="w-full bg-[#141210] border border-[#38332A] rounded-[3px] px-3 py-1.5 text-sm text-[#E8E1D5] placeholder-[#6B6358] focus:outline-none focus:border-[#C49434]"
                placeholder="Søk..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          )}
          <div style={{ overflowY: 'auto', maxHeight: 220 }}>
            {catalog.length === 0 ? (
              <p className="px-4 py-3 text-xs text-[#6B6358]">
                Ingen elementer i katalogen ennå.{' '}
                <a href="/admin/prices" className="text-[#C49434] underline" target="_blank">Legg til i Admin → Priskatalog</a>
              </p>
            ) : filtered.length === 0 ? (
              <p className="px-4 py-3 text-xs text-[#6B6358]">Ingen treff</p>
            ) : (
              filtered.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-[#201D18] transition text-left"
                  onClick={() => { onSelect(item); setOpen(false); setSearch('') }}
                >
                  <span className="text-[#E8E1D5]">{item.name}</span>
                  <span className="text-[#C49434] text-xs ml-3 whitespace-nowrap">
                    {item.default_price > 0 ? formatNOK(item.default_price) : '—'} / {item.unit}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
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
    <div className="relative">
      <label className={labelClass}>Kunde</label>
      <button type="button"
        className={`${fieldInput} text-left flex items-center justify-between`}
        onClick={() => setOpen(o => !o)}>
        <span className={selected ? 'text-[#E8E1D5]' : 'text-[#6B6358]'}>
          {selected ? `${selected.name}${selected.customer_number ? ` — #${selected.customer_number}` : ''}` : 'Velg kunde...'}
        </span>
        <span className="text-[#9E9287] text-xs ml-2">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-[3px] overflow-hidden"
          style={{ background: '#1A1713', border: '1px solid #38332A', maxHeight: 260 }}>
          <div className="p-2">
            <input autoFocus
              className="w-full bg-[#141210] border border-[#38332A] rounded-[3px] px-3 py-1.5 text-sm text-[#E8E1D5] placeholder-[#6B6358] focus:outline-none focus:border-[#C49434]"
              placeholder="Søk..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div style={{ overflowY: 'auto', maxHeight: 200 }}>
            <button type="button" className="w-full text-left px-4 py-2.5 text-sm text-[#9E9287] hover:bg-[#201D18] transition"
              onClick={() => { onSelect(null); setOpen(false); setSearch('') }}>Ingen kunde valgt</button>
            {filtered.map(c => (
              <button key={c.id} type="button"
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-[#201D18] transition ${c.id === selectedCustomerId ? 'text-[#C49434]' : 'text-[#E8E1D5]'}`}
                onClick={() => { onSelect(c); setOpen(false); setSearch('') }}>
                <span>{c.name}</span>
                {c.customer_number && <span className="text-[#C49434] ml-2 text-xs">#{c.customer_number}</span>}
                {c.company && <span className="text-[#9E9287] ml-2 text-xs">{c.company}</span>}
              </button>
            ))}
            {filtered.length === 0 && <p className="px-4 py-3 text-xs text-[#6B6358]">Ingen treff</p>}
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
      <div className={sectionHeader}>
        <span className="text-xs font-semibold tracking-widest uppercase text-[#C49434]">{label}</span>
        <div className="flex gap-2 flex-wrap">
          {teamMembers.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setLibraryOpen(o => !o)} type="button">
              Fra teambibliotek {libraryOpen ? '▲' : '▼'}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={addManual} type="button">+ Manuell</Button>
        </div>
      </div>

      {libraryOpen && (
        <div className="mb-4 rounded-[3px] overflow-hidden" style={{ background: '#1A1713', border: '1px solid #38332A' }}>
          <p className="px-4 pt-3 pb-1 text-xs text-[#9E9287] tracking-widest uppercase">Teambibliotek</p>
          {teamMembers.map(member => {
            const added = alreadyAdded.has(member.name)
            return (
              <button key={member.id} type="button" disabled={added}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition ${added ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#201D18]'}`}
                onClick={() => { if (!added) { addFromLibrary(member); setLibraryOpen(false) } }}>
                <div className="text-left">
                  <span className="text-[#E8E1D5]">{member.name}</span>
                  <span className="text-[#9E9287] ml-2 text-xs">{member.role}</span>
                </div>
                <div className="text-right">
                  {member.daily_rate
                    ? <span className="text-[#C49434] text-xs">{formatNOK(member.daily_rate)}/dag</span>
                    : <span className="text-[#6B6358] text-xs">ingen dagsats</span>}
                  {added && <span className="text-[#6B6358] text-xs ml-2">lagt til</span>}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {crew.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#9E9287] text-xs">
                <th className="text-left pb-2 pl-1 font-normal">Rolle</th>
                <th className="text-left pb-2 pl-1 font-normal">Navn</th>
                <th className="text-right pb-2 pr-1 font-normal">Dagsats</th>
                <th className="text-right pb-2 pr-1 font-normal">Dager</th>
                <th className="text-right pb-2 pr-1 font-normal">Total</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {crew.map(m => (
                <tr key={m.id} className="group">
                  <td className="py-1 pr-2"><input className={cellInput} value={m.role} onChange={e => update(m.id, 'role', e.target.value)} placeholder="Rolle" /></td>
                  <td className="py-1 pr-2"><input className={cellInput} value={m.name} onChange={e => update(m.id, 'name', e.target.value)} placeholder="Navn" /></td>
                  <td className="py-1 pr-2"><input className={`${cellInput} text-right`} type="number" value={m.dailyRate || ''} onChange={e => update(m.id, 'dailyRate', Number(e.target.value))} placeholder="0" /></td>
                  <td className="py-1 pr-2"><input className={`${cellInput} text-right`} type="number" min={1} value={m.days || ''} onChange={e => update(m.id, 'days', Number(e.target.value))} /></td>
                  <td className="py-1 pr-2 text-right text-[#E8E1D5] whitespace-nowrap">{formatNOK(m.dailyRate * m.days)}</td>
                  <td className="py-1"><button type="button" onClick={() => remove(m.id)} className="text-[#6B6358] hover:text-[#B84040] opacity-0 group-hover:opacity-100 transition" title="Fjern">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {crew.length === 0 && !libraryOpen && <p className="text-[#6B6358] text-xs py-2">Ingen lagt til ennå</p>}
    </div>
  )
}

// ─── Item section (equipment, other costs, licensing) ─────────────────────────
function ItemSection({
  label, items, catalog, catalogCategories, onChange, addLabel = '+ Legg til',
}: {
  label: string
  items: QuoteBuilderItem[]
  catalog: PriceCatalogItem[]
  catalogCategories?: string[]
  onChange: (items: QuoteBuilderItem[]) => void
  addLabel?: string
}) {
  const update = (id: string, field: keyof QuoteBuilderItem, value: string | number) =>
    onChange(items.map(i => (i.id === id ? { ...i, [field]: value } : i)))
  const add = () => onChange([...items, { id: newId(), description: '', quantity: 1, unitPrice: 0 }])
  const addFromCatalog = (item: PriceCatalogItem) =>
    onChange([...items, { id: newId(), description: item.name, quantity: 1, unitPrice: item.default_price }])
  const remove = (id: string) => onChange(items.filter(i => i.id !== id))

  return (
    <div>
      <div className={sectionHeader}>
        <span className="text-xs font-semibold tracking-widest uppercase text-[#C49434]">{label}</span>
        <div className="flex gap-2 flex-wrap">
          <CatalogPicker
            catalog={catalog}
            filterCategories={catalogCategories}
            onSelect={addFromCatalog}
          />
          <Button size="sm" variant="ghost" onClick={add} type="button">{addLabel}</Button>
        </div>
      </div>

      {items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#9E9287] text-xs">
                <th className="text-left pb-2 pl-1 font-normal">Beskrivelse</th>
                <th className="text-right pb-2 pr-1 font-normal">Antall</th>
                <th className="text-right pb-2 pr-1 font-normal">Stk.pris</th>
                <th className="text-right pb-2 pr-1 font-normal">Total</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="group">
                  <td className="py-1 pr-2"><input className={cellInput} value={item.description} onChange={e => update(item.id, 'description', e.target.value)} placeholder="Beskrivelse" /></td>
                  <td className="py-1 pr-2 w-20"><input className={`${cellInput} text-right`} type="number" min={1} value={item.quantity || ''} onChange={e => update(item.id, 'quantity', Number(e.target.value))} /></td>
                  <td className="py-1 pr-2 w-28"><input className={`${cellInput} text-right`} type="number" value={item.unitPrice || ''} onChange={e => update(item.id, 'unitPrice', Number(e.target.value))} placeholder="0" /></td>
                  <td className="py-1 pr-2 text-right text-[#E8E1D5] whitespace-nowrap">{formatNOK(item.quantity * item.unitPrice)}</td>
                  <td className="py-1"><button type="button" onClick={() => remove(item.id)} className="text-[#6B6358] hover:text-[#B84040] opacity-0 group-hover:opacity-100 transition" title="Fjern">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {items.length === 0 && <p className="text-[#6B6358] text-xs py-2">Ingen rader lagt til ennå</p>}
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
    <div className="space-y-6">
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
  const rows = [
    { label: 'Mannskap', value: t.crewTotal, show: t.crewTotal > 0 },
    { label: 'Utstyrsliste', value: t.equipmentTotal, show: t.equipmentTotal > 0 },
    { label: 'Post-produksjon', value: t.postProductionTotal, show: t.postProductionTotal > 0 },
    { label: 'Andre kostnader', value: t.otherCostsTotal, show: t.otherCostsTotal > 0 },
    { label: 'Lisensiering', value: t.licensingTotal, show: t.licensingTotal > 0 },
  ]
  return (
    <div className="bg-[#1A1713] border border-[#38332A] rounded-[3px] p-4 space-y-1 text-sm">
      <p className="text-xs font-semibold tracking-widest uppercase text-[#C49434] mb-3">Totaler</p>
      {rows.filter(r => r.show).map(r => (
        <div key={r.label} className="flex justify-between text-[#9E9287]">
          <span>{r.label}</span><span>{formatNOK(r.value)}</span>
        </div>
      ))}
      <div className="border-t border-[#38332A] pt-2 mt-2 space-y-1">
        <div className="flex justify-between text-[#E8E1D5]"><span>Subtotal</span><span>{formatNOK(t.subtotal)}</span></div>
        {data.discountPercentage > 0 && (
          <div className="flex justify-between text-[#B84040]"><span>Rabatt ({data.discountPercentage}%)</span><span>−{formatNOK(t.discountAmount)}</span></div>
        )}
        <div className="flex justify-between text-[#E8E1D5]"><span>Eks. MVA</span><span>{formatNOK(t.afterDiscount)}</span></div>
        {data.includeVat && (
          <div className="flex justify-between text-[#9E9287]"><span>MVA ({data.vatRate}%)</span><span>{formatNOK(t.vatAmount)}</span></div>
        )}
        <div className="flex justify-between text-[#E8E1D5] font-semibold text-base border-t border-[#38332A] pt-2 mt-1">
          <span>Totalt ink. MVA</span><span>{formatNOK(t.finalInclVat)}</span>
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
      <div className={sectionHeader}>
        <span className="text-xs font-semibold tracking-widest uppercase text-[#C49434]">Oppstart/planlegging</span>
      </div>
      <div className="space-y-2">
        {STARTUP_ROLES.map(role => {
          const entry = getEntry(role)
          const active = !!entry
          return (
            <div key={role}
              className="flex items-center gap-3 rounded-[3px] px-3 py-2 transition"
              style={{ background: active ? '#1A1713' : 'transparent', border: `1px solid ${active ? '#38332A' : 'transparent'}` }}>
              <button
                type="button"
                onClick={() => toggle(role)}
                className="w-5 h-5 rounded-[3px] flex items-center justify-center flex-shrink-0 transition"
                style={{
                  background: active ? '#C49434' : '#201D18',
                  border: `1px solid ${active ? '#C49434' : '#38332A'}`,
                }}
              >
                {active && <span className="text-[#0C0B09] text-xs font-bold">✓</span>}
              </button>
              <span className={`text-sm w-36 ${active ? 'text-[#E8E1D5]' : 'text-[#6B6358]'}`}>{role}</span>
              {active && (
                <>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-[#9E9287] whitespace-nowrap">Dager:</span>
                    <input
                      type="number" min={1} value={entry.days || ''}
                      onChange={e => update(role, 'days', Number(e.target.value))}
                      className="w-14 text-xs text-center rounded-[3px] bg-[#141210] border border-[#38332A] text-[#E8E1D5] focus:outline-none focus:border-[#C49434] px-2 py-1"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-[#9E9287] whitespace-nowrap">Sats:</span>
                    <input
                      type="number" value={entry.dailyRate || ''}
                      onChange={e => update(role, 'dailyRate', Number(e.target.value))}
                      className="w-24 text-xs text-right rounded-[3px] bg-[#141210] border border-[#38332A] text-[#E8E1D5] focus:outline-none focus:border-[#C49434] px-2 py-1"
                      placeholder="0"
                    />
                  </div>
                  <span className="text-xs text-[#C49434] ml-auto">{formatNOK(entry.dailyRate * entry.days)}</span>
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
      <div className={sectionHeader}>
        <span className="text-xs font-semibold tracking-widest uppercase text-[#C49434]">Opptak — Mannskap</span>
        <div className="flex gap-2 flex-wrap">
          {teamMembers.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setLibraryOpen(o => !o)} type="button">
              Fra teambibliotek {libraryOpen ? '▲' : '▼'}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={addManual} type="button">+ Manuell</Button>
        </div>
      </div>

      {/* Shared shoot days control */}
      <div className="flex items-center gap-3 mb-4 p-3 rounded-[3px]" style={{ background: '#1A1713', border: '1px solid #38332A' }}>
        <span className="text-xs text-[#9E9287] whitespace-nowrap">Opptaksdager:</span>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5, 6, 7].map(d => (
            <button
              key={d}
              type="button"
              onClick={() => applyShootDays(d)}
              className="w-7 h-7 text-xs rounded-[3px] transition"
              style={{
                background: shootDays === d ? '#C49434' : '#201D18',
                color: shootDays === d ? '#0C0B09' : '#9E9287',
                border: `1px solid ${shootDays === d ? '#C49434' : '#38332A'}`,
                fontWeight: shootDays === d ? 600 : 400,
              }}
            >
              {d}
            </button>
          ))}
        </div>
        <input
          type="number"
          min={1}
          value={shootDays}
          onChange={e => applyShootDays(Number(e.target.value))}
          className="w-14 text-xs text-center rounded-[3px] bg-[#141210] border border-[#38332A] text-[#E8E1D5] focus:outline-none focus:border-[#C49434] px-2 py-1"
          placeholder="dager"
        />
        <span className="text-xs text-[#6B6358]">— setter alle til samme antall dager</span>
      </div>

      {libraryOpen && (
        <div className="mb-4 rounded-[3px] overflow-hidden" style={{ background: '#1A1713', border: '1px solid #38332A' }}>
          <p className="px-4 pt-3 pb-1 text-xs text-[#9E9287] tracking-widest uppercase">Teambibliotek</p>
          {teamMembers.map(member => {
            const added = alreadyAdded.has(member.name)
            return (
              <button key={member.id} type="button" disabled={added}
                className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition ${added ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[#201D18]'}`}
                onClick={() => { if (!added) addFromLibrary(member) }}>
                <div className="text-left">
                  <span className="text-[#E8E1D5]">{member.name}</span>
                  <span className="text-[#9E9287] ml-2 text-xs">{member.role}</span>
                </div>
                <div className="text-right">
                  {member.daily_rate
                    ? <span className="text-[#C49434] text-xs">{formatNOK(member.daily_rate)}/dag</span>
                    : <span className="text-[#6B6358] text-xs">ingen dagsats</span>}
                  {added && <span className="text-[#6B6358] text-xs ml-2">lagt til</span>}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {crew.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#9E9287] text-xs">
                <th className="text-left pb-2 pl-1 font-normal">Rolle</th>
                <th className="text-left pb-2 pl-1 font-normal">Navn</th>
                <th className="text-right pb-2 pr-1 font-normal">Dagsats</th>
                <th className="text-right pb-2 pr-1 font-normal">Dager</th>
                <th className="text-right pb-2 pr-1 font-normal">Total</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {crew.map(m => (
                <tr key={m.id} className="group">
                  <td className="py-1 pr-2"><input className={cellInput} value={m.role} onChange={e => update(m.id, 'role', e.target.value)} placeholder="Rolle" /></td>
                  <td className="py-1 pr-2"><input className={cellInput} value={m.name} onChange={e => update(m.id, 'name', e.target.value)} placeholder="Navn" /></td>
                  <td className="py-1 pr-2"><input className={`${cellInput} text-right`} type="number" value={m.dailyRate || ''} onChange={e => update(m.id, 'dailyRate', Number(e.target.value))} placeholder="0" /></td>
                  <td className="py-1 pr-2">
                    <input
                      className={`${cellInput} text-right`}
                      style={{ color: m.days !== shootDays ? '#C49434' : undefined }}
                      type="number" min={1} value={m.days || ''}
                      onChange={e => update(m.id, 'days', Number(e.target.value))}
                      title={m.days !== shootDays ? `Avviker fra opptaksdager (${shootDays})` : undefined}
                    />
                  </td>
                  <td className="py-1 pr-2 text-right text-[#E8E1D5] whitespace-nowrap">{formatNOK(m.dailyRate * m.days)}</td>
                  <td className="py-1"><button type="button" onClick={() => remove(m.id)} className="text-[#6B6358] hover:text-[#B84040] opacity-0 group-hover:opacity-100 transition" title="Fjern">×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {crew.length === 0 && !libraryOpen && <p className="text-[#6B6358] text-xs py-2">Ingen lagt til ennå</p>}
    </div>
  )
}

// ─── Main QuoteBuilder ─────────────────────────────────────────────────────────
interface QuoteBuilderProps {
  initialData: QuoteBuilderData
  teamMembers?: TeamMember[]
  customers?: Customer[]
  priceCatalog?: PriceCatalogItem[]
  onSave: (data: QuoteBuilderData) => void
  onGeneratePDF: (data: QuoteBuilderData) => void
  saving?: boolean
  generatingPDF?: boolean
}

export function QuoteBuilder({
  initialData,
  teamMembers = [],
  customers = [],
  priceCatalog = [],
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
  })
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
  const [headerOpen, setHeaderOpen] = useState(true)
  const [termsOpen, setTermsOpen] = useState(false)

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

  return (
    <div className="space-y-6">
      {/* ── Header info ── */}
      <div className="border border-[#38332A] rounded-[3px] overflow-hidden">
        <button type="button"
          className="w-full flex items-center justify-between px-4 py-3 bg-[#1A1713] hover:bg-[#201D18] transition"
          onClick={() => setHeaderOpen(o => !o)}>
          <span className="text-xs font-semibold tracking-widest uppercase text-[#C49434]">Tilbudsinformasjon</span>
          <span className="text-[#9E9287] text-sm">{headerOpen ? '▲' : '▼'}</span>
        </button>
        {headerOpen && (
          <div className="p-4 space-y-4 bg-[#141210]">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className={labelClass}>Versjon</label>
                <input className={fieldInput} value={data.version} onChange={e => set('version', e.target.value)} placeholder="V1" />
              </div>
              <div>
                <label className={labelClass}>Tilbudsdato</label>
                <input className={fieldInput} type="date" value={data.quoteDate} onChange={e => set('quoteDate', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Leveringsdato</label>
                <input className={fieldInput} type="date" value={data.deliveryDate} onChange={e => set('deliveryDate', e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Språk</label>
                <select className={fieldInput} value={data.language} onChange={e => set('language', e.target.value as 'NO' | 'EN')}>
                  <option value="NO">Norsk</option>
                  <option value="EN">English</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Prosjektnavn</label>
                <input className={fieldInput} value={data.projectName} onChange={e => set('projectName', e.target.value)} placeholder="Prosjektnavn" />
              </div>
              <div>
                <label className={labelClass}>Referanse</label>
                <input className={fieldInput} value={data.reference} onChange={e => set('reference', e.target.value)} placeholder="Video produksjon" />
              </div>
            </div>
            {customers.length > 0 && (
              <CustomerSelector customers={customers} selectedCustomerId={selectedCustomerId} onSelect={handleCustomerSelect} />
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Kundekontakt</label>
                <input className={fieldInput} value={data.clientContact} onChange={e => set('clientContact', e.target.value)} placeholder="Navn" />
              </div>
              <div>
                <label className={labelClass}>Kundenummer</label>
                <input className={fieldInput} value={data.customerNumber} onChange={e => set('customerNumber', e.target.value)} placeholder="101" />
              </div>
              <div>
                <label className={labelClass}>Vår kontakt</label>
                <input className={fieldInput} value={data.ourContact} onChange={e => set('ourContact', e.target.value)} placeholder="Bea Valand" />
              </div>
            </div>
            <div>
              <label className={labelClass}>Betalingsbetingelser</label>
              <input className={fieldInput} value={data.paymentInfo} onChange={e => set('paymentInfo', e.target.value)} placeholder="14 dager" />
            </div>
          </div>
        )}
      </div>

      {/* ── Line item sections ── */}
      <div className="border border-[#38332A] rounded-[3px] p-4 space-y-8 bg-[#141210]">
        <StartupSection
          crew={data.startupCrew}
          onChange={v => set('startupCrew', v)}
        />
        <ShootCrewSection
          shootDays={data.shootDays}
          crew={data.crew}
          teamMembers={teamMembers}
          catalog={priceCatalog}
          onShootDaysChange={v => set('shootDays', v)}
          onCrewChange={v => set('crew', v)}
        />
        <ItemSection
          label="Utstyrsliste"
          items={data.equipment}
          catalog={priceCatalog}
          catalogCategories={['kamera', 'lys', 'lyd', 'utstyr']}
          onChange={v => set('equipment', v)}
          addLabel="+ Legg til utstyr"
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
      <div className="border border-[#38332A] rounded-[3px] p-4 bg-[#141210]">
        <p className="text-xs font-semibold tracking-widest uppercase text-[#C49434] mb-4">Innstillinger</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className={labelClass}>MVA</label>
            <select className={fieldInput} value={data.includeVat ? 'y' : 'n'} onChange={e => set('includeVat', e.target.value === 'y')}>
              <option value="y">Ja</option><option value="n">Nei</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>MVA-sats (%)</label>
            <input className={fieldInput} type="number" value={data.vatRate} onChange={e => set('vatRate', Number(e.target.value))} disabled={!data.includeVat} />
          </div>
          <div>
            <label className={labelClass}>Rabatt (%)</label>
            <select className={fieldInput} value={data.discountPercentage} onChange={e => set('discountPercentage', Number(e.target.value))}>
              {[0, 5, 10, 15, 20, 25, 30].map(v => <option key={v} value={v}>{v}%</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Totals ── */}
      <TotalsPanel data={data} />

      {/* ── Terms ── */}
      <div className="border border-[#38332A] rounded-[3px] overflow-hidden">
        <button type="button"
          className="w-full flex items-center justify-between px-4 py-3 bg-[#1A1713] hover:bg-[#201D18] transition"
          onClick={() => setTermsOpen(o => !o)}>
          <span className="text-xs font-semibold tracking-widest uppercase text-[#C49434]">Vilkår og betingelser</span>
          <span className="text-[#9E9287] text-sm">{termsOpen ? '▲' : '▼'}</span>
        </button>
        {termsOpen && (
          <div className="p-4 bg-[#141210]">
            <textarea
              className="w-full bg-[#1A1713] border border-[#38332A] rounded-[3px] px-3 py-2 text-sm text-[#E8E1D5] focus:outline-none focus:border-[#C49434] transition min-h-[200px]"
              value={data.terms}
              onChange={e => set('terms', e.target.value)}
            />
          </div>
        )}
      </div>

      {/* ── Actions ── */}
      <div className="flex gap-3 pt-2">
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
