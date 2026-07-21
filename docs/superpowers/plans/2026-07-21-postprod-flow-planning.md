# Planlegg post-produksjonssteg fra preprod — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La brukere legge til et ekte, sekvensielt steg (f.eks. «VFX og animasjon») i post-produksjonens låste stepper, mens prosjektet fortsatt er i pre-prod — og sørge for at «↺ Nullstill» i post-produksjon ikke sletter slike planlagte steg (eller dagens frie egendefinerte oppgaver).

**Architecture:** Gjenbruker eksisterende `tasks`-tabell uten migrasjon. `is_custom=false` holder steget i den låste stepperen; `created_by` (satt til innlogget bruker) skiller «menneske-lagt-til» steg fra maloppgaver (`created_by=null`) og blir den nye grunnen til at noe er beskyttet mot sletting/reseed. All rekkefølge-regning (sette inn et steg et gitt sted, eller flette bevarte steg inn i en fersk mal-sekvens) går via tre små, rene funksjoner i en ny fil, testet isolert med `tsx` — ingen DB-avhengighet i selve logikken. Serveractions i `lib/actions/pipeline.ts` gjør kun IO (hente/skrive) rundt disse rene funksjonene. Ny klientkomponent på pre-prod-siden lar brukeren legge til og fjerne planlagte steg; post-prod-siden trenger ingen endring i selve rendring av stepperen (den plukker automatisk opp nye rader), men får én liten delete-knapp i detaljpanelet for planlagte steg.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (PostgreSQL + RLS, ingen nye policies nødvendig — eksisterende `tasks`-policies er permissive), `tsx` for scratch-verifisering av ren logikk (finnes allerede som devDependency, `^4.7.0`).

## Global Constraints

- Ingen ny migrasjon — alt gjenbruker eksisterende kolonner på `tasks`
  (`pipeline_stage`, `is_custom`, `created_by`, `sub_type`, `sort_order`).
- Prosjektet har **ingen automatisert testrunner** (ingen vitest/jest i
  repoet). Verifiser i stedet med: `npx tsc --noEmit`, targeted
  `npx eslint <endrede filer>` (ALDRI full `npm run lint` — se
  CLAUDE.md/memory: `.claude/worktrees/**` blåser opp feilantallet), og for
  ren logikk et engangs `tsx`-skript i scratch-katalogen (kjør, verifiser
  output, kast). DB-berørte actions verifiseres manuelt i browser med et
  midlertidig testprosjekt — se Task 8. **Test aldri write-endepunkter mot
  ekte kundedata med gyldige tokens.**
- Følg eksisterende fargepalett/stil nøyaktig i nye komponenter — kopiér `C`-
  konstanten fra `TaskList.tsx`/naboseksjoner, ikke finn opp nye farger.
- `project_type` er alltid satt på et prosjekt før det når pre-prod (påkrevd
  felt ved prosjektopprettelse i `app/admin/projects/new/page.tsx`) — ingen
  behov for «prosjekttype ikke satt ennå»-fallback-UI, men server actions
  skal likevel defensivt returnere en feil hvis den mot formodning er null.
- Norsk i UI-tekst og feilmeldinger, engelsk i variabel-/funksjonsnavn — som
  ellers i kodebasen.

---

### Task 1: Rene sekvensfunksjoner (`lib/postprod-flow.ts`)

**Files:**
- Create: `lib/postprod-flow.ts`

**Interfaces:**
- Produces: `FlowOrigin` (`'existing' | 'template' | 'new'`), `SequenceRow`
  (`{ id: string | null; title: string; description: string | null; origin: FlowOrigin }`),
  `computeInsertionOrder(currentSequence: SequenceRow[], newStep: SequenceRow, insertBeforeTitle: string | null): SequenceRow[]`,
  `mergeReseededSequence(freshTemplates: SequenceRow[], preserved: SequenceRow[]): SequenceRow[]`,
  `assignSortOrder(sequence: SequenceRow[]): (SequenceRow & { sortOrder: number })[]`.
  Task 2, 3 og 5 importerer og bruker disse tre funksjonene direkte — signaturene over er endelige, ikke bare eksempler.

- [ ] **Step 1: Skriv filen**

```typescript
// lib/postprod-flow.ts
//
// Ren sekvenslogikk for å sette et nytt, menneske-lagt post_prod-steg inn i
// den låste stepperen (f.eks. et VFX/animasjon-steg lagt til fra pre-prod),
// og for å flette bevarte menneske-steg inn igjen etter en reseed av
// maloppgavene. Ingen DB-kall her — kalles fra lib/actions/pipeline.ts.

export type FlowOrigin = 'existing' | 'template' | 'new'

export type SequenceRow = {
  /** null for rader som ikke er lagret i DB ennå (mal-fallback eller det nye steget) */
  id: string | null
  title: string
  description: string | null
  origin: FlowOrigin
}

/**
 * Setter newStep inn i currentSequence rett før raden med tittel
 * insertBeforeTitle. Hvis insertBeforeTitle er null, eller ikke finnes i
 * sekvensen, settes newStep sist.
 */
export function computeInsertionOrder(
  currentSequence: SequenceRow[],
  newStep: SequenceRow,
  insertBeforeTitle: string | null
): SequenceRow[] {
  const insertAt = insertBeforeTitle === null
    ? currentSequence.length
    : (() => {
        const idx = currentSequence.findIndex(row => row.title === insertBeforeTitle)
        return idx === -1 ? currentSequence.length : idx
      })()

  return [
    ...currentSequence.slice(0, insertAt),
    newStep,
    ...currentSequence.slice(insertAt),
  ]
}

/**
 * Slår sammen ferske maloppgaver (etter en reseed) med bevarte
 * menneske-lagde rader. De bevarte radene legges bakerst — ved
 * prosjekttype-bytte finnes det ingen pålitelig måte å gjenskape nøyaktig
 * gammel interlevning på, siden gamle ankerpunkter (mal-titler) kan ha
 * forsvunnet.
 */
export function mergeReseededSequence(
  freshTemplates: SequenceRow[],
  preserved: SequenceRow[]
): SequenceRow[] {
  return [...freshTemplates, ...preserved]
}

/** Renummererer en sekvens til fortløpende sort_order (1..N). */
export function assignSortOrder(
  sequence: SequenceRow[]
): (SequenceRow & { sortOrder: number })[] {
  return sequence.map((row, i) => ({ ...row, sortOrder: i + 1 }))
}
```

