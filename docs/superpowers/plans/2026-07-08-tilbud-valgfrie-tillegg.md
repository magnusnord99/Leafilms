# Valgfrie tillegg i pristilbudet — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La kunden hake av valgfrie tillegg (faste priser satt av admin) på det publiserte pristilbudet og se totalsummen oppdatere seg live, uten at noe lagres før de signerer kontrakten — ved signering lagres valgene og kontraktteksten oppdateres med et tilleggsavsnitt.

**Architecture:** Nytt felt `optionalAddons: { id, description, price }[]` på `QuoteBuilderData`. Kundens hakede valg er ren React-state løftet fra `QuoteSection` til dens forelder `PublicProjectClient` og delt med søskenkomponenten `ContractSigningSection`. Ved signering sender klienten valgte id-er til `/api/contracts/sign`, som gjør den autoritative beregningen server-side (henter fersk `quote_data`, ingen tillit til klienten) og skriver både til `quotes.quote_data` og til `contracts.contract_text`.

**Tech Stack:** Next.js 16 App Router, React (client components), Supabase (Postgres + service-role server actions), TypeScript strict mode. Ingen automatisk testrammeverk i dette repoet — verifisering skjer via `npx tsc --noEmit`, `npx eslint <filer>`, og manuell/Playwright-basert browser-verifisering (se prosjektets etablerte mønster: `SUPABASE_SERVICE_ROLE_KEY`-basert engangs-testbruker + Playwright, ryddet opp etterpå).

## Global Constraints

- Rabatt (`discountFactor`) gjelder **aldri** valgfrie tillegg — samme regel som utstyr/lisens/andre kostnader.
- MVA (`vatRate`/`includeVat`) gjelder valgfrie tillegg på samme måte som resten av tilbudet.
- Kundens hakede valg lagres **kun** ved kontraktsignering — ingen mellomlagring, ingen egen "aksepter tilbud"-knapp.
- `lib/quote-builder-utils.ts` røres ikke i det hele tatt i denne planen.
- Server-side beregning i `/api/contracts/sign` er alltid autoritativ — klientens tall er kun til visning og stoles aldri på for hva som faktisk lagres.
- Kontraktteksten oppdateres **kun** ved å legge til et eget avsnitt før signaturseksjonen — aldri ved å søke-og-erstatte tall i eksisterende brødtekst.

---

### Task 1: Datamodell — `OptionalAddon`-type og felt på `QuoteBuilderData`

**Files:**
- Modify: `lib/types.ts`

**Interfaces:**
- Produces: `export type OptionalAddon = { id: string; description: string; price: number }`, og `QuoteBuilderData.optionalAddons: OptionalAddon[]` (nytt, påkrevd felt — samme konvensjon som `crew`/`equipment`, selv om kode som leser eldre lagrede tilbud alltid bruker `?? []` defensivt siden gamle JSONB-rader mangler feltet).

- [ ] **Step 1: Legg til typen og feltet**

Åpne `lib/types.ts` og finn `QuoteBuilderData`-typen (linje ~128-155 per siste kjente innhold):

```ts
export type QuoteBuilderItem = {
  id: string
  description: string
  quantity: number
  unitPrice: number
}

export type OptionalAddon = {
  id: string
  description: string
  price: number
}

export type QuoteBuilderData = {
  version: string
  quoteDate: string
  projectName: string
  reference: string
  clientContact: string
  customerNumber: string
  ourContact: string
  paymentInfo: string
  deliveryDate: string
  deliveryDescription: string
  terms: string
  language: 'NO' | 'EN'
  startupCrew: CrewMember[]
  shootDays: number
  crew: CrewMember[]
  equipment: QuoteBuilderItem[]
  postProductionCrew: CrewMember[]
  postProduction: QuoteBuilderItem[]
  otherCosts: QuoteBuilderItem[]
  licensing: QuoteBuilderItem[]
  vatRate: number
  /** Rabatt (desimal, 0.1 = 10%) på opptak (inkl. oppstart) og post-produksjon. Gjelder ikke utstyr, lisens eller andre kostnader. */
  discountFactor: number
  includeVat: boolean
  /** E-post vist i "Fra oss"-blokken på tilbuds-PDF-en */
  companyEmail?: string
  /** Valgfrie tillegg kunden kan hake av på det publiserte tilbudet — fast pris, ikke underlagt discountFactor. */
  optionalAddons: OptionalAddon[]
}
```

