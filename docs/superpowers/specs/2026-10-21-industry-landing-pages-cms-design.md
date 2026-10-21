# Bransje-landingssider som admin-redigerbart innhold — design

## Bakgrunn

`/energi` er en frittstående, ikke-indeksert (`robots: noindex`) oppsøkende side rettet mot energibransje-prospekter — samme idé som en pitch-side (`/p/[token]`), men med en fast, gjenbrukbar slug i stedet for et engangs-token, slik at den kan sendes til flere prospekter over tid og oppdateres sentralt. Hele siden (`app/energi/page.tsx` + `layout.tsx` + hjelpekomponenter) er i dag hardkodet i koden: tekst, bilder, case-valg og hero-video krever en kodeendring + deploy for hver justering.

Magnus ønsker flere slike bransjesider (`/bryllup`, `/sport`, osv.) med **samme layout**, men der **innholdet** kan settes opp og redigeres fra adminpanelet — inkludert å opprette en helt ny side (ny slug) uten kodeendring.

### Relevante eksisterende mønstre (gjenbrukes, ikke dupliseres)

- **`case_studies`-tabellen** (brukt av pitch-byggerens `CasesSection`) inneholder allerede Corvus Energy og Statkraft med nøyaktig samme `thumbnail_path`/`vimeo_url` som er hardkodet i `app/energi/page.tsx` i dag. Den har også en `public_read_case_studies`-policy for `anon` allerede. Bransjesidene skal **referere** disse radene, ikke duplisere case-innhold.
- **`CasePickerModal`** og **`ImagePickerModal`** (`components/modals/`) er allerede generiske plukke-modaler mot hhv. `case_studies` og `images`-biblioteket (`/admin/images`). Gjenbrukes for å velge cases og "Om oss"-bilde.
- **Singleton-redigerbart-innhold-mønsteret** fra `company_direction` (158) og `email_footer_template` (170): egen tabell, staff-only RLS, redigeres fra en admin-side. Samme grunnmønster, men her trenger vi **flere rader** (én per side) + en **public anon-read**-policy (som `case_studies`/`section_case_studies` allerede har), siden innholdet skal vises på en offentlig URL.
- **Pitch-byggerens `Section`/`SectionRenderer`-system** (`lib/types.ts`, `components/sections/*`) ble vurdert, men forkastes som mal her: det er tungt koblet til `Project`/pitch-domenet (quote, timeline, team, production_schedule, deliverables — ingen av disse gir mening for en bransjeside), støtter fri seksjons-rekkefølge/typer, og drar inn mye kompleksitet (AI-generering, scroll-progress-sporing, collage-presets) som ikke trengs. Magnus var dessuten eksplisitt: *"layouten blir den samme og endres kun herfra"* — altså ett fast malverk med redigerbare **felter**, ikke en fri side-bygger. Arkitekturen her er derfor én strukturert rad med faste felter per side, pluss en liste med case-referanser — ikke et generisk seksjons-system.

## Mål

- Admin kan opprette en ny bransjeside (slug, f.eks. `bryllup`) fra en egen admin-side, og den er umiddelbart live på `/bryllup` — ingen kodeendring eller deploy.
- Admin kan redigere alt innhold på en eksisterende side **inline, direkte på selve siden** — samme idé som redigeringsmodus på pitch-siden (`/p/[token]`): staff ser siden akkurat slik en besøkende ville sett den, og klikker/redigerer teksten, bildene og case-listen der de faktisk vises, i stedet for å fylle ut et skjema separat fra resultatet. Hero (video **eller** bilde, headline), ingress, en ordnet liste med case-studier (valgt fra det eksisterende case-biblioteket), "Om oss"-tekst + bilde, avsluttende CTA-tekst, og SEO-metadata (tittel/beskrivelse, uten naturlig synlig plassering — egen liten panel).
- `/energi` migreres til å være den første siden i dette systemet — dagens innhold legges inn som seed-data i migrasjonen, og `app/energi/page.tsx` fjernes til fordel for den nye dynamiske ruten (se "Ruting" for hvorfor `app/energi/layout.tsx` beholdes, slanket, for `/energi/arbeid`). Visuelt og funksjonelt uendret for en besøkende.
- En side kan settes til kladd (`published = false`) og skjules fra offentligheten mens den redigeres.

## Ikke-mål

