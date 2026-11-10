# Flyer: eksempelmedia flyttes til flyer-redigering (per flyer) + ny "Eksempelbilder"-seksjon — design

## Bakgrunn

Oppfølging av `2026-11-09-flyer-package-showcase-design.md` (allerede bygget og live). To endringer bekreftet med Magnus etter at pakke-showcase-funksjonen var i produksjon:

1. **Eksempelmedia skal velges på flyeren, ikke på tilbudet.** I dag settes hovedvideo/sosiale klipp/bilder for "Se mer"-modalen i tilbudsbyggerens "Merk som pakke-mal"-panel (`PackageShowcasePanel`, knyttet kun til `quote_id`). Magnus vil at dette i stedet skal velges når man redigerer *flyeren*, og at innholdet skal være **unikt per flyer** — samme pakke kan vise forskjellig eksempelmedia på to forskjellige flyers.
2. **Ny seksjon: "Eksempelbilder" fra tidligere prosjekter.** En ren bildecollage, samme idé som `components/sections/ExampleWorkSection.tsx` nederst i pitch-byggeren (asymmetrisk rutenett av bilder, ingen video/case-metadata) — men med **8 bilder i stedet for 5**, og bygget som flyerens egen, uavhengige seksjon (samme presedens som flyerens "Tidligere arbeid"-seksjon, som allerede er sin egen reimplementasjon av pitch-byggerens `CasesSection`, ikke en delt komponent).

Begge endringene gjøres i samme runde (bekreftet med Magnus).

**Observert i research, ikke en del av denne leveransen:** `ExampleWorkSection.tsx` har liggende igjen flere feilsøkings-`fetch`-kall til `127.0.0.1:7381/ingest/...` (linje 56-65, 126-129, 143-146, 179-183) — rester fra en agent-debug-økt, kjører i produksjon i pitch-byggeren i dag. Urelatert til denne leveransen, men bør ryddes separat.

## Del 1: Eksempelmedia blir per-flyer, redigeres fra flyeren

### Nøkkelbeslutning: `flyer_id` legges til på eksisterende tabell, ikke en ny

`quote_package_showcase_items` (migrasjon 193) er i dag nøkkelet kun på `quote_id`. Den utvides med `flyer_id`, slik at nøkkelen blir `(flyer_id, quote_id, kind)` — samme par som allerede finnes i `sales_flyer_packages` (flyer↔pakke-koblingen). Ingen reell produksjonsdata finnes i denne tabellen ennå (funksjonen gikk live i dag, all testdata ble ryddet etter hver verifiseringsrunde) — migrasjonen kan derfor trygt tømme tabellen én gang og legge til kolonnen som `NOT NULL` direkte, uten en nullable-mellomfase.

### Migrasjon `194_...` (del 1)

**Presisert etter byggersjekken:** ingen blind `DELETE` — `PackageShowcasePanel` og dens handlinger er fortsatt fullt tilgjengelige akkurat nå (fram til Part 1 faktisk shippes), så "ingen reell data ennå"-antakelsen er et øyeblikksbilde, ikke en garanti på kjøretidspunktet. Migrasjonen sjekker i stedet radantall og **avbryter** (ingen sletting) hvis tabellen ikke er tom, slik at en eventuell reell rad blir en synlig feil å ta stilling til — ikke et stille tap:

```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM quote_package_showcase_items LIMIT 1) THEN
    RAISE EXCEPTION 'quote_package_showcase_items har eksisterende rader — avbryter i stedet for å slette blindt. Avklar med Magnus før denne migrasjonen køres på nytt.';
  END IF;
END $$;

ALTER TABLE quote_package_showcase_items ADD COLUMN flyer_id uuid NOT NULL REFERENCES sales_flyers(id) ON DELETE CASCADE;
-- Indeks oppdateres til å inkludere flyer_id:
DROP INDEX IF EXISTS quote_package_showcase_items_quote_id_idx;
CREATE INDEX quote_package_showcase_items_flyer_quote_idx ON quote_package_showcase_items (flyer_id, quote_id, kind, order_index);
```

