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
- Admin kan redigere alt innhold på en eksisterende side: hero (video **eller** bilde, headline), ingress, en ordnet liste med case-studier (valgt fra det eksisterende case-biblioteket), "Om oss"-tekst + bilde, avsluttende CTA-tekst, og SEO-metadata (tittel/beskrivelse).
- `/energi` migreres til å være den første siden i dette systemet — dagens innhold legges inn som seed-data i migrasjonen, og `app/energi/page.tsx` fjernes til fordel for den nye dynamiske ruten (se "Ruting" for hvorfor `app/energi/layout.tsx` beholdes, slanket, for `/energi/arbeid`). Visuelt og funksjonelt uendret for en besøkende.
- En side kan settes til kladd (`published = false`) og skjules fra offentligheten mens den redigeres.

## Ikke-mål

- Ingen fri seksjons-rekkefølge/nye seksjonstyper utover det `/energi` allerede bruker (hero, ingress, cases, om oss, CTA). Et ekte fritt bygge-verktøy er en mye større jobb og ikke det som er bedt om.
- `app/energi/arbeid/page.tsx` (en egen, hardkodet "se alt arbeid"-side) røres ikke — den er ikke nevnt i oppgaven og er et eget, urelatert stykke tech debt. Noteres som en mulig oppfølging, ikke en del av denne leveransen.
- Ingen inline rediger-på-selve-siden (slik pitch-systemet har på `/p/[token]`). Redigering skjer fra en egen admin-side, slik Magnus ba om.
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
- `app/(marketing)/[slug]/layout.tsx` — bruker samme delte "marketing chrome" som beskrevet under, men med `generateMetadata` lest fra DB (`meta_title`/`meta_description`) i stedet for en hardkodet konstant.
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

Ny nav-lenke i `app/admin/layout.tsx`, i «Salg & CRM»-gruppen: `{ href: '/admin/landingssider', label: 'Landingssider' }`.

- **`app/admin/landingssider/page.tsx`** — liste over alle `industry_landing_pages` (slug, publisert-badge, sist oppdatert), "+ Ny side"-knapp (ber om slug, validerer mot reservert-liste/format, oppretter tom rad med `published = false`, navigerer til redigeringssiden). Samme visuelle mønster som `/admin/cases`.
- **`app/admin/landingssider/[id]/edit/page.tsx`** — redigeringsskjema, samme stil som `/admin/retning` (tekstfelt per innholdsfelt, ikke rich text siden dagens innhold er ren tekst):
  - Slug (kun visning + evt. endring med samme validering), publisert-bryter, SEO-felt.
  - Hero: type-valg (video/bilde), filopplasting (direkte til Supabase Storage `assets`-bucket under `landing-pages/{slug}/`, samme opplastingsmønster som `app/admin/cases/new/page.tsx` sin thumbnail-opplasting), headline-felt.
  - Ingress-felt.
  - Case-liste: viser valgte cases i rekkefølge med opp/ned-knapper (samme mønster som "Ekstra lenker" på postprod-siden) og en "+ Legg til case"-knapp som åpner **`CasePickerModal`** (gjenbrukt uendret) mot hele `case_studies`-biblioteket.
  - Om oss: heading, fritekst (avsnitt via tom linje), bilde — bildevalg via **`ImagePickerModal`** (gjenbrukt uendret) eller direkte opplasting, samme valg som hero.
  - CTA: headline, undertekst, e-post.
- **`lib/actions/industry-landing-pages.ts`** (nytt, `'use server'`, samme mønster som `lib/actions/email-footer.ts`/`lib/actions/leads.ts`): `listIndustryLandingPages`, `getIndustryLandingPage(slugOrId)`, `createIndustryLandingPage(slug)`, `updateIndustryLandingPage(id, fields)`, `setIndustryLandingPageCases(id, caseStudyIds[])` (erstatter hele lista i riktig rekkefølge, enklest korrekte implementasjon for en kort liste), `deleteIndustryLandingPage(id)`.
- **`lib/types.ts`**: legg til `IndustryLandingPage` og `IndustryLandingPageCase`-typer.

## Verifikasjon

- `npx tsc --noEmit` rent.
- Før migrasjon 173 kjøres: grep etter `.from('case_studies').insert|update|delete` og `.storage.from('assets').upload|remove` under de kundevendte rutene (`app/p/`, `app/s/`, `app/v/`, `app/b/`, `app/d/`) — skal ikke gi treff (se "Datamodell — 173").
- Migrasjoner kjøres mot lokal/dev-tilkobling (samme `psql`-mønster med port 5432 som tidligere migrasjoner i denne sesjonen); `SELECT` bekrefter seed-raden for `energi` og de to case-koblingene, og at de nye case_studies/assets-policyene er staff-scoped.
- Dev-server: `/energi` rendres **visuelt identisk** til før endringen (samme skjermbilde-sjekk i nettleseren som ble gjort for de to foregående `/energi`-fiksene i denne samtalen — full-bleed hero, like store case-bokser, "Om oss", CTA). `/energi/arbeid` fortsatt fungerende, med samme fonter/robots-metadata som før.
- Bekreft at `/admin-kurs` og `/login-film` (ikke-eksisterende stier) ikke lenger feilaktig omdirigeres av `middleware.ts` etter grense-fiksen, og at `/admin`, `/admin/projects`, `/login`, `/auth/callback` fortsatt oppfører seg som i dag.
- Opprett en testside (f.eks. slug `test-bransje`) fra `/admin/landingssider`, fyll inn minimalt innhold. Last opp et **dedikert, engangs-test-bilde** (ikke et eksisterende biblioteksbilde — unngår å røre noe som faktisk brukes av et pitch-prosjekt eller en annen side, siden `images`-sletting kaskaderer til `section_images`) til `/admin/images` spesifikt for denne verifiseringen, velg det via `ImagePickerModal` på testsiden, publiser, bekreft at `/test-bransje` er live uten noen kodeendring. Slett deretter **kun dette test-bildet** fra `/admin/images` og bekreft at testsiden fortsatt viser bildet (kopiert, ikke referert). Rydd opp (slett testsiden og det kopierte filobjektet dens) etterpå.
- Bekreft at en upublisert side gir `notFound()` for en ikke-innlogget besøkende, men er synlig for en innlogget staff-bruker (forhåndsvisning) — og, hvis det finnes en kundekonto å teste med, at en publisert side også er synlig for en innlogget kunde (ikke bare anon).