- [ ] **Step 2: Verifiser med et engangs tsx-skript**

Opprett `/private/tmp/claude-501/-Users-magnusnordmo-Prosjektbeskrivelse-leafilms/b2df2f41-1367-4c52-961d-8a69b8d969ce/scratchpad/verify-postprod-flow.ts`
(eller tilsvarende scratch-katalog for økten):

```typescript
import { computeInsertionOrder, mergeReseededSequence, assignSortOrder, type SequenceRow } from '../../../../../../../Users/magnusnordmo/Prosjektbeskrivelse_leafilms/leafilms-pitch/lib/postprod-flow'

function row(title: string, origin: SequenceRow['origin'] = 'template', id: string | null = null): SequenceRow {
  return { id, title, description: null, origin }
}

// Case 1: sett inn midt i sekvensen
const current = [row('Grovklipp'), row('Farger'), row('Lyd')]
const withVfx = assignSortOrder(computeInsertionOrder(current, row('VFX og animasjon', 'new'), 'Farger'))
console.assert(withVfx.map(r => r.title).join(',') === 'Grovklipp,VFX og animasjon,Farger,Lyd', 'FEIL: midt-innsetting')
console.assert(withVfx.find(r => r.title === 'VFX og animasjon')!.sortOrder === 2, 'FEIL: sortOrder for nytt steg')

// Case 2: insertBeforeTitle = null -> sist
const atEnd = assignSortOrder(computeInsertionOrder(current, row('Kundegjennomgang ekstra', 'new'), null))
console.assert(atEnd[atEnd.length - 1].title === 'Kundegjennomgang ekstra', 'FEIL: skulle vært sist')

// Case 3: insertBeforeTitle peker på noe som ikke finnes -> sist (fallback)
const fallback = assignSortOrder(computeInsertionOrder(current, row('Ukjent-referanse steg', 'new'), 'Finnes ikke'))
console.assert(fallback[fallback.length - 1].title === 'Ukjent-referanse steg', 'FEIL: skulle falle tilbake til sist')

// Case 4: reseed bevarer menneske-rader bakerst
const freshTemplates = [row('Grovklipp'), row('Farger'), row('Lyd')]
const preserved = [row('VFX og animasjon', 'existing', 'abc-123')]
const merged = assignSortOrder(mergeReseededSequence(freshTemplates, preserved))
console.assert(merged.map(r => r.title).join(',') === 'Grovklipp,Farger,Lyd,VFX og animasjon', 'FEIL: reseed-flette')
console.assert(merged[3].id === 'abc-123' && merged[3].sortOrder === 4, 'FEIL: bevart rad mangler id/sortOrder')

console.log('Alle postprod-flow-sjekker OK')
```

Kjør (juster relativ importsti til den faktiske plasseringen av scratch-filen,
eller legg skriptet direkte i repo-roten midlertidig og slett det etterpå):

```bash
npx tsx <sti-til-skriptet>.ts
```

Forventet output: `Alle postprod-flow-sjekker OK` og ingen
`Assertion failed`-linjer i konsollen. Slett scratch-skriptet etter kjøring —
det skal ikke committes.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Forventet: ingen nye feil relatert til `lib/postprod-flow.ts`.

- [ ] **Step 4: Commit**

```bash
git add lib/postprod-flow.ts
git commit -m "feat: ren sekvenslogikk for planlagte post-prod-steg"
```

---

### Task 2: `getPostProdFlowOptions` — lesespørring for UI

**Files:**
- Modify: `lib/actions/pipeline.ts` (legg til nederst i filen, etter eksisterende `deleteTask`)

**Interfaces:**
- Consumes: ingenting fra Task 1 (dette er en ren lesespørring, ikke sekvenslogikk).
- Produces: `PostProdFlowTrack` (`{ subType: 'video' | 'photo' | null; titles: string[] }`),
  `PlannedPostProdStep` (`{ id: string; title: string; description: string | null; subType: 'video' | 'photo' | null }`),
  `getPostProdFlowOptions(projectId: string): Promise<{ projectType: ProjectType | null; tracks: PostProdFlowTrack[]; plannedSteps: PlannedPostProdStep[] }>`.
  Task 6 (UI-komponenten) kaller denne funksjonen og bruker disse tre typene direkte.

- [ ] **Step 1: Legg til typer og funksjon**

Sett inn dette på slutten av `lib/actions/pipeline.ts` (etter `deleteTask`):

