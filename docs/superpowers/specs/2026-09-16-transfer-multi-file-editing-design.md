# Design: redigerbare leveranser med flere filer/mapper

**Dato:** 2026-09-16
**Status:** Godkjent av Magnus i chat, venter på spec-review før implementeringsplan

## Bakgrunn

Leveranser (`/admin/transfers`, offentlig side `/d/[token]`) ble bygget 2026-09-16
som erstatning for Filemail. I dag er hver leveranse ÉN fil, og det finnes ingen
redigeringsside — bare opprett og (soft-)slett. Magnus vil kunne:

1. Endre hva som ligger i leveransen etter at lenken er sendt — inkludert å ha en
   ekte mappestruktur med flere filer, ikke bare én zip.
2. Endre bakgrunnsbilde og logo på en allerede sendt leveranse.

Underveis i designet ble det i tillegg bestemt å fikse en funnet bug: passordfeltet
på leveranser (`password_hash`) blir aldri faktisk validert server-side i dag —
klienten sjekker bare at feltet ikke er tomt. Siden nedlastings-API-et uansett
bygges om fra bunnen for multi-fil-støtte, fikses dette i samme slengen.

## Datamodell

Ny tabell `transfer_files` — én rad per fil i leveransen:

```
transfer_files
  id             uuid        PK
  transfer_id    uuid        NOT NULL REFERENCES transfers(id) ON DELETE CASCADE
  r2_key         text        NOT NULL   -- full R2-nøkkel, f.eks. transfers/<r2_folder>/Stillbilder/IMG_0001.jpg
  relative_path  text        NOT NULL   -- sti innenfor leveransen, bærer mappestrukturen, f.eks. "Stillbilder/IMG_0001.jpg"
  file_size      bigint      NOT NULL
  content_type   text
  created_at     timestamptz NOT NULL DEFAULT now()
```

`transfers` får en ny kolonne `r2_folder text NOT NULL` — R2-mappenavnet
(tilfeldig hex, samme mønster som dagens `randomBytes(16).toString('hex')`)
som alle filer i denne leveransen deler. Satt én gang ved opprettelse, gjenbrukt
når filer legges til senere via redigering — slik havner alle filer i én
leveranse alltid i samme R2-mappe uansett når de ble lastet opp.

Kolonnene `r2_key`, `filename`, `filesize_bytes`, `content_type` fjernes fra
`transfers` (flyttet til `transfer_files`).

**Migrasjon `159_transfer_files.sql`:**
1. Opprett `transfer_files`-tabellen (med RLS, samme "authenticated full access"-
   mønster som `customer_logo_files` i 149).
2. `ALTER TABLE transfers ADD COLUMN r2_folder text`.
3. Backfill `r2_folder` ved å splitte eksisterende `r2_key` (`transfers/<folder>/<filename>` →
   `<folder>`-delen).
4. `INSERT INTO transfer_files (transfer_id, r2_key, relative_path, file_size, content_type)`
   — én rad per eksisterende leveranse, `relative_path = filename`.
5. `ALTER TABLE transfers ALTER COLUMN r2_folder SET NOT NULL`, drop de gamle
   fil-kolonnene (`r2_key`, `filename`, `filesize_bytes`, `content_type`).

Eksisterende lenker fortsetter å virke uendret — de rendres nå bare som en
leveranse med én fil i den nye modellen.

## Delt opplastingslogikk

`uploadFileToR2` (multipart-opplasting rett fra nettleser til R2, se
`app/admin/transfers/new/TransferUploadClient.tsx:18`) og orkestreringen rundt
`initiateUpload`/`getUploadPartUrl`/`completeUpload` trekkes ut til
`lib/upload/transferUpload.ts`. Denne eksporterer en funksjon som tar
`(file, relativePath, folder, onProgress)` og returnerer den ferdige
`transfer_files`-raden sine felter. Både "ny leveranse"-siden og den nye
redigeringssiden bruker denne — ingen duplisert opplastingslogikk.