- Ingen fri seksjons-rekkefølge/nye seksjonstyper utover det `/energi` allerede bruker (hero, ingress, cases, om oss, CTA). Et ekte fritt bygge-verktøy er en mye større jobb og ikke det som er bedt om.
- `app/energi/arbeid/page.tsx` (en egen, hardkodet "se alt arbeid"-side) røres ikke — den er ikke nevnt i oppgaven og er et eget, urelatert stykke tech debt. Noteres som en mulig oppfølging, ikke en del av denne leveransen.
- Ingen flerspråk-støtte (matcher at resten av siten er norsk-only i dag).
- Jeg skriver ikke faktisk tekst/innhold for `/bryllup`, `/sport` e.l. — denne leveransen er infrastrukturen; Magnus fyller inn reelt innhold via admin når han er klar.

## Datamodell — migrasjon `173_harden_case_studies_and_assets_rls.sql`

**Funnet under planrevisjon (Codex), bekreftet mot koden:** `case_studies` (`019_enable_rls_all_tables.sql`) og `storage.objects` for `assets`-bucketen (`087_tighten_public_rls.sql`) har i dag `TO authenticated USING (true)`-policyer for INSERT/UPDATE/DELETE — altså **enhver innlogget bruker**, ikke bare staff. `profiles.role = 'customer'` er en reell, ekskludert-fra-`is_staff()`-rolle som logger inn via ordentlig Supabase Auth (`app/login/page.tsx`) for sin prosjektportal. En kunde kan i dag redigere/slette en hvilken som helst case study, eller slette/overskrive en hvilken som helst fil i `assets`-bucketen, direkte via Supabase-klienten — forbi appens UI. Dette var ikke dekket av 152–156-hardeningen. Siden de nye landingssidene **leser** fra disse to, uten en egen fiks ville en kundekonto kunne redigere en publisert sides case-tekst eller slette hero-bildet. Rettes først, i en egen liten migrasjon (samme mønster som 087 — presis omskriving av eksisterende policyer, ingen ny tabell):

```sql
DROP POLICY IF EXISTS "authenticated_insert_case_studies" ON case_studies;
DROP POLICY IF EXISTS "authenticated_update_case_studies" ON case_studies;
DROP POLICY IF EXISTS "authenticated_delete_case_studies" ON case_studies;

CREATE POLICY "staff_insert_case_studies" ON case_studies
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff_update_case_studies" ON case_studies
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff_delete_case_studies" ON case_studies
  FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Allow upload to assets" ON storage.objects;
CREATE POLICY "Allow upload to assets" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'assets' AND public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "Allow delete from assets" ON storage.objects;
CREATE POLICY "Allow delete from assets" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'assets' AND public.is_staff(auth.uid()));
```

Verifiseres mot eksisterende forbrukere før kjøring: alle stedene som i dag skriver til `case_studies` eller laster opp/sletter i `assets`-bucketen (`/admin/cases/*`, `/admin/images/*`, m.fl.) går allerede via innloggede staff-sider i adminpanelet — ingen kjent kundevendt flyt skriver til disse, så innstrammingen bør være atferdsnøytral for alt legitimt bruk. Dobbeltsjekkes med et grep etter `.from('case_studies').insert|update|delete` og `.storage.from('assets').upload|remove` under `app/p/`, `app/s/`, `app/v/`, `app/b/`, `app/d/` (kundevendte ruter) rett før migrasjonen kjøres — skal ikke gi treff.

## Datamodell — migrasjon `174_industry_landing_pages.sql`