```typescript
export type PostProdFlowTrack = {
  subType: 'video' | 'photo' | null
  titles: string[]
}

export type PlannedPostProdStep = {
  id: string
  title: string
  description: string | null
  subType: 'video' | 'photo' | null
}

type StepperRow = {
  id: string
  title: string
  description: string | null
  sub_type: 'video' | 'photo' | null
  is_custom: boolean
  created_by: string | null
}

/**
 * Henter alt pre-prod-siden trenger for å tilby "legg til post-prod-steg":
 * - hvilke titler som finnes i den (evt. fremtidige) stepperen, per spor
 *   (video/foto for mixed-prosjekter, ett spor ellers) — brukes til
 *   "Sett inn før"-velgeren
 * - hvilke planlagte steg som allerede er lagt til av et menneske
 */
export async function getPostProdFlowOptions(projectId: string): Promise<{
  projectType: ProjectType | null
  tracks: PostProdFlowTrack[]
  plannedSteps: PlannedPostProdStep[]
}> {
  try {
    const supabase = await createClient()

    const { data: proj } = await supabase
      .from('projects')
      .select('project_type')
      .eq('id', projectId)
      .single()

    const projectType = (proj?.project_type ?? null) as ProjectType | null
    if (!projectType) {
      return { projectType: null, tracks: [], plannedSteps: [] }
    }

    const { data: existingTasks } = await supabase
      .from('tasks')
      .select('id, title, description, sub_type, is_custom, created_by')
      .eq('project_id', projectId)
      .eq('pipeline_stage', 'post_prod')
      .order('sort_order', { ascending: true })

    const stepperRows: StepperRow[] = (existingTasks ?? []).filter((t: StepperRow) => !t.is_custom)

    const plannedSteps: PlannedPostProdStep[] = stepperRows
      .filter(t => t.created_by !== null)
      .map(t => ({ id: t.id, title: t.title, description: t.description, subType: t.sub_type }))

    const subTypes: ('video' | 'photo' | null)[] = projectType === 'mixed' ? ['video', 'photo'] : [null]

    const tracks: PostProdFlowTrack[] = await Promise.all(
      subTypes.map(async (subType): Promise<PostProdFlowTrack> => {
        const existingForTrack = stepperRows
          .filter(t => t.sub_type === subType)
          .map(t => t.title)

        if (existingForTrack.length > 0) {
          return { subType, titles: existingForTrack }
        }

        // Stepperen er ikke seedet ennå for denne tracken: bruk standardmalene
        const templateProjectType = projectType === 'mixed' ? subType! : projectType
        const { data: templates } = await supabase
          .from('task_templates')
          .select('title')
          .eq('pipeline_stage', 'post_prod')
          .eq('project_type', templateProjectType)
          .order('sort_order', { ascending: true })

        return { subType, titles: (templates ?? []).map((t: { title: string }) => t.title) }
      })
    )

    return { projectType, tracks, plannedSteps }
  } catch (err) {
    console.error('getPostProdFlowOptions error:', err)
    return { projectType: null, tracks: [], plannedSteps: [] }
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Forventet: ingen nye feil.

- [ ] **Step 3: Targeted lint**

```bash
npx eslint lib/actions/pipeline.ts
```

Forventet: ingen nye feil (pre-eksisterende advarsler i filen er OK, ikke din sak å fikse dem).

- [ ] **Step 4: Commit**

```bash
git add lib/actions/pipeline.ts
git commit -m "feat: getPostProdFlowOptions for pre-prod-planlegging"
```

---

### Task 3: `addPlannedPostProdStep` — skriveaction

**Files:**
- Modify: `lib/actions/pipeline.ts`

**Interfaces:**
- Consumes: `SequenceRow`, `computeInsertionOrder`, `assignSortOrder` fra `lib/postprod-flow.ts` (Task 1).
- Produces: `addPlannedPostProdStep(input: { projectId: string; title: string; description?: string; insertBeforeTitle: string | null; subType: 'video' | 'photo' | null }): Promise<{ ok: boolean; error?: string }>`.
  Task 6 (UI) kaller denne med akkurat denne signaturen.

- [ ] **Step 1: Importer sekvensfunksjonene øverst i filen**

I `lib/actions/pipeline.ts`, legg til denne importen rett under den eksisterende
`import { PIPELINE_STAGES } from '@/lib/types'` (linje 8):

```typescript
import { computeInsertionOrder, assignSortOrder, type SequenceRow } from '@/lib/postprod-flow'
```

- [ ] **Step 2: Legg til funksjonen**

Sett inn nederst i filen, etter `getPostProdFlowOptions` fra Task 2:

```typescript
/**
 * Legger til et nytt, menneske-planlagt steg i post_prod-stepperen for et
 * prosjekt — kan kalles fra pre-prod, før stepperen i det hele tatt er
 * seedet. Hvis den ikke er seedet ennå, materialiseres standardmalene i
 * samme kall, slik at det nye steget kan settes inn på riktig plass i en
 * ekte, sammenhengende sort_order-sekvens.
 */
