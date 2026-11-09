# Pakke-innhold på flyeren: "hva du får" + visuell "Se mer"-visning — design

## Bakgrunn

Oppfølging av `2026-11-08-sales-flyers-design.md` (digitale flyers med pakkepriser). Et pakkekort på flyeren viser i dag kun navn, kategori og pris — ingen antydning om hva som faktisk er inkludert. Magnus ønsker at hvert kort viser kort hva man får (f.eks. "1 hovedvideo, 10 bilder, 4 nedklippsvideoer"), og at en "Se mer"-knapp åpner en mer visuell representasjon av innholdet — inspirert av en tidligere pitch (Montel, august 2026) der leveranser ble vist "i bruk" i enkle device-mockups (laptop/telefon) i stedet for som rene filer/tekst.

Research under samtalen: Montel-idéen ble aldri fullført som gjenbrukbar modul i dette systemet — `lib/types.ts` har et uferdig `website_mockup`-seksjonsfelt (laptop/telefon/presentasjon-modus, fylt med kundens egne bilder) og et `use_cases`-felt (kun en tag-liste), men ingen av dem har noen faktisk renderer i `SectionRenderer.tsx`. Vi bygger derfor en ny, avgrenset visning spesifikt for pakke-innhold på flyeren — ikke en gjenbruk av noe eksisterende.

Besluttet gjennom mockup-runde med Magnus (visuell companion-økt, se `.superpowers/brainstorm/` for selve skissene):

- **Kortet:** ikon-chips med antall (video-, bilde- og klipp-ikon + tall), ikke en ren tekstlinje eller en punktliste.
- **"Se mer"-visning:** åpner som **modal** (ikke inline-ekspansjon), med stor video i en 16:9-ramme til venstre, og en telefon/Instagram-stil mockup + et lite bildegrid stablet til høyre.
- **Eget, valgt eksempelmedia per pakke** — ikke gjenbruk av flyerens generelle "tidligere arbeid"-cases. En pakke-mal har ingen ekte kundes bilder (det er en mal), så Magnus velger selv representative eksempelbilder/-videoer når pakken settes opp.

### Nøkkelbeslutning: tekstlinjen gjenbruker leveranselisten, ingen ny parallell liste

Samme prinsipp som resten av pakke-funksjonen (`190_quote_packages.sql`): ett sted beskriver innholdet. Ikon-chipsene på kortet genereres fra `quote_data.deliverables` (type video/foto/annet, navn, antall) — samme leveranseliste som allerede fylles ut i tilbudsbyggeren og fryses til kontrakten ved signering. Ingen nytt fritekstfelt å holde synkronisert manuelt.

**Presisert:** video-rader i `deliverables` er i dag "1 rad = 1 navngitt element" (intet antall-felt for video, kun for foto/annet — se `DeliverableItem` i `lib/types.ts`). For at "4 nedklippsvideoer" skal telle som ett chip-tall, må visningslogikken telle **antall video-rader** i stedet for å lese et `quantity`-felt som ikke finnes for video. Ingen endring i selve leveranselisten eller kontraktsflyten — kun i hvordan pakke-kortet summerer den.

**Oppdaget i byggersjekken, avklart med Magnus:** kortet skal vise 3 separate chip-tall — hovedvideo, bilder, nedklipp — men `deliverables` har ingen måte å skille en "hovedvideo"-rad fra en "nedklipp"-rad: begge er bare `type: 'video'`. Løsning: ett nytt, **valgfritt** felt på `DeliverableItem` — `videoRole?: 'hovedvideo' | 'klipp'`. Rent additivt: alle eksisterende video-rader uten feltet behandles som `'hovedvideo'` (ingen migrering av gamle data nødvendig, ingen endring i kontrakt-fryse-logikken eller andre steder som allerede leser `deliverables`). Chip-tellingen blir da: tell video-rader gruppert på `videoRole` (udefinert → hovedvideo), foto/annet-rader fortsatt talt på `quantity` som før.

### Nøkkelbeslutning: eksempelmedia er representativt, ikke et 1:1-regnskap

Antall eksempelbilder/-videoer en pakke viser i "Se mer" trenger **ikke** matche leveranselistens faktiske antall. Én pakke med "4 nedklippsvideoer" kan vises med f.eks. 2 eksempelklipp — de representerer stil og kvalitet, ikke et eksakt regnskap. Dette holder admin-arbeidet lavt (Magnus skal ikke behøve 4 forskjellige eksempler for hver pakke) og er i tråd med at pakke-malen uansett ikke har ekte, ferdige leveranser.

### Relevante eksisterende mønstre (gjenbrukes)