```sql
CREATE TABLE industry_landing_pages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                text NOT NULL UNIQUE,          -- "energi", "bryllup" — validert mot reservert-liste + kebab-case i appen
  published           boolean NOT NULL DEFAULT false,
  meta_title          text NOT NULL DEFAULT '',
  meta_description    text NOT NULL DEFAULT '',
  hero_type           text NOT NULL DEFAULT 'video' CHECK (hero_type IN ('video','image')),
  hero_video_path     text,                          -- Supabase Storage "assets"-bucket, når hero_type = 'video'
  hero_poster_path    text,                          -- vises til video er lastet / er selve bildet når hero_type = 'image'
  hero_headline       text NOT NULL DEFAULT '',
  lede_text           text NOT NULL DEFAULT '',
  about_heading       text NOT NULL DEFAULT 'Om oss',
  about_content       text NOT NULL DEFAULT '',       -- avsnitt separert med tom linje, samme konvensjon som andre fritekstfelt i appen
  about_image_path    text,
  cta_headline        text NOT NULL DEFAULT '',
  cta_subtext         text NOT NULL DEFAULT '',
  cta_email           text NOT NULL DEFAULT 'post@leafilms.no',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE industry_landing_page_cases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id         uuid NOT NULL REFERENCES industry_landing_pages(id) ON DELETE CASCADE,
  case_study_id   uuid NOT NULL REFERENCES case_studies(id) ON DELETE CASCADE,
  order_index     integer NOT NULL DEFAULT 0,
  UNIQUE (page_id, case_study_id)
);

ALTER TABLE industry_landing_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE industry_landing_page_cases ENABLE ROW LEVEL SECURITY;

-- Staff full tilgang (samme mønster som company_direction/case_studies)
CREATE POLICY "staff_all_industry_landing_pages" ON industry_landing_pages
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "staff_all_industry_landing_page_cases" ON industry_landing_page_cases
  FOR ALL TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

-- Offentlig lesetilgang kun for publiserte sider — gjelder BÅDE anon og
-- authenticated (en innlogget kunde i sin prosjektportal er 'authenticated',
-- ikke 'anon', og skal se akkurat samme publiserte sider som en utlogget
-- besøkende; funnet under planrevisjon — en anon-only policy ga 404 på en
-- publisert side for enhver innlogget kunde, siden staff-ALL-policyen over
-- ikke dekker role='customer'). Draft-sider er fortsatt kun synlige for staff.
CREATE POLICY "public_read_published_industry_landing_pages" ON industry_landing_pages
  FOR SELECT TO anon, authenticated USING (published = true);
CREATE POLICY "public_read_industry_landing_page_cases_for_published" ON industry_landing_page_cases
  FOR SELECT TO anon, authenticated
  USING (page_id IN (SELECT id FROM industry_landing_pages WHERE published = true));

-- Seed: dagens /energi-innhold, markert publisert
INSERT INTO industry_landing_pages (slug, published, meta_title, meta_description, hero_type,
  hero_video_path, hero_poster_path, hero_headline, lede_text, about_content, about_image_path,
  cta_headline, cta_subtext)
VALUES ('energi', true, 'Leafilms for energibransjen', 'Film og foto for norske energiselskaper, fra Leafilms.',
  'video', '/energi/hero.mp4', '/energi/hero-poster.jpg',
  'Vi filmer selskapene som holder Norge i gang.',
  'Corvus Energy og Statkraft har allerede vist fram arbeidet sitt gjennom oss.',
  '<avsnittene fra dagens "Om oss"-tekst, se app/energi/page.tsx>', '<supabase-url til 511810jjo23.jpg>',
  'Klare for å vise fram arbeidet deres?', 'Send oss noen ord om prosjektet, så tar vi kontakt for en uforpliktende prat.');

INSERT INTO industry_landing_page_cases (page_id, case_study_id, order_index)
SELECT (SELECT id FROM industry_landing_pages WHERE slug = 'energi'), id,
  CASE WHEN title = 'CORVUS ENERGY' THEN 0 ELSE 1 END
FROM case_studies WHERE title IN ('CORVUS ENERGY', 'STATKRAFT');
```

**Merk om hero-video:** dagens `/energi/hero.mp4` ligger som en statisk fil i `public/energi/`. Den flyttes **ikke** automatisk til Supabase Storage i migrasjonen — seed-raden peker fortsatt på den statiske filstien (fungerer identisk, siden `public/`-filer fortsatt serveres). Admin kan laste opp en ny video senere via redigeringssiden, som da erstatter stien med en Supabase Storage-URL. Samme med `hero-poster.jpg` og "Om oss"-bildet.

**Hvorfor `hero_type` med to varianter:** layoutet skal være "det samme" på tvers av sider, men ikke nødvendigvis "video på alle" — en fremtidig `/bryllup`-side vil trolig foretrekke et stillbilde. Å støtte begge fra dag én er marginalt mer arbeid (én betinget gren i hero-komponenten) og unngår en vrien migrasjon senere.

**Bildevalg via `ImagePickerModal` kopierer, refererer ikke (funnet under planrevisjon):** `app/admin/images/page.tsx` sletter det underliggende storage-objektet før `images`-raden slettes. Hvis `hero_poster_path`/`about_image_path` pekte direkte på en fil i det delte bildebiblioteket, ville en admin som sletter det bildet i `/admin/images` senere — helt urelatert til landingssiden — brekke en publisert sides hero/om oss-bilde uten varsel, og uten at jeg rører den eksisterende slette-flyten (som er brukt mange andre steder og ikke skal endres her). Løsningen er å **kopiere** filen til siden sitt eget lagringsområde idet admin velger den, ikke lagre en levende referanse til biblioteket: ved valg i `ImagePickerModal`, server-side kopier (`supabase.storage.from('assets').download()` + `.upload()` til `landing-pages/{slug}/...`, eller en ren storage-til-storage-kopi hvis tilgjengelig i SDK-versjonen) før `hero_poster_path`/`about_image_path` lagres. Direkte opplasting (samme sti) trenger ingen kopi, den er allerede siden sin egen fil.