export async function addPlannedPostProdStep(input: {
  projectId: string
  title: string
  description?: string
  insertBeforeTitle: string | null
  subType: 'video' | 'photo' | null
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { ok: false, error: 'Ikke innlogget' }
    }

    const { data: proj } = await supabase
      .from('projects')
      .select('project_type')
      .eq('id', input.projectId)
      .single()

    const projectType = (proj?.project_type ?? null) as ProjectType | null
    if (!projectType) {
      return { ok: false, error: 'Prosjektet mangler innholdstype' }
    }

    let existingQuery = supabase
      .from('tasks')
      .select('id, title, description')
      .eq('project_id', input.projectId)
      .eq('pipeline_stage', 'post_prod')
      .eq('is_custom', false)
      .order('sort_order', { ascending: true })

    existingQuery = input.subType
      ? existingQuery.eq('sub_type', input.subType)
      : existingQuery.is('sub_type', null)

    const { data: existingRows, error: existingError } = await existingQuery

    if (existingError) {
      console.error('addPlannedPostProdStep existing error:', existingError)
      return { ok: false, error: 'Kunne ikke hente eksisterende steg' }
    }

    let currentSequence: SequenceRow[] = (existingRows ?? []).map(
      (r: { id: string; title: string; description: string | null }) => ({
        id: r.id, title: r.title, description: r.description, origin: 'existing' as const,
      })
    )

    if (currentSequence.length === 0) {
      const templateProjectType = projectType === 'mixed' ? input.subType : projectType
      const { data: templates, error: templatesError } = await supabase
        .from('task_templates')
        .select('title, description')
        .eq('pipeline_stage', 'post_prod')
        .eq('project_type', templateProjectType)
        .order('sort_order', { ascending: true })

      if (templatesError) {
        console.error('addPlannedPostProdStep templates error:', templatesError)
        return { ok: false, error: 'Kunne ikke hente maler' }
      }

      currentSequence = (templates ?? []).map((t: { title: string; description: string | null }) => ({
        id: null, title: t.title, description: t.description ?? null, origin: 'template' as const,
      }))
    }

    const newStep: SequenceRow = {
      id: null,
      title: input.title,
      description: input.description ?? null,
      origin: 'new',
    }

    const merged = assignSortOrder(
      computeInsertionOrder(currentSequence, newStep, input.insertBeforeTitle)
    )

    for (const row of merged) {
      if (row.origin === 'existing') {
        const { error } = await supabase
          .from('tasks')
          .update({ sort_order: row.sortOrder })
          .eq('id', row.id as string)

        if (error) {
          console.error('addPlannedPostProdStep update error:', error)
          return { ok: false, error: 'Kunne ikke oppdatere rekkefølgen' }
        }
      } else {
        const { error } = await supabase.from('tasks').insert({
          project_id: input.projectId,
          pipeline_stage: 'post_prod',
          title: row.title,
          description: row.description,
          status: 'todo' as const,
          sort_order: row.sortOrder,
          sub_type: input.subType,
          is_custom: false,
          created_by: row.origin === 'new' ? user.id : null,
          due_date: null,
          priority: null,
        })

        if (error) {
          console.error('addPlannedPostProdStep insert error:', error)
          return { ok: false, error: 'Kunne ikke opprette steget' }
        }
      }
    }

    revalidatePath('/admin/preprod')
    revalidatePath('/admin/postprod')
    revalidatePath('/admin/pipeline')
    revalidatePath('/admin/projects')

    return { ok: true }
  } catch (err) {
    console.error('addPlannedPostProdStep unexpected error:', err)
    return { ok: false, error: 'Uventet feil' }
  }
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Forventet: ingen nye feil. Merk: `row.id as string` i update-grenen er trygg
fordi `origin === 'existing'` alltid har en ekte DB-id — men TypeScript vet
ikke det fra typen alene, derfor cast.

- [ ] **Step 4: Targeted lint**

```bash
npx eslint lib/actions/pipeline.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/actions/pipeline.ts
git commit -m "feat: addPlannedPostProdStep — legg til planlagt post-prod-steg fra pre-prod"
```

---

### Task 4: `deleteTask` — bytt sperre fra `is_custom` til `created_by`

**Files:**
- Modify: `lib/actions/pipeline.ts:661-698` (funksjonen `deleteTask`)

**Interfaces:**
- Consumes: ingen nye avhengigheter.
- Produces: samme signatur som før — `deleteTask(taskId: string): Promise<{ ok: boolean; error?: string }>`.
  Ingen kallere trenger å endres (samme kontrakt), men oppførselen endres:
  nå kan planlagte post-prod-steg (`is_custom=false`, men `created_by` satt)
  også slettes, mens maloppgaver (`created_by=null`) fortsatt er beskyttet.

- [ ] **Step 1: Endre guarden og oppdater docblock**

I `lib/actions/pipeline.ts`, erstatt:

```typescript
/**
 * Sletter en egendefinert oppgave. Nekter å slette maloppgaver
 * (is_custom=false) for å beskytte den faste sjekklisten/stepperen.
 */
export async function deleteTask(taskId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const { data: task, error: fetchError } = await supabase
      .from('tasks')
      .select('is_custom')
      .eq('id', taskId)
      .single()

    if (fetchError || !task) {
      return { ok: false, error: 'Oppgave ikke funnet' }
    }

    if (!task.is_custom) {
      return { ok: false, error: 'Kan ikke slette faste oppgaver' }
    }
```

med:

```typescript
/**
 * Sletter en oppgave brukeren har lagt til (fri egendefinert oppgave eller
 * planlagt post-prod-steg). Nekter å slette maloppgaver (created_by=null,
 * seedet fra task_templates) for å beskytte den faste sjekklisten/stepperen.
 */
export async function deleteTask(taskId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const { data: task, error: fetchError } = await supabase
      .from('tasks')
      .select('created_by')
      .eq('id', taskId)
      .single()

    if (fetchError || !task) {
      return { ok: false, error: 'Oppgave ikke funnet' }
    }

    if (!task.created_by) {
      return { ok: false, error: 'Kan ikke slette faste oppgaver' }
    }
```

Resten av funksjonen (fra `const { error } = await supabase.from('tasks').delete()...` til slutt) er uendret.

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Manuell sjekk av at fri-liste-sletting fortsatt virker**

Dette er en oppførselsendring på et eksisterende, mye brukt endepunkt —
verifiser i browser (midlertidig testprosjekt, se Task 8) at en vanlig
egendefinert oppgave i «Egendefinerte oppgaver»-listen (opprettet via
`createTask`, som alltid setter `created_by` til innlogget bruker) fortsatt
kan slettes akkurat som før.

- [ ] **Step 4: Commit**

```bash
git add lib/actions/pipeline.ts
git commit -m "fix: deleteTask beskytter maloppgaver via created_by, ikke is_custom"
```

---

### Task 5: `reseedPostProdTasks` — bevar menneske-lagde rader

