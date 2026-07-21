# Planlegg post-produksjonssteg fra preprod

**Dato:** 2026-07-21
**Status:** Godkjent av Magnus (design), venter på spec-review

## Mål og suksesskriterium

I dag kan man ikke legge til et ekstra steg i post-produksjonens låste
«stepper» (Redigering → Fargekorreksjon → Kundegjennomgang osv.) mens
prosjektet fortsatt er i pre-prod. Hvis et prosjekt krever noe utenom
standardflyten — f.eks. VFX/animasjon — må man vente til man er i
post-produksjon for å legge det inn, og det er lett å glemme siden det ikke
er planlagt noe sted før den tid.

Suksesskriterium: fra pre-prod-siden kan man legge til et navngitt steg
(f.eks. «VFX og animasjon»), velge hvor det skal plasseres i rekkefølgen
relativt til de andre stegene, og det steget dukker opp som et ekte,
sekvensielt steg i post-produksjonens stepper — ikke bare som en fri
notatoppgave ved siden av.

## Omfang (v1)

- Ny seksjon på pre-prod-siden: «Planlagt for post-produksjon» — tittel
  (påkrevd), beskrivelse (valgfri), «Sett inn før: [steg]»-velger bygget fra
  de faktiske stepper-stegene for prosjektets `project_type`, og for
  `mixed`-prosjekter et video/foto-valg (hvilket spor steget hører til).
- Kan legges til før post-produksjonens stepper i det hele tatt er seedet
  (dvs. før noen har åpnet postprod-siden for prosjektet) — seeding skjer da
  stille i bakgrunnen med samme mal-logikk som allerede finnes.
- Steget vises umiddelbart i post-produksjonens stepper når man åpner den
  siden, i riktig rekkefølge, og kan huket av/tildeles akkurat som andre
  stepper-steg.
- Kan slettes igjen fra pre-prod-listen (før post-prod er nådd) eller fra
  post-prod-siden.
- «↺ Nullstill»/reseed i post-produksjon endres til å bevare alt et menneske
  har lagt til (dagens frie egendefinerte oppgaver OG nye planlagte
  flow-steg) — kun maloppgavene regenereres. Ved prosjekttype-bytte kan
  eksakt posisjon ikke garanteres bevart; bevarte steg legges da bakerst i
  den nye sekvensen.

Utenfor scope i v1: å endre rekkefølgen i etterkant (dra-og-slipp / flytte),
å redigere posisjon på et allerede plassert steg, varsling når et planlagt
steg er lagt til, og støtte for å planlegge steg i andre pipeline-stadier enn
post-produksjon (feature er spesifikt pre-prod → post-prod).

## Datamodell

Ingen ny migrasjon. Gjenbruker eksisterende `tasks`-tabell og -kolonner med
presisert betydning:

- `pipeline_stage = 'post_prod'` — som i dag.
- `is_custom = false` — steget havner i den låste stepperen
  (`stepperTasks`), ikke i den frie «Egendefinerte oppgaver»-listen. Dette er
  den samme flagg-verdien maloppgaver har i dag.
- `created_by = <innlogget bruker>` — **ny betydning**: kolonnen brukes i dag
  kun til visning, men blir nå også diskriminatoren for «laget av et
  menneske» vs. «seedet fra mal» (`created_by IS NULL`). Dette er hvordan
  reseed vet hva som skal bevares.
- `sub_type` — som i dag, kun relevant for `mixed`-prosjekter.
- `sort_order` — hele sekvensen (mal-steg + nye planlagte steg) renummereres
  sekvensielt (1..N) hver gang et nytt steg settes inn, slik at «sett inn
  før X» blir eksakt uten behov for flyttall eller gap-skjema.

`deleteTask`s eksisterende sperre («nekter å slette maloppgaver») endres fra
å sjekke `is_custom` til å sjekke `created_by IS NOT NULL` — mer presist
uttrykk for den opprinnelige intensjonen («ikke la brukeren slette
systemgenererte steg»), og det som nå faktisk skiller planlagte flow-steg
(slettbare) fra maloppgaver (beskyttet).

## Mekanikk

Ny server action i `lib/actions/pipeline.ts`, f.eks.
`addPlannedPostProdStep(projectId, { title, description?, insertBeforeTitle, subType? })`:

1. Hent prosjektets `project_type`.
2. Hent eksisterende post_prod-tasks for prosjektet (ev. filtrert på
   `subType` for mixed-prosjekter), sortert på `sort_order`.
3. Hvis listen er tom (stepperen er ikke seedet ennå): hent standardmalene
   fra `task_templates` for `project_type` (samme spørring som
   `reseedPostProdTasks` bruker i dag) som utgangspunkt for sekvensen.
4. Sett det nye steget inn i riktig posisjon i denne in-memory-listen basert
   på `insertBeforeTitle` (eller sist, hvis ingen valgt).
5. Skriv hele sekvensen til databasen: eksisterende rader oppdateres kun på
   `sort_order`, nye rader (malbaserte, hvis steg 3 måtte seede først; og det
   nye planlagte steget) settes inn med fortløpende `sort_order` 1..N.

`reseedPostProdTasks` endres til:

1. Hente eksisterende post_prod-tasks (full liste, ordnet).
2. Slette kun rader med `created_by IS NULL` (maloppgaver).
3. Sette inn ferske maloppgaver for gjeldende `project_type`.
4. Renummerere: ferske maloppgaver får sin kanoniske rekkefølge (1..M),
   bevarte menneske-lagde rader (frie oppgaver + planlagte flow-steg) legges
   til slutt (M+1, M+2, …) — ingen forsøk på å gjenskape eksakt gammel
   interlevning, siden prosjekttypen kan ha endret seg og gamle ankerpunkter
   da ikke nødvendigvis finnes lenger.

## UI

Ny seksjon på pre-prod-siden (`app/admin/preprod/[id]/page.tsx`), plassert
naturlig sammen med de andre planleggingsseksjonene (pakkeliste,
produksjonsplan): kompakt skjema (tittel, valgfri beskrivelse,
posisjonsvelger, ev. video/foto-valg for mixed) + liste over allerede
planlagte steg med slett-knapp. Ingen statusveksling eller
tildeling her — det hører til i post-prod, siden steget ikke er aktivt før
prosjektet faktisk er der.

I post-produksjon kreves ingen UI-endring: eksisterende
`stepperTasks`/`StepItem`-rendering plukker automatisk opp det nye steget
siden det ligger i `tasks`-tabellen med `is_custom = false` som alt annet i
stepperen.

## Testing/verifisering

- `tsc --noEmit` og targeted `eslint` på endrede filer.
- Manuell verifisering (midlertidig testbruker/testprosjekt, ryddes opp
  etterpå — se [[feedback-testing-live-data]]): legg til et planlagt steg i
  pre-prod før postprod er seedet → åpne postprod → stepper viser steget i
  riktig posisjon. Legg til et steg etter at postprod allerede er seedet →
  verifiser innsetting. Trykk «Nullstill» → verifiser at planlagt steg og
  eksisterende frie oppgaver overlever, kun maloppgavene regenereres.