(Legg `OptionalAddon`-typen rett før `QuoteBuilderData`, og legg til `optionalAddons: OptionalAddon[]`-linjen sist i `QuoteBuilderData`.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -60`
Expected: Flere feil vises — alle i filer som initialiserer `QuoteBuilderData`-objekter uten `optionalAddons` (`components/quote/QuoteBuilder.tsx`'s `createEmptyBuilderData`, og evt. andre steder). Dette er forventet og fikses i Task 2. Ikke bekymre deg over disse feilene i dette steget — bare bekreft at feilmeldingen faktisk peker på manglende `optionalAddons`-felt, ikke noe annet.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "Legg til optionalAddons-felt på QuoteBuilderData"
```

---

### Task 2: Admin — definer tillegg i tilbudsbyggeren

**Files:**
- Modify: `components/quote/QuoteBuilder.tsx`

**Interfaces:**
- Consumes: `OptionalAddon` fra `lib/types.ts` (Task 1).
- Produces: Ingen nye eksporter — kun UI-endring internt i `QuoteBuilder`-komponenten. `createEmptyBuilderData()` returnerer nå `optionalAddons: []`.

- [ ] **Step 1: Importer typen**

I `components/quote/QuoteBuilder.tsx`, endre importen øverst:

```ts
import { QuoteBuilderData, CrewMember, QuoteBuilderItem, OptionalAddon, TeamMember, Customer, PriceCatalogItem, DiscountFactor } from '@/lib/types'
```

- [ ] **Step 2: Legg `optionalAddons: []` til `createEmptyBuilderData()`**

Finn funksjonen (linje ~19-46) og legg til feltet sist i det returnerte objektet:

```ts
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
    optionalAddons: [],
  }
}
```

- [ ] **Step 3: Legg til `AddonsSection`-komponenten**

Rett etter `ItemSection`-komponenten (etter linje ~469, før `// ─── Post-produksjon (combined crew + items) ──`), legg til:

```tsx
// ─── Valgfrie tillegg (kunden haker av selv på det publiserte tilbudet) ────────
function AddonsSection({
  items, onChange,
}: {
  items: OptionalAddon[]
  onChange: (items: OptionalAddon[]) => void
}) {
  const update = (id: string, field: 'description' | 'price', value: string | number) =>
    onChange(items.map(i => (i.id === id ? { ...i, [field]: value } : i)))
  const add = () => onChange([...items, { id: newId(), description: '', price: 0 }])
  const remove = (id: string) => onChange(items.filter(i => i.id !== id))

  return (
    <div>
      <div style={sectionHeaderStyle}>
        <span style={sectionLabelStyle}>Valgfrie tillegg</span>
        <Button size="sm" variant="ghost" onClick={add} type="button">+ Legg til tillegg</Button>
      </div>

      {items.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Tittel', 'Pris', ''].map((h, i) => (
                  <th key={h} style={{ textAlign: i === 1 ? 'right' : i === 2 ? 'center' : 'left', paddingBottom: 8, paddingLeft: 4, fontSize: '0.62rem', color: C.text2, fontWeight: 400, fontFamily: 'var(--font-dm-sans)', whiteSpace: 'nowrap', width: i === 2 ? 24 : 'auto' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="group">
                  <td style={{ padding: '4px 8px 4px 0' }}>
                    <input style={inputBase} value={item.description} onChange={e => update(item.id, 'description', e.target.value)} placeholder="F.eks. VFX-pakke" />
                  </td>
                  <td style={{ padding: '4px 8px 4px 0' }}>
                    <input style={{ ...inputBase, textAlign: 'right' }} type="number" value={item.price || ''} onChange={e => update(item.id, 'price', Number(e.target.value))} placeholder="0" />
                  </td>
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
      {items.length === 0 && <p style={{ color: C.text3, fontSize: '0.72rem', padding: '8px 0', fontFamily: 'var(--font-dm-sans)' }}>Ingen tillegg lagt til ennå</p>}
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', color: C.text3, marginTop: 10 }}>
        Vises som avkrysningsbokser for kunden på det publiserte tilbudet. Rabatten over gjelder ikke disse — kun MVA legges på hvis kunden haker av.
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Init `optionalAddons` i `QuoteBuilder`-komponentens state**

Finn `useState<QuoteBuilderData>`-kallet (linje ~825-832) og legg til feltet:

```ts
const [data, setData] = useState<QuoteBuilderData>({
  ...initialData,
  startupCrew: initialData.startupCrew ?? [],
  shootDays: initialData.shootDays ?? 1,
  postProductionCrew: initialData.postProductionCrew ?? [],
  discountFactor: initialData.discountFactor ?? 0,
  companyEmail: initialData.companyEmail ?? 'eivind@leafilms.no',
  optionalAddons: initialData.optionalAddons ?? [],
})
```

- [ ] **Step 5: Rendre `AddonsSection` i tilbudsbyggeren**

Finn `<ItemSection label="Lisensiering" .../>` (linje ~1046-1053, siste `ItemSection` i "Line item sections"-blokken) og legg til `AddonsSection` rett etter, fortsatt inni samme wrapper-div:

```tsx
        <ItemSection
          label="Lisensiering"
          items={data.licensing}
          catalog={priceCatalog}
          catalogCategories={['annet']}
          onChange={v => set('licensing', v)}
          addLabel="+ Legg til lisens"
        />
        <AddonsSection
          items={data.optionalAddons ?? []}
          onChange={v => set('optionalAddons', v)}
        />
      </div>
```

(Den siste `</div>` er den eksisterende lukkingen av "Line item sections"-wrapperen — ikke legg til en ny.)

- [ ] **Step 6: Typecheck og lint**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -60`
Expected: Ingen feil relatert til `QuoteBuilder.tsx` eller `optionalAddons` lenger (feilene fra Task 1 Step 2 er nå borte).

Run: `npx eslint components/quote/QuoteBuilder.tsx 2>&1 | tail -30`
Expected: Ingen nye feil (eksisterende varsler i filen, om noen, uendret).

- [ ] **Step 7: Manuell verifisering**

Start dev-server (`npm run dev` i bakgrunnen), logg inn som admin (bruk mønsteret med engangs-testbruker via `supabase.auth.admin.createUser()` + service-role-nøkkel, dokumentert i prosjektminnet — opprett, test, slett etterpå), naviger til `/admin/projects/[id]/quote` for et prosjekt med et lagret tilbud, bekreft at "Valgfrie tillegg"-seksjonen vises nederst i linjelistene, legg til en rad ("VFX-pakke", 12000), lagre tilbudet, og bekreft via en direkte spørring mot `quotes`-tabellen (service-role-nøkkel) at `quote_data.optionalAddons` inneholder raden.

- [ ] **Step 8: Commit**

```bash
git add components/quote/QuoteBuilder.tsx
git commit -m "Admin: legg til seksjon for å definere valgfrie tillegg på tilbudet"
```

---

### Task 3: Kundevisning — avkrysningsbokser og live totalsum i `QuoteSection`

**Files:**
- Modify: `components/sections/QuoteSection.tsx`

**Interfaces:**
- Consumes: `OptionalAddon` fra `lib/types.ts` (Task 1).
- Produces: `QuoteSectionProps` får tre nye valgfrie props: `selectedAddonIds?: Set<string>`, `onToggleAddon?: (id: string) => void`, `onAddonsLoaded?: (addons: OptionalAddon[]) => void`. Disse er valgfrie (med defaults) slik at admin-editorens bruk av `QuoteSection` (via `SectionRenderer.tsx`, som ikke sender disse props) fortsatt fungerer uendret.

- [ ] **Step 1: Importer typen og utvid props**

Endre importen øverst i `components/sections/QuoteSection.tsx`:

```ts
import { Section, Project, QuoteBuilderData, OptionalAddon } from '@/lib/types'
```

Utvid `QuoteSectionProps`:

```ts
type QuoteSectionProps = {
  section: Section
  project: Project
  editMode: boolean
  updateSectionContent: (sectionId: string, key: string, value: unknown) => void
  shareToken?: string
  hasPublishedContract?: boolean
  selectedAddonIds?: Set<string>
  onToggleAddon?: (id: string) => void
  onAddonsLoaded?: (addons: OptionalAddon[]) => void
}
```

- [ ] **Step 2: Destrukturer med defaults**

Endre funksjonssignaturen:

```ts
export function QuoteSection({
  section,
  project,
  editMode,
  updateSectionContent,
  shareToken,
  hasPublishedContract = false,
  selectedAddonIds = new Set<string>(),
  onToggleAddon = () => {},
  onAddonsLoaded = () => {},
}: QuoteSectionProps) {
```

- [ ] **Step 3: Rapporter tillegg-listen opp når tilbudet lastes**

Finn `applyQuote`-funksjonen inni `useEffect` (linje ~84-95) og kall `onAddonsLoaded` når data er builder-shaped:

```ts
const applyQuote = (data: { id: string; quote_data: unknown } | null) => {
  if (!data) return
  setQuoteId(data.id)
  if (data.quote_data) {
    if (isBuilderData(data.quote_data)) {
      const builderData = data.quote_data as QuoteBuilderData
      setDbBuilderData(builderData)
      setDbQuoteData(convertBuilderDataToQuoteData(builderData))
      onAddonsLoaded(builderData.optionalAddons ?? [])
    } else {
      setDbQuoteData(data.quote_data as QuoteData)
    }
  }
}
```

Legg til `onAddonsLoaded` i avhengighetslisten til `useEffect` (linje ~119): `}, [project.id, shareToken, onAddonsLoaded])` — trygt siden `PublicProjectClient` sender en stabil `useCallback`-referanse (Task 4).

- [ ] **Step 4: Beregn live totalsum inkl. valgte tillegg**

Rett før `return`-setningen i "Display mode"-grenen (etter linje ~250, før `return (`), legg til:

```ts
  const optionalAddons = dbBuilderData?.optionalAddons ?? []
  const selectedAddonsTotal = optionalAddons
    .filter((a) => selectedAddonIds.has(a.id))
    .reduce((sum, a) => sum + a.price, 0)
  const vatRate = quoteData?.vatRate ?? 0
  const addonsInclVat = dbBuilderData?.includeVat ? selectedAddonsTotal * (1 + vatRate / 100) : selectedAddonsTotal
  const liveFinalExclVat = (quoteData?.finalPriceExclVat ?? 0) + selectedAddonsTotal
  const liveFinalInclVat = (quoteData?.finalPriceInclVat ?? 0) + addonsInclVat
```

- [ ] **Step 5: Rendre avkrysningsboksene**

Sett inn en ny seksjon mellom "Line items" (`data-quote-section="line_items"`, slutter ~linje 436) og "Totals" (`data-quote-section="totals"`, starter ~linje 439):

```tsx
          {/* Valgfrie tillegg */}
          {optionalAddons.length > 0 && (
            <div
              className="px-8 md:px-12 py-8 space-y-3"
              style={{ borderTop: '1px solid #2A261F' }}
              data-quote-section="addons"
            >
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#62594E', marginBottom: 8 }}>
                Valgfrie tillegg
              </p>
              {optionalAddons.map((addon) => {
                const checked = selectedAddonIds.has(addon.id)
                return (
                  <label
                    key={addon.id}
                    className="flex items-center justify-between gap-4"
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleAddon(addon.id)}
                        style={{ accentColor: '#C49434', width: 16, height: 16, flexShrink: 0 }}
                      />
                      <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: checked ? '#E8E1D5' : '#9E9287' }}>
                        {addon.description}
                      </span>
                    </span>
                    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: checked ? '#C49434' : '#62594E', whiteSpace: 'nowrap' }}>
                      +{formatCurrency(addon.price)}
                    </span>
                  </label>
                )
              })}
            </div>
          )}

          {/* Totals */}
```

(Den eksisterende `{/* Totals */}`-kommentaren og påfølgende `<div>` beholdes uendret rett etter — bare sett inn tillegg-blokken før den.)

- [ ] **Step 6: Bytt ut de statiske totalsum-tallene med de live tallene**

I "Totals"-blokken, erstatt bruken av `quoteData.finalPriceExclVat`/`quoteData.finalPriceInclVat` (linje ~459-475) med de live variablene, og legg til en rad som viser valgte tillegg når noe er haket av:

```tsx
            {selectedAddonsTotal > 0 && (
              <div className="flex justify-between items-baseline">
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: '#C49434' }}>Valgte tillegg</p>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', color: '#C49434', fontWeight: 500 }}>
                  +{formatCurrency(selectedAddonsTotal)}
                </p>
              </div>
            )}
            {quoteData.finalPriceExclVat !== undefined && (
              <div className="flex justify-between items-baseline pt-3" style={{ borderTop: '1px solid #2A261F' }}>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: '#9E9287' }}>Pris eksl. MVA</p>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1rem', color: '#E8E1D5', fontWeight: 500 }}>{formatCurrency(liveFinalExclVat)}</p>
              </div>
            )}
            {quoteData.finalPriceInclVat !== undefined && (
              <div className="flex justify-between items-baseline">
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: '#9E9287' }}>Pris inkl. MVA</p>
                <p style={{
                  fontFamily: 'var(--font-dm-sans)',
                  fontSize: '1.2rem',
                  fontWeight: 600,
                  color: '#E8E1D5',
                }}>{formatCurrency(liveFinalInclVat)}</p>
              </div>
            )}
```

- [ ] **Step 7: Typecheck og lint**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -60`
Expected: Ingen feil.

Run: `npx eslint components/sections/QuoteSection.tsx 2>&1 | tail -30`
Expected: Ingen nye feil.

- [ ] **Step 8: Commit**

```bash
git add components/sections/QuoteSection.tsx
git commit -m "Kundevisning: avkrysningsbokser for valgfrie tillegg + live totalsum"
```

---

### Task 4: Løft state til `PublicProjectClient` og koble til begge søskenkomponenter

**Files:**
- Modify: `app/p/[token]/PublicProjectClient.tsx`

**Interfaces:**
- Consumes: `OptionalAddon` fra `lib/types.ts` (Task 1); `onAddonsLoaded`/`selectedAddonIds`/`onToggleAddon`-props på `QuoteSection` (Task 3).
- Produces: `optionalAddons: OptionalAddon[]` og `selectedAddonIds: Set<string>` sendes ned til `ContractSigningSection` (konsumeres i Task 5).

- [ ] **Step 1: Importer `useState` og `OptionalAddon`**

Endre imports øverst i filen:

```ts
import { useMemo, useCallback, useEffect, useState } from 'react'
```

Legg til i type-importen fra `@/lib/types` (finn den eksisterende importen av `Project, Section, ...` og legg til `OptionalAddon`):

```ts
import { Project, Section, TeamMember, CaseStudy, Image, SectionImage, VideoLibrary, SectionVideo, CollagePreset, OurSignature, OptionalAddon } from '@/lib/types'
```

- [ ] **Step 2: Legg til state og toggle-handler**

Rett etter `const sectionIds = useMemo(...)` (linje ~72), legg til:

```ts
  const [optionalAddons, setOptionalAddons] = useState<OptionalAddon[]>([])
  const [selectedAddonIds, setSelectedAddonIds] = useState<Set<string>>(new Set())

  const handleToggleAddon = useCallback((id: string) => {
    setSelectedAddonIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleAddonsLoaded = useCallback((addons: OptionalAddon[]) => {
    setOptionalAddons(addons)
  }, [])
```

- [ ] **Step 3: Send props til `QuoteSection`**

Finn `<QuoteSection ...>` (linje ~361-370) og legg til de tre nye props:

```tsx
                    <QuoteSection
                      section={section}
                      project={project}
                      editMode={false}
                      updateSectionContent={noop}
                      shareToken={shareToken}
                      hasPublishedContract={!!publishedContract}
                      selectedAddonIds={selectedAddonIds}
                      onToggleAddon={handleToggleAddon}
                      onAddonsLoaded={handleAddonsLoaded}
                    />
```

- [ ] **Step 4: Send props til `ContractSigningSection`**

Finn `<ContractSigningSection ...>` (linje ~454-462) og legg til:

```tsx
        <ContractSigningSection
          projectId={projectId}
          shareToken={shareToken}
          contractText={publishedContract.contractText}
          isSigned={publishedContract.isSigned}
          signedBy={publishedContract.signedBy}
          ourSignature={publishedContract.ourSignature}
          optionalAddons={optionalAddons}
          selectedAddonIds={selectedAddonIds}
        />
```

- [ ] **Step 5: Typecheck og lint**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -60`
Expected: Feil om manglende props på `ContractSigningSection` (forventet — fikses i Task 5). Ingen andre feil.

- [ ] **Step 6: Commit**

```bash
git add "app/p/[token]/PublicProjectClient.tsx"
git commit -m "Løft valgfrie-tillegg-state til PublicProjectClient, del med QuoteSection og ContractSigningSection"
```

---

### Task 5: Vis sammendrag og send valgte tillegg ved signering

**Files:**
- Modify: `app/p/[token]/ContractSigningSection.tsx`

**Interfaces:**
- Consumes: `OptionalAddon` fra `lib/types.ts`; `optionalAddons: OptionalAddon[]`, `selectedAddonIds: Set<string>` fra `PublicProjectClient` (Task 4).
- Produces: POST-body til `/api/contracts/sign` får nytt felt `selectedAddonIds: string[]` (konsumeres i Task 6).

- [ ] **Step 1: Importer typen og utvid props**

Endre importen øverst i `app/p/[token]/ContractSigningSection.tsx`:

```ts
import type { OurSignature, OptionalAddon } from '@/lib/types'
```

Utvid `ContractSigningSectionProps` og funksjonssignaturen:

```ts
type ContractSigningSectionProps = {
  projectId: string
  shareToken: string
  contractText: string
  isSigned: boolean
  signedBy: string | null
  ourSignature?: OurSignature | null
  optionalAddons?: OptionalAddon[]
  selectedAddonIds?: Set<string>
}

export default function ContractSigningSection({
  projectId,
  shareToken,
  contractText,
  isSigned: initialIsSigned,
  signedBy,
  ourSignature,
  optionalAddons = [],
  selectedAddonIds = new Set<string>(),
}: ContractSigningSectionProps) {
```

- [ ] **Step 2: Send valgte tillegg med i signeringskallet**

I `handleSign`, utvid body-objektet:

```ts
      const res = await fetch('/api/contracts/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          shareToken,
          signerName: name,
          signerEmail: email,
          contractSnapshot: contractText,
          signatureImage: sigRef.current?.getDataUrl() ?? '',
          selectedAddonIds: Array.from(selectedAddonIds),
        }),
      })
```

- [ ] **Step 3: Vis sammendrag av valgte tillegg før signeringsskjemaet**

I `!isSigned`-grenen, rett før `{/* Name input */}`-blokken (den ytre `<div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>` som starter signeringsskjemaet), sett inn:

```tsx
            {selectedAddonIds.size > 0 && (
              <div
                style={{
                  padding: '1rem 1.25rem',
                  border: '1px solid rgba(196,148,52,0.25)',
                  background: 'rgba(196,148,52,0.05)',
                }}
              >
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#C49434', marginBottom: 8 }}>
                  Valgte tillegg
                </p>
                {optionalAddons
                  .filter((a) => selectedAddonIds.has(a.id))
                  .map((a) => (
                    <p key={a.id} style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: '#9E9287', margin: '2px 0' }}>
                      {a.description} — +{new Intl.NumberFormat('no-NO', { style: 'currency', currency: 'NOK', minimumFractionDigits: 0 }).format(a.price)}
                    </p>
                  ))}
              </div>
            )}
```

- [ ] **Step 4: Typecheck og lint**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -60`
Expected: Ingen feil relatert til `ContractSigningSection.tsx` eller `PublicProjectClient.tsx` lenger.

Run: `npx eslint "app/p/[token]/ContractSigningSection.tsx" "app/p/[token]/PublicProjectClient.tsx" 2>&1 | tail -30`
Expected: Ingen nye feil.

- [ ] **Step 5: Commit**

```bash
git add "app/p/[token]/ContractSigningSection.tsx"
git commit -m "Vis sammendrag av valgte tillegg og send dem med ved kontraktsignering"
```

---

### Task 6: Server — lagre valgte tillegg og oppdater kontraktteksten ved signering

**Files:**
- Modify: `app/api/contracts/sign/route.ts`

**Interfaces:**
- Consumes: `selectedAddonIds: string[]` i request body (Task 5); `calculateQuoteTotals` fra `lib/quote-builder-utils.ts` (uendret, eksisterende eksport); `QuoteBuilderData` fra `lib/types.ts`.
- Produces: `quotes.quote_data` (for gjeldende tilbud) får ekstra felter `selectedAddonIds`, `addonsTotal`, `finalPriceExclVatWithAddons`, `finalPriceInclVatWithAddons` når kunden har valgt minst ett tillegg. `contracts.contract_text` får et tilleggsavsnitt i samme tilfelle.

- [ ] **Step 1: Importer det som trengs**

Endre importene øverst:

```ts
import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import type { OurSignature, QuoteBuilderData } from '@/lib/types'
import { calculateQuoteTotals } from '@/lib/quote-builder-utils'
import { generateContractPDF } from '../pdf-generator'
```

- [ ] **Step 2: Les `selectedAddonIds` fra body**

Endre destruktureringen av `body` (linje 9):

```ts
    const { projectId, shareToken, signerName, signerEmail, contractSnapshot, signatureImage, selectedAddonIds: rawSelectedAddonIds } = body
    const selectedAddonIds: string[] = Array.isArray(rawSelectedAddonIds) ? rawSelectedAddonIds : []
```

- [ ] **Step 3: Beregn valgte tillegg + ny totalsum rett før kontrakt-oppdateringen**

Rett før `const signedAt = new Date().toISOString()` (linje ~71), sett inn:

```ts
    // Hent gjeldende tilbud for å beregne valgte tillegg — server-side, aldri klientens tall.
    let quoteData: QuoteBuilderData | null = null
    let quoteRowId: string | null = null
    if (selectedAddonIds.length > 0) {
      const { data: quote } = await supabase
        .from('quotes')
        .select('id, quote_data')
        .eq('project_id', projectId)
        .eq('is_current', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (quote?.quote_data && Array.isArray((quote.quote_data as { crew?: unknown }).crew)) {
        quoteData = quote.quote_data as QuoteBuilderData
        quoteRowId = quote.id
      }
    }

    const selectedAddons = (quoteData?.optionalAddons ?? []).filter((a) => selectedAddonIds.includes(a.id))

    let addonsTotal = 0
    let finalPriceExclVatWithAddons: number | null = null
    let finalPriceInclVatWithAddons: number | null = null
    let contractAddendum = ''

    if (quoteData && selectedAddons.length > 0) {
      addonsTotal = selectedAddons.reduce((sum, a) => sum + a.price, 0)
      const baseTotals = calculateQuoteTotals(quoteData)
      const addonsInclVat = quoteData.includeVat ? addonsTotal * (1 + quoteData.vatRate / 100) : addonsTotal
      finalPriceExclVatWithAddons = baseTotals.afterDiscount + addonsTotal
      finalPriceInclVatWithAddons = baseTotals.finalInclVat + addonsInclVat

      const fmt = (n: number) => `${new Intl.NumberFormat('nb-NO').format(Math.round(n))} kr`
      const addonLines = selectedAddons.map((a) => `${a.description} — ${fmt(a.price)}`).join('\n')
      contractAddendum = `\n\nTillegg valgt av kunde ved signering:\n${addonLines}\n\nNy totalsum inkl. tillegg: ${fmt(finalPriceExclVatWithAddons)} eks. MVA`
    }

    const signedAt = new Date().toISOString()
```

(Fjern den gamle `const signedAt = new Date().toISOString()`-linjen som allerede lå der — den er nå flyttet til slutten av denne blokken, samme sted i koden, bare med tillegg-beregningen rett over.)

- [ ] **Step 4: Ta med tilleggsavsnittet i kontrakt-oppdateringen**

Finn `"Oppdater kontrakt til signert"`-blokken (linje ~73-90) og legg til `contract_text` i update-objektet, kun når det finnes et avsnitt å legge til:

```ts
    // Oppdater kontrakt til signert
    const { error: updateContractError } = await supabase
      .from('contracts')
      .update({
        status: 'signed',
        signed_at: signedAt,
        signed_by: signerEmail,
        signature_data: {
          signerName,
          signerEmail,
          signedAt,
          contractSnapshot,
          ip,
          signatureImage,
        },
        updated_at: signedAt,
        ...(contractAddendum ? { contract_text: (contract.contract_text ?? contractSnapshot) + contractAddendum } : {}),
      })
      .eq('id', contract.id)
```

- [ ] **Step 5: Lagre valgte tillegg + ny totalsum på `quotes.quote_data`**

Finn `"Sett gjeldende quote-versjon til accepted"`-blokken (linje ~142-152) og bygg update-payloaden betinget:

```ts
    // Sett gjeldende quote-versjon til accepted, og lagre valgte tillegg hvis noen ble valgt
    const quoteUpdatePayload: Record<string, unknown> = { status: 'accepted', updated_at: signedAt }
    if (quoteData && selectedAddons.length > 0 && quoteRowId) {
      quoteUpdatePayload.quote_data = {
        ...quoteData,
        selectedAddonIds: selectedAddons.map((a) => a.id),
        addonsTotal,
        finalPriceExclVatWithAddons,
        finalPriceInclVatWithAddons,
      }
    }

    const { error: updateQuoteError } = await supabase
      .from('quotes')
      .update(quoteUpdatePayload)
      .eq('project_id', projectId)
      .eq('is_current', true)

    if (updateQuoteError) {
      console.error('sign contract quote update error:', updateQuoteError)
      // Ikke fatal — logg og fortsett
    }
```

(Dette erstatter den eksisterende, enklere `.update({ status: 'accepted', updated_at: signedAt })`-linjen.)

- [ ] **Step 6: Typecheck og lint**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -60`
Expected: Ingen feil noe sted i prosjektet lenger — dette er siste fil i planen.

Run: `npx eslint app/api/contracts/sign/route.ts 2>&1 | tail -30`
Expected: Ingen nye feil.

- [ ] **Step 7: Commit**

```bash
git add app/api/contracts/sign/route.ts
git commit -m "Lagre valgte tillegg og oppdater kontraktteksten ved signering"
```

---

### Task 7: Manuell ende-til-ende-verifisering

**Files:** Ingen nye — kun verifisering av Task 1–6 samlet.

**Interfaces:**
- Consumes: Hele funksjonen bygget i Task 1–6.
- Produces: Ingen kodeendring — bekreftelse på at helheten fungerer, med opprydding av alt testdata.

- [ ] **Step 1: Start dev-server**

```bash
npm run dev > /tmp/leafilms-dev-addons.log 2>&1 &
disown
sleep 5
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
```
Expected: `307` (redirect, som er normalt for rot-URL-en).

- [ ] **Step 2: Finn eller opprett testdata**

Bruk service-role-nøkkelen (se `.env.local`, `SUPABASE_SERVICE_ROLE_KEY`) til å finne et prosjekt med:
- Et gyldig `project_shares`-token (for `/p/[token]`)
- Et `quotes`-tilbud med `is_current = true` og builder-shaped `quote_data`
- En publisert kontrakt (`contracts.published_at` satt) som IKKE er signert (`status != 'signed'`)

Hvis ingen slikt prosjekt finnes naturlig, bruk et eksisterende testprosjekt og legg midlertidig til 1-2 rader i `quote_data.optionalAddons` direkte via service-role-klienten for testen, og fjern dem igjen etterpå.

**VIKTIG (lærdom fra tidligere i denne økten):** ikke test signerings-endepunktet med et gyldig token mot ekte kundedata uten å være klar over at det faktisk signerer kontrakten permanent. Bruk et prosjekt du er komfortabel med å signere (test-/internt prosjekt), eller vær forberedt på å rulle tilbake `contracts.status`/`signed_at`/`signed_by`/`signature_data` og `quotes.status`/`quote_data` etterpå slik det ble gjort tidligere denne økten.

- [ ] **Step 3: Playwright — bekreft avkrysningsboksene og live totalsum**

```bash
node -e "
const { chromium } = require('playwright')
;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto('http://localhost:3000/p/<TOKEN>', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('text=Valgfrie tillegg', { timeout: 15000 })

  const priceBefore = await page.locator('text=Pris eksl. MVA').locator('xpath=following-sibling::p').first().innerText()
  await page.locator('input[type=checkbox]').first().check()
  await page.waitForTimeout(300)
  const priceAfter = await page.locator('text=Pris eksl. MVA').locator('xpath=following-sibling::p').first().innerText()

  console.log('Pris før:', priceBefore, '  Pris etter:', priceAfter)
  console.log('Endret seg:', priceBefore !== priceAfter)

  await browser.close()
})().catch(e => { console.error('ERR', e); process.exit(1) })
"
```
Expected: `Endret seg: true`, og `priceAfter` skal være `priceBefore` + tilleggets pris (inkl. MVA).

- [ ] **Step 4: Bekreft at signering lagrer valgene og oppdaterer kontraktteksten**

Gjenta samme mønster som Task 2 Step 7 og tidligere i økten: logg inn via engangs-testbruker, fyll ut signeringsskjemaet med haket avkrysningsboks (eller kall `/api/contracts/sign` direkte med `selectedAddonIds` i body hvis du har et gyldig `shareToken` for testprosjektet), og verifiser direkte mot databasen (service-role-nøkkel):

```sql
select quote_data->'selectedAddonIds', quote_data->'addonsTotal', quote_data->'finalPriceInclVatWithAddons'
from quotes where id = '<QUOTE_ID>';

select contract_text from contracts where project_id = '<PROJECT_ID>';
```
Expected: `quote_data`-feltene er satt korrekt, og `contract_text` slutter med "Tillegg valgt av kunde ved signering:"-avsnittet med riktig tittel, pris og ny totalsum.

- [ ] **Step 5: Rydd opp**

- Rull tilbake ethvert testprosjekts `contracts`/`quotes`-rader til opprinnelig tilstand hvis ekte data ble brukt (se mønsteret fra tidligere i økten: sett `status`, `signed_at`, `signed_by`, `signature_data`, `contract_text`, `quote_data` tilbake).
- Fjern eventuelle midlertidig lagt-til `optionalAddons`-testrader.
- Slett engangs-testbrukeren via `supabase.auth.admin.deleteUser()`.
- Stopp dev-serveren: `pkill -f "next dev"`.
- Slett loggfilen: `rm -f /tmp/leafilms-dev-addons.log`.

- [ ] **Step 6: Endelig full typecheck og lint**

```bash
npx tsc --noEmit -p tsconfig.json
npx eslint . 2>&1 | tail -5
```
Expected: `tsc` uten output (ingen feil). `eslint`-linjen viser samme baseline som før denne planen (148 problems, 8 pre-eksisterende feil per siste kjente måling) — ingen nye feil introdusert av denne planen.