**Files:**
- Modify: `lib/actions/pipeline.ts:463-549` (hele `reseedPostProdTasks`-funksjonen)

**Interfaces:**
- Consumes: `SequenceRow`, `mergeReseededSequence`, `assignSortOrder` fra `lib/postprod-flow.ts` (Task 1).
- Produces: samme signatur som før — `reseedPostProdTasks(projectId: string): Promise<{ count: number; error?: string }>`.
  Kalles i dag fra `app/admin/postprod/[id]/page.tsx` sitt «↺ Nullstill»-flow
  og fra `handleSelectType` — ingen endring nødvendig der siden signaturen er
  identisk.

- [ ] **Step 1: Importer `mergeReseededSequence` i tillegg til de andre fra Task 3**

Utvid importen fra Task 3, steg 1, til:

```typescript
import { computeInsertionOrder, mergeReseededSequence, assignSortOrder, type SequenceRow } from '@/lib/postprod-flow'
```

- [ ] **Step 2: Erstatt hele funksjonen**

Erstatt hele den eksisterende `reseedPostProdTasks`-funksjonen (fra
`export async function reseedPostProdTasks(` til den avsluttende `}` rett før
`/**\n * Henter alle prosjekter i post_prod-steget...`) med:

```typescript
export async function reseedPostProdTasks(
  projectId: string
): Promise<{ count: number; error?: string }> {
  try {
    const supabase = await createClient()

    const { data: proj, error: projError } = await supabase
      .from('projects')
      .select('project_type')
      .eq('id', projectId)
      .single()

    if (projError || !proj) {
      return { count: 0, error: 'Fant ikke prosjektet' }
    }

    if (!proj.project_type) {
      return { count: 0, error: 'Innholdstype ikke satt på prosjektet' }
    }

    const { data: existingTasks, error: existingError } = await supabase
      .from('tasks')
      .select('id, title, description, sub_type, created_by')
      .eq('project_id', projectId)
      .eq('pipeline_stage', 'post_prod')
      .order('sort_order', { ascending: true })

    if (existingError) {
      console.error('reseedPostProdTasks fetch error:', existingError)
      return { count: 0, error: 'Kunne ikke hente eksisterende oppgaver' }
    }

    // Kun maloppgaver (created_by=null) slettes og regenereres. Alt et
    // menneske har lagt til — frie egendefinerte oppgaver OG planlagte
    // post-prod-steg — bevares.
    const toDeleteIds = (existingTasks ?? [])
      .filter((t: { created_by: string | null }) => t.created_by === null)
      .map((t: { id: string }) => t.id)

    const preserved: (SequenceRow & { subType: 'video' | 'photo' | null })[] = (existingTasks ?? [])
      .filter((t: { created_by: string | null }) => t.created_by !== null)
      .map((t: { id: string; title: string; description: string | null; sub_type: 'video' | 'photo' | null }) => ({
        id: t.id, title: t.title, description: t.description, origin: 'existing' as const, subType: t.sub_type,
      }))

    if (toDeleteIds.length > 0) {
      const { error: deleteError } = await supabase.from('tasks').delete().in('id', toDeleteIds)
      if (deleteError) {
        console.error('reseedPostProdTasks delete error:', deleteError)
        return { count: 0, error: 'Kunne ikke slette gamle maloppgaver' }
      }
    }

    const subTypeTracks: ('video' | 'photo' | null)[] = proj.project_type === 'mixed' ? ['video', 'photo'] : [null]
    let totalInserted = 0

    for (const subType of subTypeTracks) {
      const templateProjectType = proj.project_type === 'mixed' ? subType! : proj.project_type

      const { data: templates, error: templatesError } = await supabase
        .from('task_templates')
        .select('title, description')
        .eq('pipeline_stage', 'post_prod')
        .eq('project_type', templateProjectType)
        .order('sort_order', { ascending: true })

      if (templatesError) {
        console.error('reseedPostProdTasks templates error:', templatesError)
        return { count: 0, error: 'Kunne ikke hente maler' }
      }

      if (!templates || templates.length === 0) {
        return { count: 0, error: `Ingen maler funnet for type "${templateProjectType}"` }
      }

      const freshRows: SequenceRow[] = templates.map((t: { title: string; description: string | null }) => ({
        id: null, title: t.title, description: t.description ?? null, origin: 'template' as const,
      }))

      const preservedForTrack: SequenceRow[] = preserved
        .filter(p => p.subType === subType)
        .map(p => ({ id: p.id, title: p.title, description: p.description, origin: p.origin }))

      const merged = assignSortOrder(mergeReseededSequence(freshRows, preservedForTrack))

      for (const row of merged) {
        if (row.origin === 'existing') {
          const { error } = await supabase
            .from('tasks')
            .update({ sort_order: row.sortOrder })
            .eq('id', row.id as string)

          if (error) console.error('reseedPostProdTasks reorder error:', error)
        } else {
          const { error } = await supabase.from('tasks').insert({
            project_id: projectId,
            pipeline_stage: 'post_prod',
            title: row.title,
            description: row.description,
            status: 'todo' as const,
            sort_order: row.sortOrder,
            sub_type: subType,
            is_custom: false,
            created_by: null,
            due_date: null,
            priority: null,
          })

          if (error) {
            console.error('reseedPostProdTasks insert error:', error)
            return { count: 0, error: 'Kunne ikke opprette oppgaver' }
          }
          totalInserted++
        }
      }
    }

    revalidatePath('/admin/postprod')
    revalidatePath('/admin/preprod')
    return { count: totalInserted }
  } catch (err) {
    console.error('reseedPostProdTasks error:', err)
    return { count: 0, error: 'Uventet feil' }
  }
}
```

