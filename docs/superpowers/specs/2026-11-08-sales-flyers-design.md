# Digitale flyers med pakkepriser — design

## Bakgrunn

Magnus ønsker en ny kategori under "Landingssider": **digitale flyers**. Forskjellen fra bransje-landingssidene (`/energi` osv., bygget 2026-10-21, se `2026-10-21-industry-landing-pages-cms-design.md`) er målgruppen og bruken: en bransjeside er en side Leafilms selv sender til et prospekt. En flyer er laget for at en **eksisterende Leafilms-kunde** skal kunne sende den videre til **sine egne** kontakter — altså selge på Leafilms sine vegne. Mottakeren skal bli interessert i produktet og få et konkret prisbilde, ikke bestille noe direkte på siden.

Én flyer-type bygges nå (ikke flere varianter): video-hero, noen eksempler på tidligere arbeid, en kort tekst om hvorfor godt innhold engasjerer, og pakkepriser gruppert i tre kategorier (Bilder / Film / Bilder og film).

### Nøkkelbeslutning: en pakke ER et tilbud, ikke en egen prisliste

Diskutert og bekreftet med Magnus: pakkeprisene skal **ikke** være en ny, uavhengig prismodell man fyller inn i et eget skjema. Flyten er at man bruker den eksisterende tilbudsgeneratoren (velger opptaksdager, lisens, postproduksjon osv. nøyaktig som for et vanlig tilbud) og deretter **merker** det resulterende tilbudet som en pakke med et navn (f.eks. "Liten pakke") og en kategori. Flyeren viser deretter disse merkede tilbudenes faktiske, beregnede totalsum — "prisen skal være det som tilbudet viser", ingen separat avrundet markedspris. Dette betyr at det bare finnes ett sted i systemet som beregner priser (tilbudsmotoren) — ingen ny, parallell prislogikk å holde synkron.

En pakke er **gjenbrukbar i det uendelige**: når en reell kunde tar kontakt og vil ha "Liten pakke", lages et helt nytt, uavhengig tilbud+prosjekt for den kunden (en kopi av pakke-tilbudets data). Pakke-malen selv forblir urørt og kan brukes av vilkårlig mange kunder — Magnus var konkret på at 3 kunder kan slå til på samme flyer/pakke samtidig, og det skal bli 3 uavhengige prosjekter.

**Presisert etter byggerkontroll:** alle pakke-maler (Liten pakke, Stor pakke, Promovideo, Alt sammen, ...) bor som **separate tilbud under ett og samme delte "pakkemal"-prosjekt** — ikke ett nytt, skjult prosjekt per pakke. Dette unngår at staff må finne og holde styr på flere skjulte prosjekter, og matcher at systemet allerede håndterer flere samtidig gyldige tilbud på ett prosjekt (samme presedens som signert-tilbud-vs-tilleggstilbud, se `project_okonomi_signed_vs_addon`-notatet). Prosjektet (og en tilhørende, dedikert plassholder-kunde, f.eks. "Leafilms — Pakkemaler") opprettes **én gang** (lazy — ved første "Lag pakke-mal"-handling hvis det ikke finnes), og gjenbrukes for alle senere pakker. "Lag pakke-mal" blir dermed i praksis "nytt tilbud under dette eksisterende prosjektet, merket med pakkenavn/kategori" — ikke en ny "opprett kunde + prosjekt"-flyt hver gang.

### Relevante eksisterende mønstre (gjenbrukes)

- **`case_studies` + `CasePickerModal`** (`components/modals/`) — gjenbrukes uendret for å velge eksempel-arbeid til flyeren, samme som bransjesidene gjør.
- **Token-frie, publiserte slug-sider** (`industry_landing_pages`-mønsteret: staff-ALL RLS + public-read-når-publisert, inline admin-redigering på selve siden) — samme grunnmønster for CRUD/publisering/draft-forhåndsvisning, men **egen tabell**, ikke gjenbruk av `industry_landing_pages` selv (feltene passer ikke: ingen "om oss"-seksjon, ingen `hero_type` bilde/video-veksling, men i stedet en pakke-liste som ikke finnes i bransjesidemodellen).
- **Atomisk replace-RPC for ordnede lister** (`replace_landing_page_cases`, migrasjon 175-177) — samme mønster for flyerens case-liste og pakke-liste, for å unngå de samme delete/insert-race-bugsene som ble funnet og rettet der.
- **`Quote`/`quote_data`-modellen og `calculateQuoteTotals`** (`lib/quote-builder-utils.ts`) — gjenbrukes uendret for å beregne pakkens pris. Ingen endring i selve prisberegningen.