- **`ImagePickerModal`/`VideoPickerModal`** (`components/modals/`) — generiske bildevelgere (kaller kun `onSelect(ids)`, ingen flyer-spesifikk logikk i modalene selv). Gjenbrukes uendret.
- **"Kopier, ikke referer"-mønsteret** fra `copyLibraryImageToFlyer`/`copyLibraryVideoToFlyer` (`lib/actions/sales-flyers.ts`, under arbeid i samme gren akkurat nå for BTS-bilder — se note under): bildet/videoen velges fra biblioteket, men kopieres til en egen, dedikert storage-mappe. Samme begrunnelse her: en senere sletting i biblioteket skal ikke kunne brekke en pakke som vises på en publisert flyer. Ny, analog funksjon: `copyLibraryImageToQuotePackage(quoteId, imageId, kind)` / `copyLibraryVideoToQuotePackage(quoteId, videoId, kind)`, som kopierer til `quote-packages/{quoteId}/{kind}-{random}.{ext}` i stedet for `sales-flyers/{slug}/...`.
- **Atomisk replace-RPC for ordnede lister** (samme mønster som `replace_landing_page_cases`/`replace_sales_flyer_cases`, migrasjon 175-177/191) — brukes for å lagre hele settet med eksempelmedia-rader for en pakke i én operasjon, samme race-trygge mønster.
- **`PackagePickerModal`** (uendret) — velger fortsatt hvilke pakke-tilbud som vises på en flyer. Denne designen rører ikke den koblingen, kun innholdet på selve pakke-kortet/-modalen.

**Merk for byggeren:** migrasjon `192_sales_flyer_bts_images.sql` ligger allerede skrevet (ikke committet) på disk, sammen med endringer i `ImagePickerModal.tsx`/`VideoPickerModal.tsx`/`SalesFlyerView.tsx`/`sales-flyers.ts` — et **urelatert** pågående arbeid (to faste "bak kamera"-bilder nederst på flyeren). Sjekk `git status --short` før du velger migrasjonsnummer — denne designens migrasjon blir **`193_`**, ikke `192_`.

## Mål

- Hvert pakkekort på flyeren viser ikon-chips med antall, generert fra pakke-tilbudets `quote_data.deliverables` (video-rader talt som stykk, foto/annet lest fra `quantity`).
- En pakke kan få valgfritt **eksempelmedia** i tilbudsbyggerens pakke-panel: bilder/videoer valgt fra det eksisterende bildebiblioteket, kategorisert i tre typer — hovedvideo, sosialt klipp (telefon-mockup), bilde (grid) — med rekkefølge innad i hver type.
- Et pakkekort med minst ett eksempelmedia får en "Se mer"-knapp som åpner en modal: stor video (hovedvideo-type) til venstre, telefon-mockup (sosialt klipp-type, nyeste/første) + bildegrid (bilde-type) stablet til høyre.
- Et pakkekort **uten** eksempelmedia viser ingen "Se mer"-knapp.
- Eksempelmedia er egen, kopiert kopi (samme lagringsmønster som flyerens bilder) — en senere sletting i biblioteket skal ikke kunne brekke en publisert pakke-visning.

## Ikke-mål

- Ingen strukturell endring av leveranselisten eller kontraktsflyten — kun ett additivt, valgfritt felt (`videoRole`, se Nøkkelbeslutning) pluss en ny måte å lese/telle listen på for kort-visningen.
- Ingen krav om at antall eksempelmedia matcher leveranselistens antall.
- Ingen gjenbruk av flyerens `case_studies`-eksempler til dette — helt separate, pakke-spesifikke bilder/videoer.
- Ingen endring av `PackagePickerModal` eller koblingen flyer↔pakke (`sales_flyer_packages`).
- Rører ikke det pågående, urelaterte BTS-bilder-arbeidet (migrasjon 192) — kun migrasjonsnummeret må velges riktig i forhold til det.

## Datamodell

### Migrasjon `193_quote_package_showcase.sql`

```sql
CREATE TABLE quote_package_showcase_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id    uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('main_video', 'social_clip', 'photo')),
  media_type  text NOT NULL CHECK (media_type IN ('image', 'video')),
  path        text NOT NULL,   -- kopiert fil under quote-packages/{quote_id}/, samme mønster som sales-flyers/{slug}/
  caption     text,            -- valgfri, f.eks. kontonavn-tekst i telefon-mockupen (kun meningsfullt for 'social_clip')
  order_index integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- main_video er alltid video, photo er alltid bilde — social_clip kan være begge
  CONSTRAINT quote_package_showcase_kind_media_type_check CHECK (
    (kind = 'main_video' AND media_type = 'video') OR
    (kind = 'photo' AND media_type = 'image') OR
    (kind = 'social_clip')
  )
);
CREATE INDEX quote_package_showcase_items_quote_id_idx ON quote_package_showcase_items (quote_id, kind, order_index);

ALTER TABLE quote_package_showcase_items ENABLE ROW LEVEL SECURITY;

-- Staff full tilgang, samme mønster som sales_flyer_packages
CREATE POLICY "staff_all_quote_package_showcase_items" ON quote_package_showcase_items
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- Ingen public/anon-policy: flyer-siden leser dette server-side med service-klient
-- (samme begrunnelse som quotes/quote_data i 189_sales_flyers.sql — et pakke-tilbud
-- er i praksis to hopp fra en publisert flyer: sales_flyer_packages → quotes → denne
-- tabellen, og quotes sin egen RLS er authenticated-scoped, ikke staff/anon-scoped).
```

Ingen endring i `quotes`- eller `sales_flyer_packages`-tabellene.

