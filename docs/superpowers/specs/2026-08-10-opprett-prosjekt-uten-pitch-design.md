# Opprett prosjekt uten pitch

## Problem

`app/admin/projects/new/page.tsx` er i dag den eneste veien til å opprette et
prosjekt, og den er uløselig koblet til pitch-generering: skjemaet krever
pitch-felt (innholdstype, prosjekttype, medium, målgruppe), seeder alltid 10
faste `sections`-rader (linje 330-341) og kaller alltid AI-generering via
`/api/generate-project` (linje 359-383) før det redirecter til pitch-editoren.
Det finnes ingen måte å bare opprette et bart prosjekt på.

Ønsket (bekreftet med Magnus): man skal kunne opprette et prosjekt uten å lage
en pitch samtidig. Siden leveringsinfo (`delivery_video`, `delivery_photo`,
`delivery_description`, `post_prod_days`) ofte er kjent før en pitch/tilbud
finnes — og allerede er egne kolonner på `projects`, uavhengig av
`sections`/pitch — skal disse feltene være tilgjengelige i opprett-skjemaet
uansett om man lager pitch samtidig eller ikke.

## Løsning — `app/admin/projects/new/page.tsx`

### Ny state

```typescript
const [formData, setFormData] = useState({
  // ... eksisterende felt uendret ...
  create_pitch: !!searchParams.get('project_id'),
  delivery_video: '',
  delivery_photo: '',
  delivery_description: '',
  post_prod_days: '' as string, // tekst-input, parses til number|null ved lagring
})
```

`create_pitch` defaulter til `false` i normalflyten (rent nytt prosjekt), men
til `true` når skjemaet åpnes med `?project_id=...` i URL-en — det er signalet
om at man kom fra "Lag pitch"-knappen på et eksisterende prosjekt (se under),
der hensikten alltid er å lage en pitch.

### Ny bryter i "Grunnleggende informasjon"

Rett under Prosjekttittel-feltet (etter linje 475): en checkbox/chip
**"Lag pitch nå"** som toggler `formData.create_pitch`, med hjelpetekst
"Av: oppretter kun prosjektet. På: AI genererer pitch-innhold basert på
feltene under." Skjules ikke — den er alltid synlig og styrer hvilke
seksjoner under som vises.

### Ny seksjon "Leveringsinfo" (alltid synlig)

Plasseres i "Grunnleggende informasjon", etter Kunde-feltet (etter linje
630): fire valgfrie felt — `delivery_video` og `delivery_photo` (tekst,
placeholder som `project.delivery_description`-feltet på prosjektsiden i dag,
f.eks. "2 kampanjefilmer á 90 sek"), `delivery_description` (tekst) og
`post_prod_days` (tall). Samme `inputStyle` som resten av skjemaet.

### Betinget rendering

Seksjonene **"Prosjektdetaljer"** (linje 635-714), **"Review"** (linje
717-748), **"Kontekst og bakgrunn"** (linje 751-766) og AI-info-boksen (linje
769-800) rendres kun når `formData.create_pitch === true`. Er den `false`,
går skjemaet rett fra "Grunnleggende informasjon" til submit-knappen.

### `isFormValid` (linje 397)

```typescript
const isFormValid = formData.create_pitch
  ? !!formData.title && !!formData.project_type && !!formData.legacy_project_type
      && formData.mediums.length > 0 && !!formData.target_audience // uendret fra i dag
  : !!formData.title && (!!selectedCustomerId || customerInput.trim().length > 0)
```

Pitch-modus er uendret fra i dag (kunde er ikke påkrevd der). Kunde blir kun
påkrevd i den nye bare-prosjekt-modusen, siden et prosjekt uten pitch
fortsatt må vite hvilken kunde det gjelder.

### `handleSubmit` (linje 225-395)

- **Insert/update av `projects`** (linje 301-319 og 276-292): legg til
  `delivery_video: formData.delivery_video || null`,
  `delivery_photo: formData.delivery_photo || null`,
  `delivery_description: formData.delivery_description || null`,
  `post_prod_days: formData.post_prod_days ? Number(formData.post_prod_days) : null`
  i begge grenene (både nytt prosjekt og gjenbruk av `existingProjectId`).
- **Sections-seeding (linje 330-355) og AI-generering (linje 357-385)**
  pakkes inn i `if (formData.create_pitch) { ... }`. Kjøres ikke i det hele
  tatt når bryteren er av.
- **Redirect** (linje 386-387): kun når `create_pitch` er `true` beholdes
  dagens `router.push(`/admin/projects/${project.id}/edit?generated=true`)`.
  Er den `false`: `router.push(`/admin/projects/${project.id}`)` — rett til
  prosjekt-huben, ingen ventetid/spinner siden ingen AI-kall gjøres.