Merk: denne nye versjonen dekker både video/foto (ett spor) og mixed (to
spor) i samme løkke, så det gamle spesialkallet til `seedMixedPostProdTasks`
inne i denne funksjonen forsvinner. `seedMixedPostProdTasks` selv røres
IKKE — den brukes fortsatt av `seedTasksFromTemplates`/`updatePipelineStage`
sin egen (additive, ikke-destruktive) seeding når et prosjekt først går inn i
post_prod-steget, og den er tittel-dedupert allerede, så den kolliderer ikke
med rader `addPlannedPostProdStep` har satt inn tidligere.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Targeted lint**

```bash
npx eslint lib/actions/pipeline.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/actions/pipeline.ts
git commit -m "fix: reseedPostProdTasks bevarer menneske-lagde steg ved Nullstill"
```

---

### Task 6: UI på pre-prod-siden — legg til og se planlagte steg

**Files:**
- Create: `app/admin/preprod/[id]/PostProdFlowPlanner.tsx`
- Modify: `app/admin/preprod/[id]/page.tsx` (import, state, effect, rendring)

**Interfaces:**
- Consumes: `getPostProdFlowOptions`, `addPlannedPostProdStep`, `deleteTask` fra `lib/actions/pipeline.ts` (Task 2–4); `PostProdFlowTrack`, `PlannedPostProdStep` typene fra Task 2.
- Produces: React-komponent `PostProdFlowPlanner` med props
  `{ projectId: string; projectType: ProjectType; tracks: PostProdFlowTrack[]; plannedSteps: PlannedPostProdStep[]; onStepAdded: () => void; onStepDeleted: (id: string) => void }`.

- [ ] **Step 1: Opprett komponentfilen**

```tsx
// app/admin/preprod/[id]/PostProdFlowPlanner.tsx
'use client'

import { useState } from 'react'
import { addPlannedPostProdStep, deleteTask, type PostProdFlowTrack, type PlannedPostProdStep } from '@/lib/actions/pipeline'
import type { ProjectType } from '@/lib/types'

const C = {
  surface:  '#21212D',
  surface2: '#2A2A38',
  border:   '#3C3C52',
  text:     '#EEEEF2',
  text2:    '#B4B4CC',
  text3:    '#8484A0',
  accent:   '#7C5CFC',
  accentBg: 'rgba(124,92,252,0.08)',
}

const INSERT_AT_END = '__end__'

export function PostProdFlowPlanner({
  projectId, projectType, tracks, plannedSteps, onStepAdded, onStepDeleted,
}: {
  projectId: string
  // Samme mønster som PostCrewSection i denne filen: project_type er typet
  // som ProjectType | null | undefined på ProjectWithPipeline, selv om det i
  // praksis alltid er satt før et prosjekt når pre-prod.
  projectType: ProjectType | null | undefined
  tracks: PostProdFlowTrack[]
  plannedSteps: PlannedPostProdStep[]
  onStepAdded: () => void
  onStepDeleted: (id: string) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [subType, setSubType] = useState<'video' | 'photo' | null>(projectType === 'mixed' ? 'video' : null)
  const [insertBeforeTitle, setInsertBeforeTitle] = useState(INSERT_AT_END)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const activeTrack = tracks.find(t => t.subType === subType) ?? tracks[0] ?? null

  async function handleAdd() {
    const trimmed = title.trim()
    if (!trimmed || saving) return
    setSaving(true)
    const result = await addPlannedPostProdStep({
      projectId,
      title: trimmed,
      description: description.trim() || undefined,
      insertBeforeTitle: insertBeforeTitle === INSERT_AT_END ? null : insertBeforeTitle,
      subType,
    })
    if (result.ok) {
      setTitle('')
      setDescription('')
      setInsertBeforeTitle(INSERT_AT_END)
      onStepAdded()
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    const result = await deleteTask(id)
    if (result.ok) onStepDeleted(id)
    setDeletingId(null)
  }

  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: '16px 18px' }}>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.text3, marginBottom: 14 }}>
        Planlagt for post-produksjon
      </p>

      {plannedSteps.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {plannedSteps.map(step => (
            <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 7, padding: '8px 12px' }}>
              <span style={{ flex: 1, fontFamily: 'var(--font-dm-sans)', fontSize: '0.8rem', color: C.text }}>
                {step.title}
                {step.subType && (
                  <span style={{ marginLeft: 6, fontSize: '0.65rem', color: C.text3 }}>
                    ({step.subType === 'video' ? 'video' : 'foto'})
                  </span>
                )}
              </span>
              <button
                onClick={() => handleDelete(step.id)}
                disabled={deletingId === step.id}
                title="Fjern planlagt steg"
                style={{ background: 'none', border: 'none', cursor: deletingId === step.id ? 'wait' : 'pointer', color: C.text3, padding: 2, lineHeight: 0 }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M2 2l8 8M10 2L2 10" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {projectType === 'mixed' && (
          <div style={{ display: 'flex', gap: 6 }}>
            {(['video', 'photo'] as const).map(opt => (
              <button
                key={opt}
                onClick={() => { setSubType(opt); setInsertBeforeTitle(INSERT_AT_END) }}
                style={{
                  fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
                  background: subType === opt ? C.accentBg : 'transparent',
                  color: subType === opt ? C.accent : C.text3,
                  border: `1px solid ${subType === opt ? 'rgba(124,92,252,0.3)' : C.border}`,
                }}
              >
                {opt === 'video' ? 'Video' : 'Foto'}
              </button>
            ))}
          </div>
        )}

        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Navn på steg, f.eks. VFX og animasjon"
          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 10px', outline: 'none' }}
        />
        <input
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Beskrivelse (valgfritt)"
          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text2, background: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 10px', outline: 'none' }}
        />

        <select
          value={insertBeforeTitle}
          onChange={e => setInsertBeforeTitle(e.target.value)}
          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', color: C.text, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, padding: '7px 10px' }}
        >
          {(activeTrack?.titles ?? []).map(t => (
            <option key={t} value={t}>Sett inn før: {t}</option>
          ))}
          <option value={INSERT_AT_END}>Sett inn sist</option>
        </select>

        <button
          onClick={handleAdd}
          disabled={!title.trim() || saving}
          style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: '0.75rem', fontWeight: 600, padding: '7px 12px', borderRadius: 6,
            cursor: title.trim() ? 'pointer' : 'not-allowed',
            background: title.trim() ? C.accentBg : 'transparent',
            color: title.trim() ? C.accent : C.text3,
            border: `1px solid ${title.trim() ? 'rgba(124,92,252,0.25)' : C.border}`,
            opacity: saving ? 0.6 : 1,
          }}
        >
          + Legg til i post-produksjon
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Eksporter typene fra pipeline.ts (hvis ikke allerede eksportert i Task 2)**

Bekreft at `PostProdFlowTrack` og `PlannedPostProdStep` er deklarert med
`export type` i `lib/actions/pipeline.ts` (de er det, per Task 2, steg 1) —
ingen endring nødvendig her, bare en sanity-sjekk før neste steg.

- [ ] **Step 3: Koble komponenten inn i pre-prod-siden — imports**

I `app/admin/preprod/[id]/page.tsx`, legg til i importblokken (etter linje 11,
`getProjectEquipment`-importen):

```typescript
import { getPostProdFlowOptions, type PostProdFlowTrack, type PlannedPostProdStep } from '@/lib/actions/pipeline'
import { PostProdFlowPlanner } from './PostProdFlowPlanner'
```

- [ ] **Step 4: Legg til state og fetch-effect**

Rett under den eksisterende `const [storageUnits, setStorageUnits] = useState<ProjectEquipmentUnit[]>([])`
(linje 983) og dens tilhørende `useEffect` (rundt linje 1001,
`getProjectEquipment(id).then(setStorageUnits)`), legg til:

```typescript
const [flowTracks, setFlowTracks] = useState<PostProdFlowTrack[]>([])
const [plannedSteps, setPlannedSteps] = useState<PlannedPostProdStep[]>([])