`initiateUpload` i `lib/actions/transfers.ts` utvides til å ta imot
`{ filename, contentType, folder, relativePath }` og bygger
`key = transfers/${folder}/${relativePath}` (i stedet for å generere en ny
tilfeldig mappe per fil som i dag).

**Opplastings-UI** (gjenbrukt komponent brukt av både opprett og rediger):
- "Legg til filer" — vanlig multi-file `<input>`, relative_path = filnavn.
- "Velg mappe" — `<input type="file" webkitdirectory multiple>`, relative_path
  hentes fra `file.webkitRelativePath`.
- Viser filtre med total størrelse/antall før opplasting starter (se mockup
  godkjent tidligere i samtalen).
- Filene lastes opp med litt samtidighet (et par filer om gangen, hver
  internt multipart-delt som i dag).

## Server actions (`lib/actions/transfers.ts`)

- `createTransfer` endres til å ta `files: { r2_key, relative_path, filesize_bytes, content_type }[]`
  i stedet for enkeltfil-felter — setter inn transfer-raden (med ny `r2_folder`)
  og bulk-insert i `transfer_files`.
- `getTransferFiles(transferId)` — henter filliste for en leveranse.
- `addTransferFile(transferId, { r2_key, relative_path, filesize_bytes, content_type })` —
  legger til én fil på en eksisterende leveranse (brukt av redigeringssiden).
- `removeTransferFile(fileId)` — sletter R2-objektet og raden. Krever innlogget bruker.
- `getTransferForEdit(id)` — henter leveranse + filer + valgt kunde, for redigeringssiden.
- `updateTransferBranding(transferId, { customer_id?, background_image_path? })`.
- `updateTransfer(transferId, { title?, message?, expires_in_days?, max_downloads?, password? })` —
  dekker metadata-feltene i redigeringsskjemaet. `password: null` fjerner passordet,
  en streng setter et nytt (hashet server-side, se under).
- `getFileDownloadUrl(token, fileId, password?)` — validerer token (status/
  utløp/maks nedlastinger) OG passord (se under), returnerer presigned URL for
  én fil, teller ned `download_count`.

### Passordfiks

`password_hash` settes med `bcrypt` (lib finnes ikke i repoet ennå — legges til
som ny dependency, standard valg for passordhashing i Node) i
`updateTransfer` når passord settes. All nedlasting (enkeltfil og zip) krever nå
at klienten sender med passordet når `hasPassword` er sant, og serveren
verifiserer med `bcrypt.compare` før den presignerer noe som helst — ikke bare
en tom-sjekk client-side som i dag.

## Redigeringsside — `/admin/transfers/[id]/edit`

- Ny "Rediger"-lenke i leveranselisten (`app/admin/transfers/page.tsx`), ved
  siden av "Åpne lenke".
- `page.tsx` (server component) henter data via `getTransferForEdit` + kundeliste
  via `getCustomersList()` (gjenbrukt fra `lib/actions/pipeline.ts`), redirect
  til listen hvis leveransen ikke finnes.
- `TransferEditClient.tsx`:
  - **Filhåndtering:** liste over eksisterende filer gruppert visuelt etter mappe
    (utledet fra `relative_path`), hver med en "Fjern"-knapp (kaller
    `removeTransferFile` direkte, optimistisk UI-oppdatering — ingen egen
    "publiser"-knapp, siden lenken allerede er ute og endringen skal slå inn
    med en gang). Samme "Legg til filer"/"Velg mappe"-opplasting som over,
    kaller `addTransferFile` per ferdig opplastet fil.
  - **Branding:** dropdown med kunder (styrer logo via valgt kundes
    `logo_path`) + last opp/bytt/fjern bakgrunnsbilde (samme opplastingsmønster
    til `assets`-bucketen som på opprett-siden i dag). Lagres via
    `updateTransferBranding`.
  - **Metadata:** tittel, melding, utløp, maks nedlastinger, passord (sett/fjern) —
    én "Lagre"-knapp, kaller `updateTransfer`. Mottaker-e-post/navn
    (`transfer_links`) røres ikke — ikke del av dette oppdraget.

