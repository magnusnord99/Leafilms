# Skjul kontrakt fra pitch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Legg til en av/på-bryter i pitch-editoren som skjuler kontraktseksjonen fra den offentlige `/p/[token]`-siden, helt uavhengig av `contracts.published_at`, signeringsstatus og `TilbudStepper`s interne "kontrakt er klar"-sporing.

**Architecture:** Ett nytt boolsk flagg (`contract_hidden_from_pitch`) lagres i den eksisterende `projects.pipeline_data`-JSON-kolonnen (samme mønster som `contract_unsigned_proceed`-flagget som allerede finnes der). Én ny server action skriver flagget. Ett sted på den offentlige siden leser det og nuller ut `publishedContract` når flagget er satt — resten av kundesiden (`PublicProjectClient.tsx`, `QuoteSection`) trenger ingen endring siden de allerede er fullt utledet av `publishedContract`. Én ny bryter i "Mer"-menyen i pitch-editoren kaller action og oppdaterer lokal state optimistisk.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (server actions med `'use server'`), React client components. Ingen automatisert testsuite i prosjektet — verifisering skjer via `npx tsc --noEmit`, `npm run lint`, `npm run build`, og manuell klikk-gjennomgang.

## Global Constraints

- Ingen ny databasemigrasjon — flagget lagres i den eksisterende `pipeline_data`-JSON-kolonnen på `projects`.
- Ingen endring i `publishContract`, `unpublishContract`, `stepperContractPublished` eller `TilbudStepper` — bryteren skal være fullstendig frikoblet fra den interne pipeline-sporingen.
- Norsk UI-tekst, konsistent med resten av appen.
- Følg eksisterende `setProject`-optimistisk-oppdatering-mønster fra `app/admin/projects/[id]/edit/page.tsx:171` (oversettelsesknappen).

---

## Task 1: Server action for å sette/fjerne skjul-flagget

**Files:**
- Modify: `lib/actions/contracts.ts` (legg til ny funksjon etter `unpublishContract`, som slutter på linje 282)

**Interfaces:**
- Consumes: ingenting nytt fra tidligere tasks.
- Produces: `setContractHiddenFromPitch(projectId: string, hidden: boolean): Promise<void>` — brukes av Task 4.

- [ ] **Step 1: Legg til funksjonen på slutten av filen**

Åpne `lib/actions/contracts.ts`. Etter den siste linjen i filen (linje 282-283, slutten av
`unpublishContract`), legg til:

```typescript

// ---------------------------------------------------------------------------
// Skjul/vis kontraktseksjonen på den offentlige pitchen (uavhengig av published_at)
// ---------------------------------------------------------------------------
export async function setContractHiddenFromPitch(projectId: string, hidden: boolean): Promise<void> {
  const supabase = await createClient()

  const { data: project } = await supabase
    .from('projects')
    .select('pipeline_data')
    .eq('id', projectId)
    .single()

  const existingPipelineData = (project?.pipeline_data as Record<string, unknown>) ?? {}

  const { error } = await supabase
    .from('projects')
    .update({
      pipeline_data: { ...existingPipelineData, contract_hidden_from_pitch: hidden },
      updated_at: new Date().toISOString(),
    })
    .eq('id', projectId)

  if (error) {
    console.error('setContractHiddenFromPitch error:', error)
    throw new Error('Kunne ikke oppdatere synlighet for kontrakten')
  }
}
```

- [ ] **Step 2: Typecheck**

Kjør:
```bash
npx tsc --noEmit
```
Forventet: ingen feil.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/contracts.ts
git commit -m "$(cat <<'EOF'
Legg til server action for å skjule kontrakt fra pitch