### Visuelt design: pitch-sidenes stil, ikke bransjesidenes

Bekreftet med Magnus: flyeren skal se ut som pitch-sidene (`/p/[token]`) — den mørke, cinematiske paletten (Cormorant Garamond + DM Sans, `#0C0B09`-bakgrunn, `#C49434`-gull-aksent, satt globalt i `app/layout.tsx`/`app/globals.css`). **Ikke** bransjesidenes egen stil (Schibsted Grotesk + Newsreader, satt av `components/marketing/MarketingChrome.tsx`) — flyer-ruten skal derfor **ikke** wrappes i `MarketingChrome`.

Flyeren bygges likevel **ikke** på selve pitch-byggerens `Section`/`SectionRenderer`-maskineri — det er tungt koblet til `Project`/pitch-domenet (quote, timeline, team, deliverables) og drar inn kompleksitet (AI-generering, scroll-progress, collage-presets) som ikke trengs her, akkurat som ble vurdert og forkastet da bransjesidene ble designet. Flyeren får en ny, enkel, fast mal med fire faste blokker (hero, eksempler, tekst, pakker, CTA) — samme idé som bransjesidenes faste mal, bare med et annet fastsatt sett felt og en annen visuell stil.

## Mål

- Admin kan opprette en flyer-side (slug) under "Landingssider" med: video-hero, en ordnet liste eksempel-cases (fra `case_studies`), en kort engasjement-tekst, en ordnet liste pakke-tilbud å vise (gruppert i kategori), CTA-overskrift/undertekst, og en CTA-e-post som settes **per flyer** (ikke en fast Leafilms-adresse — forespørsler skal gå til hvem som administrerer salg for denne flyeren).
- I tilbudsgeneratoren kan et vilkårlig tilbud merkes som en pakke: navn (f.eks. "Liten pakke"), kategori (bilder / film / bilder og film), og en synlig/skjult rekkefølge. Tilbudet er fortsatt et helt normalt tilbud knyttet til en kunde — merkingen endrer ikke noe annet ved det.
- Prosjektet som (av tekniske grunner, se under) må finnes bak et pakke-tilbud, skal **ikke** vises som en sak i den vanlige pipeline/Kanban-tavlen — Magnus skal ikke se falske leads/deals der. **Presisert etter byggerkontroll:** dette gjelder ikke bare Kanban, men **alle** steder som summerer omsetning eller lister aktive saker (økonomisiden, dashboard-widgets, `/admin/quotes`-listen, kunde-detaljens tilbudshistorikk) — et pakke-maltilbud skal aldri telle med i noen omsetnings- eller aktivitetstall. Dette er en bevisst konservativ standard (ekskluder overalt omsetning/aktive saker beregnes, ikke bare der det er nevnt), gitt at appen tidligere har hatt reelle feil der tilbud ble feilaktig tatt med i omsetningstall (se `project_okonomi_review`-notatet).
- En pakke kan dupliseres til et helt nytt, uavhengig prosjekt+tilbud for en reell kunde, vilkårlig mange ganger, uten at originalen endres.
- En flyer kan settes til kladd og forhåndsvises av staff før publisering, samme mønster som bransjesidene.

## Ikke-mål

- Ingen selvbetjent bestilling på flyeren — CTA er en ren `mailto:`-lenke (samme mønster som `cta_email` på bransjesidene), ingen nytt skjema-backend.
- Ingen flere flyer-typer ennå (f.eks. en egen "hvorfor innhold selger"-side uten priser) — kun denne ene, kombinerte flyer-typen bygges nå.
- Ingen endring av `quotes.project_id`s `NOT NULL`-krav — løses med et skjult/merket prosjekt, ikke en løsnet fremmednøkkel. Dette er en bevisst avveining: å fjerne kravet hadde vært en stor endring i en tabell mye annen kode stoler på, for en fordel (unngå ett ekstra, skjult prosjekt-rad) som ikke er verdt risikoen.
- Ingen separat, redigerbar "markedspris" uavhengig av tilbudets faktiske sum — flyeren viser alltid den reelle, beregnede totalen.
- Jeg skriver ikke faktisk tekst/innhold for flyeren — denne leveransen er infrastrukturen; Magnus fyller inn reelt innhold (video, tekst, pakker) når han er klar.