**Byggeren avgjør ingenting her** — hvis migrasjonen faktisk avbryter pga. eksisterende rader, stopp og spør Magnus; kjør ikke en destruktiv opprydding selv.

RPC `replace_quote_package_showcase_items` får en ny parameter `p_flyer_id uuid`, og `DELETE`/`is_staff`-sjekken scopes på `(quote_id, flyer_id, kind)` i stedet for `(quote_id, kind)`. Samme mønster (is_staff, FOR UPDATE-lås, avvisning av ukjent id) som før, nå låser på både `quotes`- og `sales_flyers`-raden.

### Server-handlinger (`lib/actions/quote-package-showcase.ts`)

Alle fire funksjoner får `flyerId` som nytt, første parameter:
- `copyLibraryImageToQuotePackage(flyerId, quoteId, imageId, kind)`
- `copyLibraryVideoToQuotePackage(flyerId, quoteId, videoId, kind)`
- `listQuotePackageShowcaseItems(flyerId, quoteId)`
- `setQuotePackageShowcaseItems(flyerId, quoteId, kind, items)`

Lagringssti endres fra `quote-packages/{quoteId}/...` til `quote-packages/{flyerId}/{quoteId}/{kind}-{random}.{ext}` — samme kopier-ikke-referer-prinsipp, nå scopet per flyer.

`lib/actions/sales-flyers.ts`: `getShowcaseItemsByQuoteId` → `getShowcaseItemsByFlyerAndQuoteId(flyerId, quoteIds)`, filtrerer på `.eq('flyer_id', flyerId).in('quote_id', quoteIds)` i tillegg til eksisterende filter.

### UI: flyttes fra tilbudsbygger til flyer-redigering

- **Fjernes:** `<PackageShowcasePanel quoteId={activeQuote.id} />` og hele "Eksempelmedia for Se mer-visningen"-seksjonen i `app/admin/projects/[id]/quote/page.tsx` (det "Merk som pakke-mal"-panelet beholder navn/kategori-feltene, men ikke lenger eksempelmedia).
- **Legges til:** `PackageShowcasePanel` får `flyerId`-prop i tillegg til `quoteId`, og rendres i stedet inne i `SalesFlyerView.tsx`, ett sted per pakke-kort. Hvert pakke-kort (i `packagesByCategory`) får en ny, staff-only knapp **"Eksempelmedia"** (synlig kun i redigeringsmodus, samme `editing`-tilstand som resten av siden), som åpner `PackageShowcasePanel` i en modal scopet til `(flyer.id, pkg.quote_id)` — samme overlay-mønster som `PackagePickerModal`.
- Ingen endring i selve "Se mer"-modalen (`PackageDetailModal`) eller ikon-chip-tellingen (fortsatt fra leveranselisten, uendret av denne endringen).

## Del 2: Ny "Eksempelbilder"-seksjon (8 bilder)

### Nøkkelbeslutning: faste kolonner, samme mønster som BTS-bildene — ikke en generisk ordnet liste

Akkurat som BTS-bildene (migrasjon 192: "alltid eksakt to bilder i et fast layout, ikke en liste"), er dette **8 bilder i et fast, asymmetrisk rutenett** — hvert av de 8 bildene har en spesifikk visuell rolle (hero, to "tårn"-blokker av tre bilder hver, bunn-bilde), ikke en fritt ombyttbar liste. Samme begrunnelse gjelder derfor: faste, navngitte kolonner, ikke en ny join-tabell.

### Layout: utvidelse av pitch-byggerens 5-bilde-mønster til 8

`ExampleWorkSection.tsx`s desktop-layout er: full bredde hero (700px) → 2 kolonner (venstre strekker 2 rader / høyre topp+bunn, 800px/400px/400px) → full bredde bunn (600px). For 8 bilder gjentas midt-blokken én gang til, i stedet for å finne opp et nytt mønster:

