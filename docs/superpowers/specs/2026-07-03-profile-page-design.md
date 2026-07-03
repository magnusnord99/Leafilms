# Profilside med navn og avatarfarge

## Bakgrunn

Avatar-farger genereres i dag fra en hash av bruker-ID, duplisert i 5 filer
(`app/admin/faktura/[id]/page.tsx`, `pipeline/page.tsx`, `projects/[id]/page.tsx`,
`preprod/[id]/page.tsx`, `postprod/[id]/page.tsx`) med to litt ulike 7-8-fargede
paletter. Navnet øverst til høyre i admin-headeren (`app/admin/layout.tsx:216-219`)
er ikke klikkbart og leder ingen steder. Det finnes ingen `lib/actions/profile.ts`
og ingen delt Avatar-komponent fra før.

Målet er en profilside der en bruker kan endre sitt eget navn og velge en av 15
faste farger til sitt ikon/avatar. Ingen to brukere kan eie samme farge samtidig.

## Datamodell

Migrasjon `supabase/migrations/065_profile_color.sql`:

- Legg til `color TEXT` (nullable) på `profiles`.
- `CHECK` constraint som begrenser `color` til de 15 godkjente hex-verdiene
  (se palett under).
- Unik **partial** index: `CREATE UNIQUE INDEX profiles_color_unique ON profiles(color) WHERE color IS NOT NULL`.
  Dette er den eneste kilden til sannhet for "opptatt/ledig" — håndhever
  uniqueness selv ved samtidige valg fra to klienter.
- Ingen backfill. Eksisterende brukere får `color = NULL` og faller tilbake til
  dagens hash-baserte farge helt til de selv besøker profilsiden og velger en.
- RLS: eksisterende policies på `profiles` ("Users can update own profile")
  dekker allerede dette — ingen nye policies nødvendig.

## Delt palett og avatar-helper

Ny fil `lib/avatar-colors.ts`:

```ts
export const AVATAR_COLORS = [
  '#7C5CFC', // lilla (brand-aksent)
  '#9B6BD9', // orkide
  '#6B7EC4', // lavendel
  '#4A8FA8', // stålblå
  '#4A9AC4', // himmelblå
  '#50C8C8', // turkis
  '#4CAF7D', // grønn
  '#5C9E6B', // mosegrønn
  '#8FA84A', // oliven
  '#C49434', // gull
  '#E0A840', // rav
  '#E07B54', // terrakotta
  '#C4634A', // rust
  '#B85C8A', // rosa
  '#E8529A', // magenta
] as const

export type AvatarColor = typeof AVATAR_COLORS[number]

function hashFallback(id: string): AvatarColor {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

export function getAvatarColor(profile: { id: string; color?: string | null }): string {
  return profile.color ?? hashFallback(profile.id)
}
```

De 5 eksisterende filene bytter sine lokale `avatarColor()`/`profileColor()`/
`getProfileColor()`-funksjoner og lokale `AVATAR_COLORS`/`PROFILE_COLORS`-konstanter
ut med import fra denne modulen. Der `profiles` hentes via server actions med
eksplisitt kolonnevalg (`pipeline.ts`, `preprod.ts`, `leads.ts`, m.fl.) legges
`color` til i de relevante `.select(...)`-kallene og i de tilhørende TypeScript-typene.

## Server actions

Ny fil `lib/actions/profile.ts`:

- `updateProfileName(name: string)` — oppdaterer `profiles.name` for innlogget
  bruker (`auth.uid()`). Trimmer og validerer non-empty.
- `updateProfileColor(color: string)` — validerer at `color` er i `AVATAR_COLORS`,
  sjekker om fargen er tatt av en *annen* bruker (query mot `profiles`), og
  returnerer en tydelig feil (`"Fargen er allerede tatt av <navn>"`) uten å
  forsøke skriving hvis den er opptatt. Hvis sjekken går gjennom, gjør update.
  Fanger unique-constraint-brudd fra DB (race condition — to klienter velger
  samme farge samtidig) og returnerer `"Fargen ble nettopp tatt av noen andre, velg en annen."`

Begge er server actions (`'use server'`), følger mønsteret i eksisterende
`lib/actions/*.ts`-filer.

## Profilside

Ny fil `app/admin/profile/page.tsx` (client component, bruker `useAuth`):

- **Navn**: tekstfelt forhåndsutfylt med `profile.name`, "Lagre"-knapp som
  kaller `updateProfileName`. Enkel inline bekreftelse ved suksess.
- **Farge**: rutenett av 15 sirkler i `AVATAR_COLORS`-rekkefølge.
  - Egen valgte farge: synlig ring/checkmark.
  - Ledige farger: klikkbare, lagres **momentant** ved klikk (kaller
    `updateProfileColor` direkte, optimistisk UI, revert ved feil) — ingen
    egen lagre-knapp for farge.
  - Opptatte farger (eid av andre): grået ut, ikke klikkbare, `title`-tooltip
    med eierens navn.
  - Data om hvem som eier hvilken farge hentes med ett query
    (`select id, name, color from profiles where color is not null`) ved
    sidelasting.

`hooks/useAuth.ts` sin `Profile`-type utvides med `color: string | null`.

## Header-integrasjon

`app/admin/layout.tsx` (rundt linje 213-219):

- Navnet (`profile.name || profile.email`) pakkes i en `Link` til `/admin/profile`.
- En liten avatar-sirkel (initialer, `getAvatarColor(profile)`) legges til
  foran navnet — gir synlig påminnelse om egen farge og et tydeligere
  klikkmål enn ren tekst.

## Feilhåndtering

- Tomt navn: valideringsfeil i UI, ingen server-kall.
- Fargevalg som allerede er tatt: knappen er disabled i utgangspunktet
  (basert på hentet liste), så dette skjer normalt kun ved race condition —
  håndteres av DB unique constraint + venlig feilmelding, og swatch-listen
  refetches for å vise korrekt status.

## Utenfor scope

- Opplasting av profilbilde (kun initialer + farge).
- Endring av passord/e-post.
- Adminredigering av andres navn/farge (kun egen profil).