function refetchFlowOptions() {
  getPostProdFlowOptions(id).then(res => {
    setFlowTracks(res.tracks)
    setPlannedSteps(res.plannedSteps)
  })
}

useEffect(() => {
  refetchFlowOptions()
}, [id])
```

- [ ] **Step 5: Rendre komponenten**

I `app/admin/preprod/[id]/page.tsx`, rett etter `<PostCrewSection ... />`
(linje 1260-1267, i venstre kolonne av «Main layout»-griden), legg til:

```tsx
            {/* Planlagt for post-produksjon (f.eks. VFX/animasjon) */}
            <PostProdFlowPlanner
              projectId={id}
              projectType={project.project_type}
              tracks={flowTracks}
              plannedSteps={plannedSteps}
              onStepAdded={refetchFlowOptions}
              onStepDeleted={deletedId => setPlannedSteps(prev => prev.filter(s => s.id !== deletedId))}
            />
```

Merk: `project.project_type` har typen `ProjectType | null | undefined` (som i
`PostCrewSection`), men er i praksis alltid satt her siden komponenten
rendres etter guard-en `if (!project || !preprod) return ...` lenger opp i
filen (linje 1075) og `project_type` er et påkrevd felt ved opprettelse.
`PostProdFlowPlanner` håndterer null/undefined trygt siden all intern bruk
er `=== 'mixed'`-sammenligninger (se Step 1).

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Targeted lint**

```bash
npx eslint app/admin/preprod/\[id\]/page.tsx app/admin/preprod/\[id\]/PostProdFlowPlanner.tsx
```

- [ ] **Step 8: Commit**

```bash
git add app/admin/preprod/\[id\]/PostProdFlowPlanner.tsx app/admin/preprod/\[id\]/page.tsx
git commit -m "feat: UI for å planlegge post-prod-steg fra pre-prod"
```

---

### Task 7: Slett-knapp for planlagte steg i post-prod-detaljpanelet

**Files:**
- Modify: `app/admin/postprod/[id]/page.tsx`

**Interfaces:**
- Consumes: `deleteTask` fra `lib/actions/pipeline.ts` (allerede endret i Task 4, samme signatur som før).
- Produces: ingen nye eksporter — kun en ny handler `handleDeleteStepperTask` internt i siden, og en betinget slett-knapp i detaljpanelet.

- [ ] **Step 1: Importer `deleteTask`**

I `app/admin/postprod/[id]/page.tsx`, utvid den eksisterende import-blokken
fra `@/lib/actions/pipeline` (linje 6-14) til å inkludere `deleteTask`:

```typescript
import {
  getPostProdProjects, getTasksForProject, updateTaskStatus,
  reseedPostProdTasks, setProjectType,
  updateTaskNotes, updateTaskData, getCurrentUserProfile,
  rejectFeedbackAndReset, resetTaskAndSubsequent,
  getAllProfiles, toggleTaskAssignee, updatePostProdDelivery,
  getProjectDeliverablesSection,
  updateProjectDeliverablesSection,
  setProjectLead, getTaskMessageCounts,
  deleteTask,
} from '@/lib/actions/pipeline'
```

- [ ] **Step 2: Legg til handler**

Rett etter den eksisterende `handleCustomTaskDeleted`-funksjonen (linje
549-551, `function handleCustomTaskDeleted(taskId: string) { setTasks(prev => prev.filter(t => t.id !== taskId)) }`),
legg til:

```typescript
  async function handleDeleteStepperTask(taskId: string) {
    const result = await deleteTask(taskId)
    if (!result.ok) return
    const newTasks = tasks.filter(t => t.id !== taskId)
    setTasks(newTasks)
    const isMixedProject = projects.find(p => p.id === projectId)?.project_type === 'mixed'
    const newStepperTasks = newTasks.filter(t => !t.is_custom)
    const newDisplayTasks = isMixedProject ? newStepperTasks.filter(t => t.sub_type === activeTab) : newStepperTasks
    setSelectedIdx(getInitialIdx(newDisplayTasks))
  }