Ny setContractHiddenFromPitch() skriver et flagg i projects.pipeline_data
(samme mønster som contract_unsigned_proceed), uten å røre
contracts.published_at eller signeringsstatus.
EOF
)"
```

---

## Task 2: Gate kontraktseksjonen på den offentlige siden

**Files:**
- Modify: `app/p/[token]/page.tsx:340-351`

**Interfaces:**
- Consumes: `project.pipeline_data` (allerede hentet via `select('*')` på `projects`-tabellen rundt linje 118-122 i samme fil — ingen endring i den spørringen trengs).
- Produces: ingenting nytt eksportert — kun endret verdi på lokal `publishedContract`-variabel som allerede konsumeres av `PublicProjectClient` (linje ~354-368).

- [ ] **Step 1: Finn nåværende blokk**

```typescript
  // Hent publisert kontrakt
  const { data: contractData } = await supabase
    .from('contracts')
    .select('contract_text, published_at, status, signed_at, signed_by')
    .eq('project_id', share.project_id)
    .single()

  const publishedContract = contractData?.published_at ? {
    contractText: contractData.contract_text ?? '',
    isSigned: contractData.status === 'signed',
    signedBy: contractData.signed_by ?? null,
  } : null
```

- [ ] **Step 2: Legg til skjul-sjekken**

Erstatt med:

```typescript
  // Hent publisert kontrakt
  const { data: contractData } = await supabase
    .from('contracts')
    .select('contract_text, published_at, status, signed_at, signed_by')
    .eq('project_id', share.project_id)
    .single()

  const contractHiddenFromPitch = !!(project.pipeline_data as { contract_hidden_from_pitch?: boolean } | null)?.contract_hidden_from_pitch

  const publishedContract = contractData?.published_at && !contractHiddenFromPitch ? {
    contractText: contractData.contract_text ?? '',
    isSigned: contractData.status === 'signed',
    signedBy: contractData.signed_by ?? null,
  } : null
```

- [ ] **Step 3: Typecheck**

Kjør:
```bash
npx tsc --noEmit
```
Forventet: ingen feil. (`project` er allerede typet med `pipeline_data` som del av `select('*')`-resultatet fra `projects`-tabellen lenger opp i samme funksjon.)

- [ ] **Step 4: Commit**

```bash
git add "app/p/[token]/page.tsx"
git commit -m "$(cat <<'EOF'
Skjul kontraktseksjonen på pitchen når contract_hidden_from_pitch er satt

