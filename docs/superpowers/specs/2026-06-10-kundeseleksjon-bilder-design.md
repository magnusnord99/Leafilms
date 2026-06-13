# Kundeseleksjon av bilder (Frame.io-erstatning)

**Dato:** 2026-06-10
**Status:** Designet sammen med Magnus. Hoveddesignet er gjennomgått, men siste eksplisitte godkjenning av fulltekst gjenstår. Ikke implementert.

## Mål

Erstatte Frame.io for bildeseleksjon: Leafilms laster opp lowres-bilder, kunden får en link der de blar, markerer favoritter og kommenterer per bilde. Bildefilene slettes automatisk når prosjektet går videre i pipelinen.

## Avklarte krav (Magnus' valg)

- **Opplasting:** Fotografen eksporterer ferdige lowres fra Lightroom/Capture One og bulk-laster opp (drag & drop). Appen prosesserer ikke bilder. Filnavn bevares — det er nøkkelen tilbake til originalene.
- **Tilgang:** Hemmelig token-link **+ PIN-kode** (4 siffer). Ingen innlogging for kunden.
- **Måltall (soft grense):** Valgfritt antall per galleri. Kunden **kan velge flere** enn måltallet, men får tydelig varsel om at de er over grensen (mersalg/tilleggsmulighet).
- **Innsending:** Kunden velger/kommenterer i eget tempo (lagres fortløpende) og trykker «Send inn utvalg» → seleksjonen låses og teamet varsles. Teamet kan låse opp igjen.
- **Sletting:** Bildefilene slettes automatisk når prosjektet **forlater `post_prod`**. Seleksjonslisten (filnavn + valg + kommentarer) beholdes permanent.
- **Nytt pipeline-steg:** «Seleksjon til kunde» i postprod-malene for `photo` og `mixed`, mellom selektering og redigering.

## Valgt tilnærming

**Egen seleksjonsmodul med privat storage-bucket** (alternativ A — valgt fremfor gjenbruk av offentlig `assets`-bucket, som ville undergravd PIN-beskyttelsen, og fremfor task-kobling, som er skjør).

## Datamodell (neste migrasjonsnummer, p.t. 059)

**`selection_galleries`**: `id`, `project_id` (FK), `token` (unik), `pin_code`, `target_count` (nullable), `status` (`open`/`submitted`/`purged`), `submitted_at`, `purged_at`, `created_at`, `updated_at`.

**`selection_images`**: `id`, `gallery_id` (FK, cascade), `filename`, `storage_path` (nulles ved purge), `sort_order`, `selected` (bool), `comment`, `selected_at`, `created_at`.

**Storage:** ny privat bucket `selections`, path `{gallery_id}/{filnavn}`. Signerte URL-er (1 t) genereres server-side etter PIN-verifisering.

**RLS:** authenticated = full tilgang. Anon = ingen direkte tabelltilgang; all kundetilgang via server actions som verifiserer token + PIN og setter httpOnly session-cookie per galleri.

## Pipeline-integrasjon

- Migrasjon legger «Seleksjon til kunde» inn i `task_templates` for `post_prod` × `photo`/`mixed`.
- I `updateProjectStage` (lib/actions/pipeline.ts): når prosjekt forlater `post_prod` → slett storage-filer for prosjektets gallerier, sett `storage_path = null`, status `purged`. Feil i purge blokkerer ikke stage-endringen (logges, kan kjøres manuelt på nytt).
- «Send inn» → varsel i `notifications` (ny type `selection_submitted`, krever utvidelse av CHECK-constraint).

## Kundesiden `/s/[token]`

Mobilvennlig, cinematisk mørk palett (#0C0B09/#C49434 — offentlig side, IKKE admin-palett):

1. PIN-skjerm (maks-forsøk med kort utestengelse).
2. Galleri-grid med lazy-loading, lightbox med pilnavigasjon.
3. Velg-knapp (hjerte) + kommentarfelt per bilde, lagres fortløpende.
4. Teller «X av Y valgt»; over måltall → varselfarge + melding om mulig tillegg (tekst justeres med Magnus).
5. «Send inn utvalg» med bekreftelse (ekstra advarsel over grensen). Etter innsending: låst oppsummering.

## Adminsiden

Ny seksjon på `/admin/postprod/[id]` (admin-palett fra `lib/admin-theme.ts`):

- Opprett galleri (genererer token + PIN, valgfritt måltall), kopier link/PIN.
- Bulk-opplasting drag & drop med progress per fil (feil per fil med retry).
- Status: antall valgt, over/under måltall, kommentarer, innsendt-tidspunkt, lås opp-knapp.
- Etter purge: seleksjonsliste som tekst + «Kopier filnavnliste» (for Lightroom-filter). Manuell «Slett bildene nå»-knapp.

## Verifisering

Manuell ende-til-ende: opprett → last opp → kundeflyt → innsending → varsel → stage-flytt → purge. Repoet har ingen testsuite; det innføres ikke for dette.