## Trafikk-statistikk

Magnus vil kunne se hvor mye trafikk hver flyer får, uten at egne (innloggede) besøk på siden teller med — en innlogget staff som forhåndsviser/tester en flyer, eller en innlogget kunde, skal ikke blåse opp tallene.

- Hvert sidevisning av en **publisert** flyer logges server-side i `page.tsx`, **kun når besøkende ikke har en aktiv Supabase Auth-sesjon** (sjekket via samme server-side Supabase-klient som allerede leser cookien for `getAuthenticatedStaffUser()` — ikke staff-spesifikt, enhver innlogget sesjon, kunde eller ansatt, utelates).
- Ny tabell `sales_flyer_views (id, flyer_id, viewed_at, referrer)` — ett rad per visning (ikke bare en aggregert teller), slik at admin kan vise både totalt antall og en enkel trend over tid (f.eks. visninger siste 30 dager), samme idé som `transfer_downloads` logger hvert nedlastingsforsøk i stedet for bare en sum.
- `referrer` leses fra `Referer`-headeren når tilgjengelig (nullable — mange deling-kanaler sender ikke denne).
- RLS: staff-only lesetilgang (samme mønster som alt annet admin-data); innsetting skjer **server-side med service-klient** i selve siderenderingen (samme som visningstelleren i `project_shares`), ikke fra en klient-side RLS-policy.
- Admin-listen over flyers (`/admin/landingssider`) viser totalt antall visninger pr. flyer; en enkel detaljvisning (graf/liste siste 30 dager) er en rimelig byggerdetalj å avgjøre selv, samme nivå som `DownloadHistoryButton` for transfers.

## Datamodell

### Migrasjon `189_sales_flyers.sql`

```sql
CREATE TABLE sales_flyers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text NOT NULL UNIQUE,
  published         boolean NOT NULL DEFAULT false,
  meta_title        text NOT NULL DEFAULT '',
  meta_description  text NOT NULL DEFAULT '',
  hero_video_path   text,
  hero_poster_path  text,
  headline          text NOT NULL DEFAULT '',
  engagement_text   text NOT NULL DEFAULT '',   -- kort "hvorfor godt innhold engasjerer"
  cta_headline      text NOT NULL DEFAULT '',
  cta_subtext       text NOT NULL DEFAULT '',
  cta_email         text NOT NULL DEFAULT '',   -- bevisst INGEN default post@leafilms.no
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE sales_flyer_cases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flyer_id      uuid NOT NULL REFERENCES sales_flyers(id) ON DELETE CASCADE,
  case_study_id uuid NOT NULL REFERENCES case_studies(id) ON DELETE CASCADE,
  order_index   integer NOT NULL DEFAULT 0,
  UNIQUE (flyer_id, case_study_id)
);

CREATE TABLE sales_flyer_packages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flyer_id    uuid NOT NULL REFERENCES sales_flyers(id) ON DELETE CASCADE,
  quote_id    uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  UNIQUE (flyer_id, quote_id)
);

CREATE TABLE sales_flyer_views (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flyer_id   uuid NOT NULL REFERENCES sales_flyers(id) ON DELETE CASCADE,
  viewed_at  timestamptz NOT NULL DEFAULT now(),
  referrer   text
);
CREATE INDEX sales_flyer_views_flyer_id_idx ON sales_flyer_views (flyer_id, viewed_at);

ALTER TABLE sales_flyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_flyer_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_flyer_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_flyer_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_sales_flyer_views" ON sales_flyer_views
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
-- Ingen INSERT/public-policy: innsetting skjer utelukkende server-side via service-klient.

-- Staff full tilgang, samme mønster som industry_landing_pages
CREATE POLICY "staff_all_sales_flyers" ON sales_flyers
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff_all_sales_flyer_cases" ON sales_flyer_cases
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff_all_sales_flyer_packages" ON sales_flyer_packages
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- Offentlig lesetilgang kun for publiserte flyers (anon OG authenticated,
-- samme begrunnelse som industry_landing_pages: en innlogget kunde skal se
-- akkurat det en anonym besøkende ser)
CREATE POLICY "public_read_published_sales_flyers" ON sales_flyers
  FOR SELECT TO anon, authenticated USING (published = true);
CREATE POLICY "public_read_sales_flyer_cases_for_published" ON sales_flyer_cases
  FOR SELECT TO anon, authenticated
  USING (flyer_id IN (SELECT id FROM sales_flyers WHERE published = true));
CREATE POLICY "public_read_sales_flyer_packages_for_published" ON sales_flyer_packages
  FOR SELECT TO anon, authenticated
  USING (flyer_id IN (SELECT id FROM sales_flyers WHERE published = true));
```