```
Pos 1: full bredde (hero)
Pos 2-4: 2 kolonner — venstre strekker 2 rader, høyre topp + bunn
Pos 5-7: 2 kolonner — venstre strekker 2 rader, høyre topp + bunn (samme rytme igjen)
Pos 8: full bredde (bunn)
```

Samme mobil-fallback som originalen (vertikal stabling av alle 8).

### Migrasjon `194_...` (del 2, samme fil som Del 1)

```sql
ALTER TABLE sales_flyers ADD COLUMN example_image_1_path text;
ALTER TABLE sales_flyers ADD COLUMN example_image_2_path text;
ALTER TABLE sales_flyers ADD COLUMN example_image_3_path text;
ALTER TABLE sales_flyers ADD COLUMN example_image_4_path text;
ALTER TABLE sales_flyers ADD COLUMN example_image_5_path text;
ALTER TABLE sales_flyers ADD COLUMN example_image_6_path text;
ALTER TABLE sales_flyers ADD COLUMN example_image_7_path text;
ALTER TABLE sales_flyers ADD COLUMN example_image_8_path text;
```

### Gjenbruk: `copyLibraryImageToFlyer`

Funksjonens `field`-parameter er allerede en union (`'hero_poster' | 'bts_image_1' | 'bts_image_2'`, utvidet denne sesjonen). Utvides igjen til å inkludere `'example_image_1'` ... `'example_image_8'`. Ingen ny kopieringsfunksjon trengs.

### Admin UI

I `SalesFlyerView.tsx`, ny seksjon **"Eksempelbilder"** (foreslått plassering: rett etter "Tidligere arbeid", før pakke-seksjonen — bygger tillit visuelt før prisene). **Min avgjørelse (byggersjekken flagget dette som uklart):** seksjonen får samme faste gull-skillelinje + store bokstaver-etikett som nabo-seksjonene "Tidligere arbeid"/"Pakker" (ikke uten header, som BTS-strimmelen) — konsistent med flankene, selv om ingen redigerbar tittel/tekst følger med (kun selve bildene). 8 individuelle "Velg bilde"-knapper (samme mønster som BTS-bildenes to knapper), hver åpner `ImagePickerModal` med `maxSelection={1}`, kopierer via `copyLibraryImageToFlyer(slug, imageId, 'example_image_N')`. Seksjonen vises **kun** når minst ett av de 8 feltene er satt (samme skjul-hvis-tomt-prinsipp som "Se mer"-knappen og BTS-bildene) — i redigeringsmodus vises den alltid, med tomme slots som "Velg bilde"-plassholdere.

## Ikke-mål

- Ingen endring i ikon-chip-telling eller "Se mer"-modalens video/klipp/bilde-innhold — kun *hvor* eksempelmedia velges, og at det nå er per-flyer.
- Ingen gjenbruk av `ExampleWorkSection.tsx` eller `CollagePreset`-systemet — egen, uavhengig implementasjon, samme presedens som "Tidligere arbeid".
- Rører ikke `ExampleWorkSection.tsx`s feilsøkings-kall (separat, urelatert opprydding).
- Ingen endring i `sales_flyer_cases`/"Tidligere arbeid"-seksjonen.

## Verifikasjon

- `npx tsc --noEmit` rent.
- Opprett en pakke, legg til eksempelmedia **fra flyer-redigeringen** (ikke tilbudsbyggeren — bekreft at knappen/panelet er helt borte fra `app/admin/projects/[id]/quote/page.tsx`) på to forskjellige flyers — bekreft at samme pakke viser forskjellig eksempelmedia på de to flyerne.
- Last opp 8 eksempelbilder, bekreft riktig asymmetrisk layout på desktop og vertikal stabling på mobil.
- Fjern ett eksempelbilde (sett tilbake til tomt) — bekreft at seksjonen fortsatt vises med resten synlig i redigeringsmodus, og at den forsvinner helt for en anonym besøkende hvis **alle** 8 er tomme.
- Bekreft at sletting av et bibliotekbilde som er brukt som eksempelbilde eller eksempelmedia ikke bryter den publiserte flyeren (kopier, ikke referanser, som før).