## Offentlig nedlastingsside — `/d/[token]`

- `page.tsx` henter transfer + `transfer_files`-liste.
- `DownloadClient.tsx`:
  - Én fil → uendret enkel kort-UI (ingen regresjon for det vanligste tilfellet).
  - Flere filer → filliste (gruppert/indentert etter mappe) med individuell
    nedlastingsknapp per fil (kaller `getFileDownloadUrl`), pluss en
    fremtredende "Last ned alt (zip)"-knapp.
  - Passordfelt (når `hasPassword`) sendes nå faktisk med i kallene til
    `getFileDownloadUrl` og zip-endepunktet, i stedet for kun å sjekke at
    feltet ikke er tomt.

## Zip-nedlasting — `app/api/transfers/[token]/download-all/route.ts`

Ny route handler (GET, med token i path + evt. passord som query-param, siden
navigasjon til en nedlastbar URL krever en ekte lenke, ikke `fetch`):

1. Validerer token/status/utløp/maks nedlastinger (samme sjekker som
   `getTransferByToken` i dag) og passord (bcrypt-sjekk som over).
2. Henter alle `transfer_files` for leveransen, genererer korttidslevde
   presigned GET-URL-er (~15 min) for hver via eksisterende `r2`-klient.
3. Bruker det nye npm-biblioteket **`client-zip`** (`downloadZip`) til å
   strømme `fetch(presignedUrl)`-responsene rett inn i en zip-respons med
   `relative_path` som navn på hver entry — ingen mellomlagring på serveren,
   ingen buffering av hele filer i minnet.
4. Setter `Content-Disposition: attachment; filename="<tittel eller 'leveranse'>.zip"`.
5. Teller opp `download_count` med 1 ved vellykket start.

## Filer som opprettes/endres

- `supabase/migrations/159_transfer_files.sql` (ny)
- `lib/actions/transfers.ts` (utvidet/omskrevet som over)
- `lib/upload/transferUpload.ts` (ny, delt opplastingshjelper)
- `app/admin/transfers/new/TransferUploadClient.tsx` (bruker delt hjelper +
  multi-fil/mappe-opplasting, ny `createTransfer`-signatur)
- `app/admin/transfers/[id]/edit/page.tsx` (ny)
- `app/admin/transfers/[id]/edit/TransferEditClient.tsx` (ny)
- `app/admin/transfers/page.tsx` ("Rediger"-lenke, filkolonne viser tittel/
  antall filer i stedet for ett filnavn)
- `app/d/[token]/page.tsx` + `DownloadClient.tsx` (multi-fil-UI, ekte
  passordsjekk)
- `app/api/transfers/[token]/download-all/route.ts` (ny)
- `package.json` (+`client-zip`, +`bcrypt`)

## Testing

- Manuell verifisering i nettleser: opprett leveranse med mappe (flere
  undermapper), last ned enkeltfil, last ned alt som zip og verifiser
  mappestruktur i den utpakkede zip-en, rediger en sendt leveranse (fjern fil,
  legg til fil, bytt bakgrunnsbilde/logo, sett passord), verifiser at feil
  passord avvises og riktig passord slipper gjennom på både enkeltfil og zip.
- Verifiser at eksisterende (pre-migrasjon) leveranser med én fil fortsatt
  laster ned korrekt etter migrasjonen.
- Ingen automatiserte tester finnes for transfers-modulen i dag — følger
  eksisterende mønster i repoet (manuell verifisering), ikke ny testsuite.

## Ikke i scope

- Mottaker-håndtering (`transfer_links` — e-post/navn) uendret.
- Zip-generering "bygg først, gi lenke etterpå" — valgt bort til fordel for
  direkte strømming.
- Drag-and-drop av mapper — valgt bort til fordel for ren mappevelger
  (`webkitdirectory`).