```

- [ ] **Step 3: Legg til slett-knapp i detaljpanelet**

Finn blokken (rundt linje 1203-1206):

```tsx
              {/* Task title */}
              <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.4rem', fontWeight: 700, color: C.text, marginBottom: 8, lineHeight: 1.2 }}>
                {selectedTask.title}
              </h2>
```

Erstatt med:

```tsx
              {/* Task title */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.4rem', fontWeight: 700, color: C.text, lineHeight: 1.2 }}>
                  {selectedTask.title}
                </h2>
                {selectedTask.created_by && (
                  <button
                    onClick={() => handleDeleteStepperTask(selectedTask.id)}
                    title="Fjern dette planlagte steget"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.text3, padding: 4, lineHeight: 0, flexShrink: 0 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M2 2l8 8M10 2L2 10" />
                    </svg>
                  </button>
                )}
              </div>
```

`selectedTask.created_by` er kun satt for planlagte steg lagt til av et
menneske (via `addPlannedPostProdStep`) — maloppgaver har alltid
`created_by=null`, så knappen vises aldri på dem.

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Targeted lint**

```bash
npx eslint app/admin/postprod/\[id\]/page.tsx
```

- [ ] **Step 6: Commit**

```bash
git add app/admin/postprod/\[id\]/page.tsx
git commit -m "feat: kan slette et planlagt post-prod-steg fra detaljpanelet"
```

---

### Task 8: Manuell ende-til-ende-verifisering i browser

**Files:** ingen kodeendringer — kun verifisering.

**Interfaces:** ingen (bruker allerede eksisterende funksjoner fra Task 1-7).

- [ ] **Step 1: Opprett midlertidig testbruker og testprosjekt**

Følg det etablerte mønsteret (se memory: opprett midlertidig
admin-testbruker via `supabase.auth.admin.createUser()` med service role
key; rydd opp etterpå). Opprett ett `video`-prosjekt og ett `mixed`-prosjekt,
begge i `pre_prod`-steget. **Ikke bruk et ekte kundeprosjekt eller gyldige
delings-tokens mot ekte data.**

- [ ] **Step 2: Legg til steg FØR postprod er seedet (video-prosjekt)**

Åpne pre-prod-siden for video-prosjektet. Bekreft at «Sett inn før»-listen
viser de 6 standard video-titlene (Logging, Grovklipp, Farger, Lyd, Venter på
tilbakemelding, Ferdig). Legg til «VFX og animasjon» med «Sett inn før:
Farger». Bekreft at den dukker opp i «Planlagt for post-produksjon»-listen.

Naviger til post-prod-siden for samme prosjekt. Bekreft: stepperen viser 7
steg totalt, i rekkefølgen …, Grovklipp, **VFX og animasjon**, Farger, ….

- [ ] **Step 3: Legg til steg ETTER at postprod allerede er seedet**

For samme prosjekt, gå tilbake til pre-prod og legg til «Ekstra revisjon»
med «Sett inn sist». Gå til post-prod igjen — bekreft at «Ekstra revisjon»
ligger bakerst i stepperen (etter «Ferdig»).

- [ ] **Step 4: Mixed-prosjekt — to spor**

Åpne pre-prod for mixed-prosjektet. Bekreft video/foto-toggelen i planlegger-
komponenten bytter «Sett inn før»-listen mellom de to sporenes titler. Legg
til «VFX og animasjon» på video-sporet. Gå til post-prod — bekreft at steget
kun dukker opp på video-fanen, ikke foto-fanen.

- [ ] **Step 5: Slett planlagt steg**

Slett «Ekstra revisjon» fra pre-prod-listen (før det er besøkt i post-prod
igjen om nødvendig) — bekreft at den forsvinner fra listen og fra
post-prod-stepperen. Deretter: fra post-prod-siden, klikk på «VFX og
animasjon»-steget og bruk slett-knappen i detaljpanelet — bekreft at den
forsvinner og at stepperen re-nummereres riktig (steg X av N oppdateres).

- [ ] **Step 6: Nullstill bevarer planlagte/egendefinerte steg**

På et prosjekt med både et planlagt post-prod-steg OG en fri egendefinert
oppgave (opprettet via «Egendefinerte oppgaver»-listen i post-prod), trykk
«↺ Nullstill». Bekreft: maloppgavene regenereres (samme titler som før), MEN
det planlagte steget og den frie egendefinerte oppgaven er fortsatt der
etterpå (lagt til bakerst i sekvensen).

- [ ] **Step 7: Rydd opp**

Slett testprosjektene og testbrukeren opprettet i Step 1.

- [ ] **Step 8: Full build**

```bash
npm run build
```

Forventet: grønn build, ingen nye type- eller lint-feil fra endringene i
denne planen.

- [ ] **Step 9: Oppdater CLAUDE.md/memory om ønskelig**

Ingen påkrevd endring i `CLAUDE.md` (ingen ny migrasjon, ingen ny
miljøvariabel). Vurder å nevne i prosjekt-memory at post-prod-stepperen nå
kan utvides med menneske-lagde steg via `created_by`-konvensjonen, som
grunnlag for fremtidig arbeid i samme områder.