**Byggeren bør vurdere** om `public_read_sales_flyer_packages_for_published` i praksis gir en anonym besøkende leserett på selve `quotes`-raden den peker til (via en senere join i appkoden, ikke via RLS på `quotes` selv — `quotes` sin egen RLS er i dag `authenticated`-scoped, ikke staff-scoped, se merknad under). Siden flyer-siden må lese tilbudets `quote_data` for å beregne/vise prisen, må oppslaget mot `quotes` skje **server-side med service-klient** (samme mønster som `/p/[token]`, hvor token-sjekket/publisert-sjekket er den faktiske autorisasjonsgrensen, ikke bordets egen RLS) — ikke et direkte anon-klient-kall mot `quotes`.

### Migrasjon `190_quote_packages.sql`

```sql
ALTER TABLE projects ADD COLUMN is_package_template boolean NOT NULL DEFAULT false;

ALTER TABLE quotes ADD COLUMN package_label text;        -- NULL = ikke en pakke
ALTER TABLE quotes ADD COLUMN package_category text CHECK (package_category IN ('foto', 'film', 'foto_film'));
ALTER TABLE quotes ADD COLUMN package_order integer NOT NULL DEFAULT 0;
```

Ingen RLS-endring nødvendig — eksisterende policyer på `projects`/`quotes` dekker de nye kolonnene uendret.

**`is_package_template`-filteret** legges til i `getProjectsForPipeline()` (`lib/actions/pipeline.ts:28`) og ethvert annet sted som lister prosjekter for den vanlige salgs-pipelinen/Kanban-tavlen (samme type ekskluderingsfilter som allerede finnes for andre spesialtilfeller der — se kommentarene om "Fullført"-filteret i samme fil). Et pakke-tilbuds prosjekt skal **kun** være synlig gjennom en dedikert, egen liste (se Admin UI under), ikke i den vanlige tavlen.

## Tilbudsgenerator — "Lagre som pakke"

I `components/quote/QuoteBuilder.tsx`:

- Ny handling/panel: sett `package_label` + `package_category` + `package_order` på det åpne tilbudet. Et tilbud uten `package_label` (NULL) er fortsatt bare et helt normalt tilbud — ingenting endrer seg i den vanlige tilbuds-flyten for alle eksisterende tilbud.
- Når man starter en **ny** pakke-mal: en egen "Lag pakke-mal"-handling (ikke den vanlige "nytt tilbud"-knappen) som sikrer at det delte "Pakkemaler"-prosjektet/-kunden finnes (oppretter dem første gang, gjenbruker dem senere) og lager et nytt `quotes`-rad under det prosjektet. **Byggeren avgjør** nøyaktig UI-plassering av denne knappen.
- Ny handling: **"Dupliser som nytt tilbud"** på et pakke-merket tilbud — oppretter et helt nytt, normalt prosjekt (`is_package_template = false`, vanlig pipeline-status) + kunde (velges/opprettes som normalt) + et nytt `quotes`-rad med en dyp kopi av malens `quote_data`, men **uten** `package_label`/`package_category` (det er nå et ekte kundetilbud, ikke en mal). Kan kalles vilkårlig mange ganger fra samme mal uten at malen endres — dette er mekanismen som støtter "3 kunder slår til på samme pakke samtidig".
- **Presisert etter byggerkontroll — fjerning av pakke-merking:** hvis staff fjerner `package_label` (setter tilbake til NULL) på et tilbud som fortsatt er referert av en eller flere `sales_flyer_packages`-rader, slettes de referansene automatisk i samme handling (unngår et stille, "foreldreløst" pakkekort på en publisert flyer). Hvis tilbudet er i bruk på en **publisert** flyer, vises en bekreftelsesdialog ("Dette tilbudet vises på flyeren X — fjern merkingen likevel?") før det utføres.

## Admin UI