**Seed-bildet har samme problem, bekreftet mot databasen (funnet under 2. planrevisjon):** `511810jjo23.jpg` (dagens "Om oss"-bilde på `/energi`) er faktisk en registrert rad i `images`-tabellen (`id c1c4bc1a-b72f-497a-ac10-5a1a5b764a3c`, slettbar fra `/admin/images` i dag). Seed-innsettingen i migrasjonen over går via ren SQL og kan ikke gjøre storage-til-storage-kopiering selv (det krever Storage-API-et, ikke bare `INSERT`). Derfor: migrasjonen setter inn `energi`-raden med `about_image_path` pekende på den **eksisterende** biblioteksfilen midlertidig, og et lite engangs-skript (`scripts/seed-energi-landing-page-media.ts`, kjørt rett etter migrasjonen, samme `tsx scripts/...`-mønster som andre engangs-skript i `scripts/`) laster ned `assets/images/511810jjo23.jpg` og laster den opp på nytt til `assets/landing-pages/energi/about.jpg`, og oppdaterer `about_image_path` på `energi`-raden til den nye stien. Etter dette steget har ikke lenger noen publisert landingsside en levende avhengighet til en rad i det delte bildebiblioteket — konsistent med hvordan fremtidige bildevalg allerede håndteres.

## Ruting

I dag: `app/energi/page.tsx` (statisk), `app/energi/layout.tsx`, `app/energi/HeroVideo.tsx`, `app/energi/EnergiBodyClass.tsx`, `app/energi/SmoothScroll.tsx`.

Nytt: en rutegruppe `app/(marketing)/[slug]/` som slår opp siden fra DB basert på slug:

- `app/(marketing)/[slug]/page.tsx` — Server Component. Henter raden (+ cases, sortert på `order_index`) via `getIndustryLandingPage(slug)`. `notFound()` hvis ingen rad, eller hvis rad finnes men `published = false` **og** besøkende ikke er innlogget staff (så admin kan forhåndsvise en kladd via URL). Renderer dagens faste JSX-mal (hero/ingress/cases/om oss/CTA) med feltene fra raden i stedet for hardkodede verdier.
- `app/(marketing)/[slug]/layout.tsx` — bruker samme delte "marketing chrome" som beskrevet under, men med `generateMetadata` lest fra DB (`meta_title`/`meta_description`) i stedet for en hardkodet konstant. **Retter R4 fra inspeksjonen:** `openGraph.images`/`twitter.images` settes til `hero_poster_path` når den finnes (alle sider har et poster/fallback-bilde uansett `hero_type`) — uten dette mistet `/energi` delingsbildet helt. Ikke pikselidentisk med det gamle, dedikerte `/energi/hero-og.jpg` (som var beskåret spesifikt til OG-format, 1200×630, og skiller seg fra `hero-poster.jpg`), men et reelt, relevant delingsbilde i stedet for ingen — en egen dedikert OG-bildefelt per side er ikke verdt kompleksiteten for dette.
- `HeroMedia.tsx` (generalisert fra `HeroVideo.tsx`): rendrer `<video>` når `hero_type = 'video'`, ellers et `<img>`, samme `object-cover`-oppførsel og samme `prefers-reduced-motion`-håndtering for video-varianten.

`app/energi/page.tsx` og `app/energi/HeroVideo.tsx` slettes (erstattet av den dynamiske ruten). `app/energi/arbeid/page.tsx` beholdes **urørt** — men den deler i dag font/body-class/smooth-scroll/`robots: noindex`-oppsettet med `app/energi/layout.tsx` (**funnet under planrevisjon**: å slette hele `app/energi/layout.tsx`, slik første planutkast foreslo, ville fjernet denne arvingen for `/energi/arbeid` stille, siden den undersiden har ingen egen `robots`-metadata og rot-layouten (`app/layout.tsx`) ikke setter noen). Derfor: felles oppsett (Schibsted Grotesk + Newsreader-fontene, kroppsklassen som demper korn-effekten, `SmoothScroll`, `robots: { index: false, follow: false }`) trekkes ut til en delt komponent `components/marketing/MarketingChrome.tsx` (tar `children`, bruker samme to komponenter som i dag — `BodyClass`/`SmoothScroll`, generalisert fra `EnergiBodyClass`/`SmoothScroll` med klassenavnet endret fra `.energi-page` til `.marketing-page` i `app/globals.css` + komponenten). Både `app/(marketing)/[slug]/layout.tsx` (ny, DB-drevet metadata) og `app/energi/layout.tsx` (**beholdes**, nå slankere — wrapper kun `/energi/arbeid`, fortsatt statisk `robots: noindex`-metadata som i dag) bruker denne delte komponenten. Ingen dupliserte font-/scroll-oppsett, og `/energi/arbeid` sin oppførsel er uendret.