## Tilbudsgenerator — eksempelmedia i pakke-panelet

I `app/admin/projects/[id]/quote/page.tsx`, i det eksisterende "Merk som pakke-mal"-panelet (kun synlig når `package_label` er satt):

- Ny underseksjon **"Eksempelmedia for Se mer-visningen"**, tre rader: Hovedvideo, Sosiale klipp, Bilder.
- Hver rad: miniatyrer av allerede valgte elementer (med ×for å fjerne, dra for å endre rekkefølge innad i egen type) + en "+ Legg til"-knapp som åpner `VideoPickerModal` (Hovedvideo/sosiale klipp hvis video) eller `ImagePickerModal` (bilder/sosiale klipp hvis bilde).
- Ved valg: `copyLibraryImageToQuotePackage`/`copyLibraryVideoToQuotePackage` kopierer filen til `quote-packages/{quoteId}/...`, deretter lagres hele raden for den aktuelle `kind` via en atomisk replace-RPC (samme mønster som `replace_sales_flyer_cases`).
- **Byggeren avgjør** eksakt antall-grense pr. type (foreslått: ingen hard grense i databasen, men UI kan foreslå f.eks. 1 hovedvideo, 2-4 sosiale klipp, 4-8 bilder som fornuftige retningslinjer — ikke et krav).

## Pakkekortet og "Se mer"-modalen (flyer-siden)

I `components/sales-flyer/SalesFlyerView.tsx`, pakkekortene (`packagesByCategory`-renderingen):

- **Ikon-chips:** beregnes fra `quote_data.deliverables` — video-rader grupperes på `videoRole` (udefinert → hovedvideo) og telles som stykk (ikke `quantity`, som ikke finnes for video), foto/annet-rader telles på `quantity`. Vis som chip pr. gruppe, f.eks. "1 hovedvideo · 10 bilder · 4 nedklipp" (eksakt tekst/gruppenavn er en byggerdetalj).
- **"Se mer"-knapp:** vises kun når pakken har minst én rad i `quote_package_showcase_items`. Åpner ny komponent `components/modals/PackageDetailModal.tsx` (samme filplassering/navnemønster som `PackagePickerModal.tsx`).
- **Modal-innhold:** `main_video`-elementer i en 16:9-videoramme til venstre (spilles av/poster), `social_clip`-elementer i en telefon/Instagram-stil mockup (bildetekst fra `caption` hvis satt) og `photo`-elementer i et lite grid, stablet til høyre — nøyaktig layout A fra mockup-runden. **Byggeren avgjør** hvordan flere `main_video`- eller `social_clip`-elementer vises hvis det er mer enn ett av hver (f.eks. enkel karusell/piler), siden mockupen kun viste ett av hver.
- **Tom side (min egen avgjørelse, oppdaget i byggersjekken):** mockupen viste kun det fullt befolkede tilfellet (video + telefon + grid, alle satt). Siden en pakke kan ha kun bilder og ingen video/klipp (eller omvendt), kollapser den tomme siden helt og den andre siden tar full bredde — ikke tomt venstre/høyre-rom. Hvis **ingenting** finnes i noen av de tre typene, vises ingen "Se mer"-knapp i det hele tatt (se Mål-punktet over).
- Henting server-side: `/flyer/[slug]/page.tsx` henter `quote_package_showcase_items` for de viste pakke-tilbudene parallelt med resten av flyer-dataene, via service-klient (samme autorisasjonsmønster som resten av siden).

## Verifikasjon

- `npx tsc --noEmit` rent.
- Opprett en pakke-mal, legg til 1 hovedvideo, 3 sosiale klipp og 6 bilder via bildebiblioteket — bekreft alle kopieres til `quote-packages/{id}/` (ikke en levende referanse til biblioteket) og vises i riktig rekkefølge i "Merk som pakke-mal"-panelet.
- Slett ett av bildene fra det sentrale bildebiblioteket etter at det er brukt i en pakke — bekreft at pakkens kopi fortsatt vises uendret (kopi, ikke referanse).
- Besøk en testflyer med denne pakken — bekreft at kortet viser riktige ikon-chips (talt fra leveranselisten, inkl. korrekt gruppering på `videoRole` og korrekt telling av video-rader uten `quantity`-felt), og at "Se mer" åpner modalen med video venstre / telefon+bilder høyre.
- Lag en pakke med kun bilder (ingen `main_video`/`social_clip`-eksempelmedia) — bekreft at "Se mer"-modalen viser bildegridet i full bredde, ikke et tomt venstre felt.
- Fjern alt eksempelmedia fra en annen pakke — bekreft at "Se mer"-knappen forsvinner fra kortet for den pakken.
- Bekreft at anonym `curl` mot `quote_package_showcase_items` (direkte PostgREST) ikke returnerer noe (RLS: kun staff, ingen public-policy) — modalens innhold på en publisert flyer må komme fra service-klient-oppslaget i `page.tsx`, ikke et klientside-kall mot tabellen.
- Bekreft at migrasjon `193_` ikke kolliderer med det allerede skrevne, urelaterte `192_sales_flyer_bts_images.sql`.