- Utvidelse av eksisterende `/admin/landingssider`: en type-switcher/fane (Bransjesider | Flyers) på samme side, siden Magnus selv rammet dette som "landingssider deles inn i disse to" — ikke en helt separat toppnivå admin-side.
- Flyer-liste: slug, publisert-badge, sist oppdatert, "+ Ny flyer".
- Redigering: inline på selve den offentlige siden, samme mønster som bransjesidene (staff ser nøyaktig det en besøkende ser, redigerer direkte i det) — video-opplasting for hero, `CasePickerModal` for eksempler, fritekst for engasjement-teksten, en pakke-plukker (lister alle tilbud med `package_label IS NOT NULL`, lar staff velge hvilke som vises på denne flyeren + rekkefølge), CTA-felter inkl. e-post.
- Egen, dedikert liste over pakke-maler (`is_package_template = true`-prosjekter/tilbud) — siden disse med vilje er skjult fra hovedpipelinen, må det finnes et sted staff faktisk kan finne dem igjen for å redigere eller duplisere. Forslag: en enkel filtrert visning, f.eks. en fane på `/admin/quotes` eller en liten egen side — **byggeren avgjør** eksakt plassering, dette er et lite, isolert UI-element.

## Flyer-siden

- Ny rute: `app/flyer/[slug]/page.tsx` + egen `layout.tsx` — **ikke** under `app/(marketing)/`, siden det er bransjesidenes rutegruppe med sin egen `MarketingChrome`/stil. Server component som:
  1. Slår opp `sales_flyers`-raden på slug via service-klient (samme autorisasjons-mønster som `/p/[token]`: slug+publisert-sjekk er grensen, ikke RLS på en direkte anon-klient).
  2. `notFound()` hvis ingen rad, eller upublisert og besøkende ikke er innlogget staff (forhåndsvisning).
  3. Henter ordnede cases og ordnede pakke-tilbud (join til `quotes`, kjører `calculateQuoteTotals`/tilsvarende på hver for å få visningsprisen) parallelt.
  4. Renderer en ny, enkel fast mal: video-hero (full-bleed), eksempel-cases, kort engasjement-tekst, pakkekort gruppert i de tre kategoriene (Bilder / Film / Bilder og film), CTA med `mailto:${cta_email}`.
- `generateMetadata`: `meta_title`/`meta_description`, `robots: {index: false, follow: false}` (samme oppsøkende, ikke-indekserte posisjon som de andre pitch-/bransje-sidene), OG-bilde fra `hero_poster_path` når den finnes.
- Visuell stil: global cinematisk palett (Cormorant Garamond + DM Sans, `#0C0B09`/`#C49434`) — ingen `MarketingChrome`-import.

## Verifikasjon

- `npx tsc --noEmit` rent.
- `getProjectsForPipeline()` og Kanban-tavlen viser **ingen** `is_package_template`-prosjekter. Samme sjekk gjentas for økonomisiden, dashboard-widgets, `/admin/quotes`-listen og kunde-detaljens tilbudshistorikk — pakke-maltilbud skal ikke telle med i noen omsetnings- eller aktivitetstall noe sted.
- Lag to pakke-tilbud ("Liten pakke" i kategori "foto", "Stor pakke" i "foto") **under det samme delte Pakkemaler-prosjektet**, knytt begge til en testflyer, bekreft riktig gruppering og riktig, faktisk beregnet pris vises på `/flyer/test-slug`.
- Dupliser samme pakke-tilbud til 3 nye, uavhengige tilbud/prosjekter for 3 ulike (test)kunder — bekreft alle 3 dukker opp i vanlig pipeline, at originalen forblir utenfor pipeline og uendret, og at en endring i én duplikat-kopi ikke påvirker de andre eller originalen.
- Fjern `package_label` fra et tilbud som er i bruk på en publisert testflyer — bekreft at bekreftelsesdialogen vises, og at kortet forsvinner fra flyeren (ikke blir stående som et foreldreløst/stale kort) etter bekreftet fjerning.
- Bekreft `mailto:`-lenken på flyeren peker til nøyaktig `cta_email`-verdien satt for denne spesifikke flyeren (test med to ulike flyers med ulik `cta_email`).
- Bekreft at en upublisert flyer gir `notFound()` for en ikke-innlogget besøkende, men er synlig (forhåndsvisning) for innlogget staff.
- Bekreft at anonym `curl` mot en publisert flyer ikke kan nå `quotes`-tabellen direkte (kun service-klient server-side gjør oppslaget).
- Besøk en publisert testflyer anonymt (uten innlogging) flere ganger — bekreft at `sales_flyer_views` får én rad pr. visning og at tellingen i `/admin/landingssider` øker. Besøk den samme flyeren innlogget som staff — bekreft at **ingen** ny rad logges.