**Antagelse å verifisere empirisk under bygging** (lavt risiko, men skal sjekkes, ikke bare antas): med `app/energi/layout.tsx` (slanket, se over) og `app/energi/arbeid/page.tsx` liggende igjen under `app/energi/`, men uten `app/energi/page.tsx`, skal Next.js *ikke* registrere en egen rute for den eksakte stien `/energi` fra den statiske `energi`-mappen (kun `page.tsx`-filer gir en renderbar rute — en `layout.tsx` uten egen `page.tsx` i samme segment gjør det ikke), og dermed falle gjennom til søsken-ruten `app/(marketing)/[slug]/page.tsx`. `/energi/arbeid` skal fortsatt treffe den statiske undersiden, uendret. Verifiseres i dev-server rett etter restruktureringen, før resten av arbeidet fortsetter — reverseres til en dedikert statisk fallback-rute hvis antagelsen er feil.

**Reserverte slugs** (kan ikke opprettes som bransjeside, validert både i klienten og i server action): `admin`, `api`, `auth`, `login`, `b`, `d`, `p`, `s`, `v`, `energi` (siden den har en reservert understi), `girona-form-2026`, og tom/rot. Slug-format: kun `[a-z0-9-]`, ikke start/slutt med bindestrek.

**`middleware.ts`-fiks (funnet under planrevisjon):** `isAdminRoute`/`isLoginRoute`/`isAuthRoute` bruker i dag ren `pathname.startsWith('/admin')`/`startsWith('/login')` uten grense-sjekk — en reservert-liste alene løser ikke dette, siden f.eks. slugen `admin-kurs` (ikke bokstavelig `admin`, altså ikke fanget av reservert-listen) ville fått `'/admin-kurs'.startsWith('/admin')` til å slå ut `true` og blitt feilaktig omdirigert som om det var en admin-rute. Dette er en reell, uavhengig presisjonsfeil i middlewaren som blir utnyttbar først når slugs blir fritt opprettbare fra admin. Fikses ved å gjøre sjekkene grense-bevisste:

```ts
function matchesRoute(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(prefix + '/')
}
const isAdminRoute = matchesRoute(request.nextUrl.pathname, '/admin')
const isLoginRoute = matchesRoute(request.nextUrl.pathname, '/login')
const isAuthRoute = matchesRoute(request.nextUrl.pathname, '/auth')
```

Atferdsnøytralt for alle eksisterende gyldige stier (`/admin`, `/admin/...`, `/login`, `/login?...`, `/auth/...`). Reservert-listen beholdes som forsvar i dybden for de faktiske eksisterende toppnivå-mappene, men er ikke lenger det eneste som hindrer feilaktig omdirigering.

## Admin UI

**Revidert etter første byggerunde** (Magnus, under implementering): redigering skal være **inline, på selve siden** — samme idé som redigeringsmodus på pitch-siden (`/p/[token]`), der staff ser nøyaktig det en besøkende ville sett og redigerer direkte i det, i stedet for et separat skjema som ikke viser resultatet. Reverserer det opprinnelige ikke-målet om et eget redigeringsskjema. Mye lettere enn pitch-systemets `Section`/`SectionRenderer`-maskineri siden datamodellen her er noen få faste felter, ikke en fri seksjonsliste.

Ny nav-lenke i `app/admin/layout.tsx`, i «Salg & CRM»-gruppen: `{ href: '/admin/landingssider', label: 'Landingssider' }`.