- Submit-knappens tekst (linje 848): `formData.create_pitch ? (loading ? generatingStatus || 'Oppretter prosjekt...' : 'Opprett Prosjekt med AI') : (loading ? 'Oppretter...' : 'Opprett prosjekt')`.

## Eksisterende "Lag pitch"-knapp — manglende `project_id` (bugfix)

`app/admin/projects/[id]/page.tsx` har **allerede** en "Ingen pitch opprettet
enda"-tilstand (linje 1785-1804, styrt av `hasSections`) med en "Opprett
pitch med AI →"-knapp som lenker til:

```
/admin/projects/new?customer_id=${project.customer_id ?? ''}&title=${...}&context=${...}
```

Denne mangler `project_id` — når den brukes i dag (i praksis aldri, siden
alle prosjekter alltid får sections ved opprettelse per dagens tvungne flyt)
ville den opprettet et **duplikat**-prosjekt i stedet for å legge pitch til
det eksisterende, siden `new/page.tsx`s gjenbrukslogikk (linje 272-292) styres
av nettopp `project_id`-parameteren. Med denne endringen blir `!hasSections`
en reell, nåbar tilstand (ethvert prosjekt opprettet med `create_pitch: false`
havner der), så bugen må fikses samtidig:

```
/admin/projects/new?project_id=${projectId}&customer_id=${project.customer_id ?? ''}&title=${...}&context=${...}
```

Med `project_id` i URL-en defaulter `create_pitch` til `true` (se over), så
pitch-feltene vises og kreves med en gang skjemaet åpnes fra denne knappen —
uendret brukeropplevelse fra i dag for dette tilfellet, bare uten
duplikat-bugen.

## Ikke i scope

- Ingen migrasjon — `delivery_video`, `delivery_photo`, `delivery_description`,
  `post_prod_days` finnes allerede som kolonner på `projects`.
- Ingen endring i `/api/generate-project` eller selve AI-genereringslogikken.
- Ingen endring i `updateProjectDeliveryInfo`/`updatePostProdDelivery` i
  `lib/actions/pipeline.ts` — de brukes ikke av dette skjemaet, som setter
  kolonnene direkte i samme insert/update-kall som resten av prosjektraden
  (samme mønster som `pitch_review_enabled` osv. i dag).
- Ingen endring i "Review"-seksjonens innhold eller logikk — den skjules bare
  når `create_pitch` er av, siden den forutsetter en pitch/tilbud å godkjenne.
- Ingen endring i pipeline/task-seeding (`seedTasksFromTemplates`, linje
  327) — kjøres uendret for alle nye prosjekter uansett `create_pitch`.
- Ingen ny visning av `delivery_video`/`delivery_photo`/`post_prod_days` på
  prosjektsiden. I dag vises kun `delivery_description` noe sted i UI-et
  ("Leveres"-feltet på "Oversikt"-fanen, `app/admin/projects/[id]/page.tsx`
  linje 1476-1479) — de tre andre feltene lagres allerede i dag uten noen
  visningsflate. Opprett-skjemaet lar deg fylle dem ut, men å vise dem igjen
  et sted er en egen, separat oppgave.

## Testing

Ingen automatisert testsuite i prosjektet. Manuell verifisering:

1. Åpne "Nytt prosjekt" uten query-parametre → bekreft at "Lag pitch nå" er
   av som default, at kun tittel/kunde/leveringsinfo vises, og at
   "Opprett prosjekt"-knappen er deaktivert til tittel og kunde er fylt ut.
2. Fyll ut tittel + kunde + noen leveringsfelt, la bryteren stå av, lagre →
   bekreft at prosjektet opprettes, at man redirectes rett til
   `/admin/projects/{id}`, at ingen sections-rader finnes i databasen, at
   `delivery_description` vises i "Leveres"-feltet på Oversikt-fanen, og at
   `delivery_video`/`delivery_photo`/`post_prod_days` er lagret korrekt på
   raden i Supabase (ingen visningsflate for disse tre i dag, se "Ikke i
   scope").
3. Skru på "Lag pitch nå" i samme skjema → bekreft at prosjektdetaljer,
   review og kontekst-seksjonene dukker opp igjen, og at de påkrevde
   pitch-feltene håndheves som i dag.
4. Opprett et prosjekt med bryteren på, som i dag → bekreft uendret flyt:
   sections seedes, AI genererer, redirect til pitch-editoren.
5. Fra et bart prosjekt (opprettet i steg 2): åpne "Pitch & Tilbud"-fanen på
   prosjektsiden → bekreft "Ingen pitch opprettet enda" vises, trykk
   "Opprett pitch med AI →" → bekreft at skjemaet åpnes med tittel og kunde
   forhåndsutfylt, `create_pitch` allerede på, og at lagring **oppdaterer det
   samme prosjektet** (samme `id`, ingen duplikat i prosjektlisten) og seeder
   sections/genererer pitch på det.
6. Bekrefte at `tsc --noEmit`, `eslint` og `npm run build` er grønne.
