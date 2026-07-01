# Skjul kontrakt fra pitch

## Problem

Det finnes allerede en måte å skjule kontrakten fra kunden på: "Fjern"-knappen på
Kontrakt-fanen (`unpublishContract()`) setter `contracts.published_at = null`, og siden
`/p/[token]`-siden kun viser kontrakten når `published_at` er satt, forsvinner den fra
kundevisningen.

Problemet er koblingen denne knappen har til intern pipeline-sporing: å fjerne publiseringen
nullstiller også `stepperContractPublished`, som er "kontrakt er klar"-avkrysningen i
`TilbudStepper` (steg 2 i "Sende tilbud"-flyten). Man vil kunne skjule kontraktseksjonen fra
selve den offentlige pitchen — fordi kontraktsignering ikke brukes operativt ennå — uten at det
påvirker denne interne fullført-sporingen eller noe annet ved kontrakt-fanen.

## Løsning

Fire små, uavhengige endringer:

### 1. Lagring — ingen migrasjon

Legg til et felt `contract_hidden_from_pitch: boolean` inne i den eksisterende
`projects.pipeline_data`-JSON-kolonnen. Dette følger et etablert mønster i kodebasen — se f.eks.
`contract_unsigned_proceed`-flagget som allerede settes i `lib/actions/pipeline.ts:1636-1639`.
Ingen ny migrasjon, ingen ny kolonne.

### 2. Server action

Ny funksjon `setContractHiddenFromPitch(projectId: string, hidden: boolean): Promise<void>` i
`lib/actions/contracts.ts` (samme fil som de andre kontrakt-handlingene). Følger mønsteret fra
`lib/actions/preprod.ts:174` og `app/api/contracts/sign/route.ts:189`: hent eksisterende
`pipeline_data`, spre inn eksisterende felter, sett det nye feltet, oppdater raden.

```typescript
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

### 3. Offentlig side — ett sted, helt frikoblet

I `app/p/[token]/page.tsx`, rett etter at `publishedContract` bygges fra
`contracts.published_at` (rundt linje 341-351): hvis
`(project.pipeline_data as { contract_hidden_from_pitch?: boolean } | null)?.contract_hidden_from_pitch`
er `true`, sett `publishedContract` til `null` uansett `published_at`.

Dette er det eneste stedet på kundesiden som må endres — `PublicProjectClient.tsx` gjør allerede
kun `{publishedContract && projectId && <ContractSigningSection ... />}`, og `QuoteSection`s
`hasPublishedContract`-prop (som styrer CTA-tekst) følger automatisk med siden den er utledet av
samme verdi. `contracts.published_at`, signeringsstatus og Kontrakt-fanen i admin påvirkes ikke i
det hele tatt.

### 4. Bryter i pitch-editoren

Ett nytt element i `EditProjectTopBar`s "Mer"-nedtrekk (`components/project/EditProjectTopBar.tsx`,
samme meny som allerede har "Kopier link", "E-post →", "Ny versjon" osv.), med samme
toggle-mønster som brukes for NO↔EN-oversettelsesknappen: label og handling endrer seg basert på
gjeldende tilstand.

- Ny prop på `EditProjectTopBar`: `contractHiddenFromPitch: boolean` og
  `onToggleContractHidden: () => void`.
- Label: `"Skjul kontrakt fra kunde"` når synlig (`contractHiddenFromPitch === false`),
  `"Vis kontrakt for kunde"` når skjult (`contractHiddenFromPitch === true`).
- I `app/admin/projects/[id]/edit/page.tsx`: les initial verdi fra
  `project?.pipeline_data?.contract_hidden_from_pitch ?? false`, kall
  `setContractHiddenFromPitch(id, !current)` ved klikk, og oppdater lokal state optimistisk med
  `setProject` — samme mønster som allerede brukes for oversettelse på linje 171.

## Ikke i scope

- Ingen endring i `publishContract`/`unpublishContract`, `stepperContractPublished`,
  `TilbudStepper`, eller noe annet ved den interne "kontrakt er klar"-sporingen.
- Ingen håndtering av signerte kontrakter spesielt — bryteren skjuler uansett status, siden
  formålet er å slå av kundesynlighet mens signeringsflyten ikke er i operativ bruk. Hvis
  signerte kontrakter trenger annen behandling senere, tas det som egen sak.
- Ingen ny migrasjon, ingen nye databasekolonner.

## Testing

- Manuell verifisering (ingen automatisert testsuite i prosjektet, jf. tidligere spec-er i denne
  omgang):
  1. Åpne pitch-editoren for et prosjekt med publisert kontrakt → trykk "Skjul kontrakt fra
     kunde" i "Mer"-menyen → åpne `/p/{token}` i inkognito → kontraktseksjonen skal ikke vises.
  2. Gå til Kontrakt-fanen i admin → bekreft at kontrakten fortsatt vises som publisert der, og
     at `stepperContractPublished`/TilbudStepper-steg 2 fortsatt viser "ferdig" hvis det var det
     før.
  3. Trykk "Vis kontrakt for kunde" igjen → kontraktseksjonen skal dukke opp på `/p/{token}` på
     nytt.
  4. Bekreft at `tsc --noEmit`, `eslint` og `npm run build` er grønne.