- **`app/admin/landingssider/page.tsx`** — uendret: liste over alle `industry_landing_pages` (slug, publisert-badge, sist oppdatert), "+ Ny side"-knapp (ber om slug, validerer mot reservert-liste/format, oppretter tom rad med `published = false`), som nå lenker til **den offentlige siden selv** (`/{slug}`) i stedet for en egen redigeringsrute — det finnes ingen egen `/admin/landingssider/[id]/edit`-side lenger.
- **`app/(marketing)/[slug]/page.tsx`** (Server Component, uendret ansvar: henter data, avgjør `canEdit` via `getAuthenticatedStaffUser()`) rendrer nå en Client Component, **`MarketingPageView`** (`components/marketing/MarketingPageView.tsx`), og gir den `page`, `cases` og `canEdit` som props. Anonyme besøkende og ikke-redigerende staff får nøyaktig samme markup som i dag (ingen edit-maskineri rendres i det hele tatt når `canEdit` er `false`, eller når staff ikke har slått på redigeringsmodus).
- **`MarketingPageView`**:
  - Holder lokal state for `editing` (av/på, kun tilgjengelig når `canEdit`) og en lokal kopi av sideinnholdet, initiert fra server-dataene.
  - En flytende "Rediger"/"Ferdig"-knapp (kun rendret når `canEdit`) slår redigeringsmodus av/på.
  - **I redigeringsmodus**: hvert tekstfelt (hero-overskrift, ingress, "Om oss"-overskrift/tekst, CTA-overskrift/undertekst/e-post) rendres som et innholds-redigerbart element stylet til å se ut som den faktiske teksten (samme font/størrelse/vekt), som lagrer seg selv ved blur — kaller `updateIndustryLandingPage` direkte for det ene feltet, viser en liten feilmelding inline ved lagringsfeil (retter R3 fra inspeksjonen: ingen stille "Lagret ✓" ved faktisk feil). Ingen egen global "Lagre"-knapp, og dermed ingen fare for å miste utfylt-men-ulagret tekst ved andre handlinger på siden (retter R1: det var nettopp en slik "annen handling" — case-plukkeren — som trigget tap av ulagrede tekstfelt i skjema-varianten).
  - Hero-seksjonen og "Om oss"-bildet får et hover-overlegg i redigeringsmodus med "Bytt video/bilde" → åpner enten direkte filopplasting eller **`ImagePickerModal`** (begge veier for BÅDE hero og "Om oss"-bildet — retter R5, som fant at skjema-varianten kun støttet biblioteksvalg for "Om oss", ikke hero).
  - Case-seksjonen får i redigeringsmodus små opp/ned/fjern-kontroller direkte på hvert case-kort, pluss en "+ Legg til case"-knapp som åpner **`CasePickerModal`** (gjenbrukt uendret) — samme underliggende `setIndustryLandingPageCases`-kall som før.
  - Et lite flytende panel (ikke inline på siden, siden feltene ikke har en naturlig synlig plassering) for det som ikke er sidelayout: publisert-bryter, slug (visning), SEO-tittel/beskrivelse.
- **`lib/actions/industry-landing-pages.ts`** (uendret eksport-liste): `listIndustryLandingPages`, `getIndustryLandingPage(slugOrId)`, `createIndustryLandingPage(slug)`, `updateIndustryLandingPage(id, fields)`, `setIndustryLandingPageCases(id, caseStudyIds[])`, `deleteIndustryLandingPage(id)`, `copyLibraryImageToPage`. `setIndustryLandingPageCases` endres fra to separate DELETE/INSERT-kall til ett `supabase.rpc('replace_landing_page_cases', ...)`-kall (se migrasjon 175 under) — retter R2: et nettverksbrudd eller en ugyldig case-id mellom de to separate kallene kunne før la siden stå med en tom case-liste.
- **`lib/types.ts`**: uendret — `IndustryLandingPage` og `IndustryLandingPageCase`-typer.

## Migrasjon `175_replace_landing_page_cases_rpc.sql`

Retter R2 fra inspeksjonen. En Postgres-funksjon som gjør delete+insert i én transaksjon (en funksjonskropp er implisitt atomisk), kalt via `supabase.rpc(...)` i stedet for to separate klient-kall:

```sql
CREATE OR REPLACE FUNCTION public.replace_landing_page_cases(
  p_page_id uuid,
  p_case_study_ids uuid[]
) RETURNS void AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  DELETE FROM industry_landing_page_cases WHERE page_id = p_page_id;

  INSERT INTO industry_landing_page_cases (page_id, case_study_id, order_index)
  SELECT p_page_id, id, ord - 1
  FROM unnest(p_case_study_ids) WITH ORDINALITY AS t(id, ord);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

`SECURITY DEFINER` + en eksplisitt `is_staff()`-sjekk inni funksjonen (siden RPC-kall ikke automatisk går gjennom tabell-RLS-policyene på samme måte som direkte `.from()`-kall — funksjonen må selv håndheve det samme staff-only-kravet som `staff_all_industry_landing_page_cases`-policyen allerede uttrykker).

## Migrasjon `176_lock_replace_landing_page_cases.sql`

Funnet under 2. Codex-inspeksjon (av selve inline-redigerings-byggingen): funksjonen over var transaksjonell internt, men serialiserte ikke to **samtidige** kall for samme side — to staff-sesjoner som erstatter en tom case-liste med hhv. `[A]` og `[B]` samtidig kunne begge få `DELETE`-setningen til å treffe null rader og begge `INSERT`-setningene til å lykkes, med et sammenflettet sluttresultat. Retter med `SELECT ... FOR UPDATE` på foreldreraden før delete/insert (serialiserer de to kallene) + et eksplisitt avvis av et ukjent `page_id` (`CREATE OR REPLACE FUNCTION` — samme signatur, egen migrasjon for sporbarhet).

## Øvrige funn fra 2. Codex-inspeksjon, alle rettet

- **Uendelig nullstilling i bildevelgeren (høy):** `ImagePickerModal` ble kalt uten `selectedImageIds`, så default-verdien `[]` fikk en ny referanse på hver render — modalens interne `useEffect` synker valg fra denne proppen på referanse-endring, og nullstilte dermed brukerens pågående valg hver gang noe annet i redigeringsmodus rendret på nytt mens plukkeren var åpen. Rettet med en stabil, modul-nivå tom-array-konstant.
- **Hero-kontrollene kunne ikke klikkes (høy):** bade hero-kontrollene (type/opplasting/biblioteksvalg) og tekst-innholdswrapperen under hadde `z-index: 10` — wrapperen kom senere i DOM og fanget dermed klikk over hele hero-området, selv der kun kontrollene var synlige. Rettet ved å heve kontrollene til `z-index: 20`.
- **Stille "lagret" ved 0 påvirkede rader (middels):** `updateIndustryLandingPage` sjekket kun `error`, ikke om raden faktisk ble truffet — en slettet side eller en RLS-filtrert oppdatering ga "ok" uten at noe ble lagret. Rettet med `.select('id')` + eksplisitt feil hvis ingen rad kom tilbake.
- **Full side-reload etter case-lagring (middels):** `handleCasePickerSave` kalte `window.location.reload()` for å få tak i de nye casenes data, noe som kunne kaste bort andre ulagrede/mislykkede feltendringer — nøyaktig den typen tap den reviderte redigerings-modellen skulle fjerne. Rettet med en målrettet re-henting av kun case-listen (`getIndustryLandingPageBySlug`), slått inn i eksisterende lokal tilstand.
- **Stille svelgde opplastings-/kopieringsfeil (middels):** mislykket filopplasting eller biblioteks-kopiering viste ingen feil til brukeren. Rettet ved å vise disse gjennom samme feil-UI som tekstfelt-lagring, og nullstille filvelgeren etter bruk slik at samme fil kan velges på nytt ved feil.

## Øvrige funn fra 3. Codex-inspeksjon, alle rettet

- **Lenis fanget scroll inni plukke-modalene (middels):** `SmoothScroll`/Lenis er kun brukt på bransjesidene — `CasePickerModal`/`ImagePickerModal` har aldri stått på en Lenis-styrt side før (pitch-byggeren, som også bruker dem, har ingen smooth-scroll). Med et langt bildebibliotek ville musehjul/touchpad i modalen rullet bakgrunnssiden i stedet for bildelisten. Rettet med `data-lenis-prevent` på modalenes rulle-container — inert og virkningsløst på sider uten Lenis, så trygt å legge til i de delte komponentene.
- **Delt feilmelding kunne maskeres av en urelatert lagring + ingen forsøk på nettverksfeil/avvist promise (middels):** `fieldError` ble tømt ved START av enhver ny lagring, ikke bare ved et nytt utfall — en reell feil (f.eks. mislykket publiseringsendring, bryteren viser fortsatt avhuket lokalt selv om databasen ikke ble oppdatert) kunne forsvinne stille idet brukeren redigerte noe helt annet. Et nettverksnivå-avvist kall (ikke bare et `{error}`-svar) ble heller ikke fanget noe sted, så `savingField` kunne bli stående uendelig. Rettet: `saveField` og de andre mutasjons-handlerne wrapper nå i try/catch/finally, feilmeldingen tømmes kun ved et vellykket utfall (ikke ved start av noe nytt), og diskrete felt (publisert-bryteren, case-listen ved reorder/fjerning) reverteres til forrige verdi ved feil — fritekstfelt beholder det brukeren skrev (reverte ville kastet bort arbeidet deres i stedet for bare å gi en feil å prøve på nytt fra).
- **`prefers-reduced-motion` kun sjekket ved mount (lav):** `HeroMedia` sin effekt kjørte kun én gang — en video som dukker opp etter mount (f.eks. hero-type byttes fra bilde til video i redigeringsmodus) fikk ikke redusert-bevegelse-preferansen håndhevet. Rettet ved å legge `type`/`src` i avhengighetslisten, slik at sjekken kjører på nytt hver gang en ny video faktisk monteres.

## Øvrige funn fra 4. Codex-inspeksjon, alle rettet

- **Delt feilmelding kunne fortsatt maskeres, nå av en ANNEN felts suksess (middels):** runde 3 sin fiks løste kun "tømmes ved start av en ny lagring" — en ekte gjenværende feil på f.eks. hero-overskriften forsvant fortsatt stille idet et helt annet felt (f.eks. ingressen) ble lagret vellykket rett etter, siden begge delte samme `fieldError`-variabel. Omstrukturert til **per-felt** tilstand (`fieldErrors: Partial<Record<Field, string>>`), vist som en liten inline-melding rett under nettopp det feltet som feilet, kun tømt av DET feltets egen vellykkede lagring.
- **Kapp-løp mellom samtidige case-mutasjoner (middels):** rask dobbelklikk på "fjern" før første forespørsel var ferdig kunne la en sent ankommende rollback fra den første overskrive resultatet av en raskere, vellykket andre. Rettet ved å disable alle case-knapper (flytt/fjern/legg til) mens én mutasjon er underveis — serialiserer fullstendig i stedet for å måtte rekonsiliere utfall i vilkårlig rekkefølge.
- **`updated_at` ble ikke oppdatert ved case-endring (lav):** `replace_landing_page_cases` endret kun selve case-koblingene, aldri foreldre-sidens `updated_at`/`updated_by` — admin-listens "sist oppdatert" ble stående på et gammelt tidspunkt etter en ren case-endring. Rettet i migrasjon `177_touch_landing_page_on_case_replace.sql` (samme låste transaksjon som 176).

## Verifikasjon

- `npx tsc --noEmit` rent.
- Før migrasjon 173 kjøres: grep etter `.from('case_studies').insert|update|delete` og `.storage.from('assets').upload|remove` under de kundevendte rutene (`app/p/`, `app/s/`, `app/v/`, `app/b/`, `app/d/`) — skal ikke gi treff (se "Datamodell — 173").
- Migrasjoner kjøres mot lokal/dev-tilkobling (samme `psql`-mønster med port 5432 som tidligere migrasjoner i denne sesjonen); `SELECT` bekrefter seed-raden for `energi` og de to case-koblingene, og at de nye case_studies/assets-policyene er staff-scoped.
- Dev-server: `/energi` rendres **visuelt identisk** til før endringen (samme skjermbilde-sjekk i nettleseren som ble gjort for de to foregående `/energi`-fiksene i denne samtalen — full-bleed hero, like store case-bokser, "Om oss", CTA). `/energi/arbeid` fortsatt fungerende, med samme fonter/robots-metadata som før.
- Bekreft at `/admin-kurs` og `/login-film` (ikke-eksisterende stier) ikke lenger feilaktig omdirigeres av `middleware.ts` etter grense-fiksen, og at `/admin`, `/admin/projects`, `/login`, `/auth/callback` fortsatt oppfører seg som i dag.
- Opprett en testside (f.eks. slug `test-bransje`) fra `/admin/landingssider`, åpne `/test-bransje`, slå på "Rediger", fyll inn minimalt innhold inline (headline, ingress, en case via `CasePickerModal`, "Om oss"-bilde via opplasting), publiser via innstillinger-panelet, bekreft at `/test-bransje` er live uten noen kodeendring. Rydd opp (slett testsiden fra `/admin/landingssider`-listen) etterpå.
- Bekreft at redigeringsknappen kun vises for innlogget staff (anonymt `curl`-kall mot `/energi` skal ikke inneholde "Rediger" i den server-rendrede HTML-en — ren betinget rendering i `MarketingPageView`, ikke CSS-skjuling).
- Last opp et **dedikert, engangs-test-bilde** (ikke et eksisterende biblioteksbilde — unngår å røre noe som faktisk brukes av et pitch-prosjekt eller en annen side, siden `images`-sletting kaskaderer til `section_images`) til `/admin/images`, velg det via "Fra bibliotek" på "Om oss"-bildet i redigeringsmodus, bekreft at det vises. Slett deretter **kun dette test-bildet** fra `/admin/images` og bekreft at testsiden fortsatt viser bildet (kopiert, ikke referert).
- Bekreft at en upublisert side gir `notFound()` for en ikke-innlogget besøkende, men er synlig for en innlogget staff-bruker (forhåndsvisning) — og, hvis det finnes en kundekonto å teste med, at en publisert side også er synlig for en innlogget kunde (ikke bare anon).