publishedContract bygges nå kun når kontrakten er publisert OG ikke
eksplisitt skjult via pipeline_data.contract_hidden_from_pitch.
PublicProjectClient og QuoteSection trenger ingen endring siden de
allerede er fullt utledet av publishedContract.
EOF
)"
```

---

## Task 3: Bryter i `EditProjectTopBar`s "Mer"-meny

**Files:**
- Modify: `components/project/EditProjectTopBar.tsx`

**Interfaces:**
- Consumes: ingenting fra Task 1/2 direkte (kun props fra kallstedet i Task 4).
- Produces: nye props `contractHiddenFromPitch?: boolean` og `onToggleContractHidden?: () => void` på `EditProjectTopBar` — brukes av Task 4 sitt kallsted.

- [ ] **Step 1: Legg til nye props i typen**

Finn (linje 24-43):
```typescript
interface EditProjectTopBarProps {
  project: Project
  sections: Section[]
  editMode: boolean
  saving: boolean
  publishing: boolean
  showMobilePreview: boolean
  shareLink: string | null
  translating?: boolean
  onEditModeToggle: () => void
  onMobilePreviewToggle: () => void
  onSave: () => void
  onPublish: () => void
  onAddQuoteSection: () => void
  onAddFullImageSection?: () => void
  onAddProductionScheduleSection?: () => void
  onDuplicateVersion?: () => void
  onTranslate?: () => void
  duplicating?: boolean
}
```

Erstatt med:
```typescript
interface EditProjectTopBarProps {
  project: Project
  sections: Section[]
  editMode: boolean
  saving: boolean
  publishing: boolean
  showMobilePreview: boolean
  shareLink: string | null
  translating?: boolean
  contractHiddenFromPitch?: boolean
  onEditModeToggle: () => void
  onMobilePreviewToggle: () => void
  onSave: () => void
  onPublish: () => void
  onAddQuoteSection: () => void
  onAddFullImageSection?: () => void
  onAddProductionScheduleSection?: () => void
  onDuplicateVersion?: () => void
  onTranslate?: () => void
  onToggleContractHidden?: () => void
  duplicating?: boolean
}
```

- [ ] **Step 2: Destrukturer de nye propene**

Finn (linje 45-64):
```typescript
export function EditProjectTopBar({
  project,
  sections,
  editMode,
  saving,
  publishing,
  showMobilePreview,
  shareLink,
  translating = false,
  onEditModeToggle,
  onMobilePreviewToggle,
  onSave,
  onPublish,
  onAddQuoteSection,
  onAddFullImageSection,
  onAddProductionScheduleSection,
  onDuplicateVersion,
  onTranslate,
  duplicating = false,
}: EditProjectTopBarProps) {
```

Erstatt med:
```typescript
export function EditProjectTopBar({
  project,
  sections,
  editMode,
  saving,
  publishing,
  showMobilePreview,
  shareLink,
  translating = false,
  contractHiddenFromPitch = false,
  onEditModeToggle,
  onMobilePreviewToggle,
  onSave,
  onPublish,
  onAddQuoteSection,
  onAddFullImageSection,
  onAddProductionScheduleSection,
  onDuplicateVersion,
  onTranslate,
  onToggleContractHidden,
  duplicating = false,
}: EditProjectTopBarProps) {
```

- [ ] **Step 3: Legg til menyelementet**

Finn `onTranslate`-elementet i `secondaryItems` (rundt linje 123-129):
```typescript
    onTranslate && {
      label: translating
        ? 'Oversetter...'
        : project.language === 'en' ? 'NO → EN' : 'EN → NO',
      action: () => { if (!translating && !saving) { onTranslate!(); setMenuOpen(false) } },
      disabled: translating || saving,
    },
  ].filter(Boolean) as Array<{
    label: string
    action?: (e: React.MouseEvent<HTMLButtonElement>) => void
    href?: string
    disabled?: boolean
```

Erstatt med (legger til det nye elementet rett etter oversett-elementet, før `.filter(Boolean)`):
```typescript
    onTranslate && {
      label: translating
        ? 'Oversetter...'
        : project.language === 'en' ? 'NO → EN' : 'EN → NO',
      action: () => { if (!translating && !saving) { onTranslate!(); setMenuOpen(false) } },
      disabled: translating || saving,
    },
    onToggleContractHidden && {
      label: contractHiddenFromPitch ? 'Vis kontrakt for kunde' : 'Skjul kontrakt fra kunde',
      action: () => { onToggleContractHidden(); setMenuOpen(false) },
    },
  ].filter(Boolean) as Array<{
    label: string
    action?: (e: React.MouseEvent<HTMLButtonElement>) => void
    href?: string
    disabled?: boolean
```

- [ ] **Step 4: Typecheck**

Kjør:
```bash
npx tsc --noEmit
```
Forventet: ingen feil relatert til `EditProjectTopBar` (kallstedet i `edit/page.tsx` mangler ennå de nye propene, men siden begge er valgfrie (`?`), skal ikke det gi feil før Task 4).

- [ ] **Step 5: Commit**

```bash
git add components/project/EditProjectTopBar.tsx
git commit -m "$(cat <<'EOF'
Legg til "skjul kontrakt fra kunde"-bryter i pitch-editorens Mer-meny

Nye valgfrie props contractHiddenFromPitch/onToggleContractHidden på
EditProjectTopBar, med samme toggle-label-mønster som NO↔EN-knappen.
EOF
)"
```

---

## Task 4: Koble sammen i redigeringssiden

**Files:**
- Modify: `app/admin/projects/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `setContractHiddenFromPitch(projectId: string, hidden: boolean): Promise<void>` fra Task 1 (`@/lib/actions/contracts`); `contractHiddenFromPitch`/`onToggleContractHidden`-props fra Task 3.
- Produces: ingenting nytt for senere tasks — dette er siste task.

- [ ] **Step 1: Importer den nye action-en**

Finn toppen av filen. Legg til en ny import-linje rett under de andre lokale importene (etter linje 25, `import { C } from '@/lib/admin-theme'`):

```typescript
import { setContractHiddenFromPitch } from '@/lib/actions/contracts'
```

- [ ] **Step 2: Legg til handler-funksjonen**

Finn `handleTranslate`-funksjonen (linje 152-179), som slutter med:
```typescript
    } finally {
      setTranslating(false)
    }
  }

  const handleDuplicateVersion = async () => {
```

Sett inn en ny funksjon mellom disse to:
```typescript
    } finally {
      setTranslating(false)
    }
  }

  const handleToggleContractHidden = async () => {
    if (!project) return
    const nextHidden = !(project.pipeline_data as { contract_hidden_from_pitch?: boolean } | null)?.contract_hidden_from_pitch
    setProject(prev => prev ? { ...prev, pipeline_data: { ...prev.pipeline_data, contract_hidden_from_pitch: nextHidden } } : prev)
    try {
      await setContractHiddenFromPitch(id, nextHidden)
    } catch (err) {
      console.error('Toggle contract hidden error:', err)
      setProject(prev => prev ? { ...prev, pipeline_data: { ...prev.pipeline_data, contract_hidden_from_pitch: !nextHidden } } : prev)
      alert('Kunne ikke oppdatere synlighet for kontrakten. Prøv igjen.')
    }
  }

  const handleDuplicateVersion = async () => {
```

- [ ] **Step 3: Send propene til `EditProjectTopBar`**

Finn kallstedet (linje 360-379):
```typescript
      <EditProjectTopBar
        project={project}
        sections={sections}
        editMode={editMode}
        saving={saving}
        publishing={publishing}
        showMobilePreview={showMobilePreview}
        shareLink={shareLink}
        translating={translating}
        onEditModeToggle={() => setEditMode(!editMode)}
        onMobilePreviewToggle={() => setShowMobilePreview(!showMobilePreview)}
        onSave={() => handleSave(true)}
        onPublish={togglePublish}
        onAddFullImageSection={addFullImageSection}
        onAddQuoteSection={addQuoteSection}
        onAddProductionScheduleSection={addProductionScheduleSection}
        onDuplicateVersion={handleDuplicateVersion}
        onTranslate={handleTranslate}
        duplicating={duplicating}
      />
```

Erstatt med:
```typescript
      <EditProjectTopBar
        project={project}
        sections={sections}
        editMode={editMode}
        saving={saving}
        publishing={publishing}
        showMobilePreview={showMobilePreview}
        shareLink={shareLink}
        translating={translating}
        contractHiddenFromPitch={!!(project?.pipeline_data as { contract_hidden_from_pitch?: boolean } | null)?.contract_hidden_from_pitch}
        onEditModeToggle={() => setEditMode(!editMode)}
        onMobilePreviewToggle={() => setShowMobilePreview(!showMobilePreview)}
        onSave={() => handleSave(true)}
        onPublish={togglePublish}
        onAddFullImageSection={addFullImageSection}
        onAddQuoteSection={addQuoteSection}
        onAddProductionScheduleSection={addProductionScheduleSection}
        onDuplicateVersion={handleDuplicateVersion}
        onTranslate={handleTranslate}
        onToggleContractHidden={handleToggleContractHidden}
        duplicating={duplicating}
      />
```

- [ ] **Step 4: Typecheck**

Kjør:
```bash
npx tsc --noEmit
```
Forventet: ingen feil.

- [ ] **Step 5: Lint**

Kjør:
```bash
npm run lint
```
Forventet: ingen nye feil sammenlignet med baseline (sammenlign linjenummer-forskjøvne pre-eksisterende feil i `app/admin/projects/[id]/edit/page.tsx` mot `git stash`-tilstand hvis usikker — samme fremgangsmåte som brukt i forrige økt).

- [ ] **Step 6: Build**

Kjør:
```bash
npm run build
```
Forventet: grønn build, ingen nye feil.

- [ ] **Step 7: Manuell verifisering i dev-server**

```bash
npm run dev
```

I nettleser:
1. Åpne pitch-editoren for et prosjekt som har en publisert kontrakt (Kontrakt-fanen viser
   "Publisert — venter på signering" eller er signert).
2. Åpne `/p/{token}` for prosjektet i en annen fane → bekreft at kontraktseksjonen vises.
3. Gå tilbake til editoren, åpne "Mer"-menyen → trykk "Skjul kontrakt fra kunde".
4. Last `/p/{token}`-fanen på nytt → kontraktseksjonen skal nå være borte, resten av pitchen
   (hero, seksjoner, tilbud) skal se ut som før.
5. Gå til admin-prosjektsiden (`/admin/projects/{id}`) → Kontrakt-fanen → bekreft at kontrakten
   fortsatt viser samme publiserings-/signeringsstatus som før (ingen endring der), og at
   TilbudStepper (hvis prosjektet er i `tilbud_sendt`-steget) fortsatt viser steg 2 som ferdig
   hvis det var ferdig fra før.
6. Åpne "Mer"-menyen igjen → knappen skal nå si "Vis kontrakt for kunde" → trykk den → last
   `/p/{token}` på nytt → kontraktseksjonen skal dukke opp igjen.

Hvis noe av dette avviker, stopp og undersøk før commit.

- [ ] **Step 8: Commit**

```bash
git add "app/admin/projects/[id]/edit/page.tsx"
git commit -m "$(cat <<'EOF'
Koble sammen "skjul kontrakt fra kunde"-bryteren i pitch-editoren

handleToggleContractHidden oppdaterer lokal project-state optimistisk og
kaller setContractHiddenFromPitch(), med rollback ved feil. Samme
optimistisk-oppdatering-mønster som brukes for oversettelsesknappen.
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Spec punkt 1 ("Lagring — ingen migrasjon") → Task 1 skriver flagget inn i `pipeline_data`,
  ingen migrasjon opprettet.
- Spec punkt 2 ("Server action") → Task 1, signatur og implementasjon matcher spec ordrett.
- Spec punkt 3 ("Offentlig side") → Task 2, samme betingelse (`published_at && !hidden`) som spec
  beskriver.
- Spec punkt 4 ("Bryter i pitch-editoren") → Task 3 (UI-element) + Task 4 (kobling/handler).
- Spec "Ikke i scope" (ingen endring i publish/unpublish/TilbudStepper, ingen signert-håndtering,
  ingen migrasjon) → ingen task rører disse.
- Spec "Testing"-seksjon → dekket av Task 4 Step 7 (manuell verifisering, inkludert eksplisitt
  sjekk av at Kontrakt-fanen/TilbudStepper er uendret).

**Placeholder-skanning:** ingen TBD/TODO, alle kodeblokker komplett utskrevet.

**Type-konsistens:** `setContractHiddenFromPitch(projectId: string, hidden: boolean): Promise<void>`
defineres i Task 1 og importeres/kalles med nøyaktig samme navn og argumentrekkefølge i Task 4
Step 2 (`setContractHiddenFromPitch(id, nextHidden)`). Prop-navnene `contractHiddenFromPitch` og
`onToggleContractHidden` er identiske mellom Task 3 (definisjon på `EditProjectTopBar`) og Task 4
(kallsted). Flaggnøkkelen `contract_hidden_from_pitch` er identisk i Task 1 (skriving), Task 2
(lesing på offentlig side) og Task 4 (lesing for initial prop-verdi og i handleren).
