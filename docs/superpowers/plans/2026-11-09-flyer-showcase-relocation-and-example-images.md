# Flyer: eksempelmedia flyttes til flyer-redigering + ny "Eksempelbilder"-seksjon — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flytt redigering av et pakkekorts eksempelmedia fra tilbudsbyggeren til flyer-redigeringen (nå unikt per flyer, ikke per tilbud), og legg til en ny, flyereid 8-bilde "Eksempelbilder"-seksjon rett etter "Tidligere arbeid".

**Architecture:** Migrasjon `194_` legger `flyer_id` til på `quote_package_showcase_items` (avbryter i stedet for å slette blindt hvis tabellen ikke er tom) og 8 `example_image_N_path`-kolonner på `sales_flyers`. De fire funksjonene i `lib/actions/quote-package-showcase.ts` og RPC-en `replace_quote_package_showcase_items` får en ny `flyerId`/`p_flyer_id`-parameter, som rescoper det eksisterende kopier-ikke-referer-lagringsmønsteret til per flyer i stedet for per tilbud. `PackageShowcasePanel` (uendrede internals) får en `flyerId`-prop og flyttes fra tilbudsbyggeren til en ny, staff-only "Eksempelmedia"-modal på hvert pakkekort i `SalesFlyerView.tsx`. En uavhengig, ny seksjon gjenbruker `copyLibraryImageToFlyer`s eksisterende felt-union-mønster (utvidet med 8 nye verdier) til å la staff velge 8 bilder inn i et fast, BTS-likt asymmetrisk rutenett — en utvidelse av `ExampleWorkSection.tsx`s 5-slot-rytme til 8, uten å gjenbruke selve komponenten.

**Tech Stack:** Next.js 16 App Router, TypeScript (strict), Supabase (Postgres + RLS), Tailwind CSS v4. **Ingen automatisk test-runner finnes i dette repoet** — hvert tasks "test"-steg er derfor manuell verifikasjon (dev-server-klikking, `npx tsc --noEmit`, og for migrasjonstasken en faktisk kjøring av migrasjonen med avbryt-sjekken bevisst utløst).

**Spec:** `docs/superpowers/specs/2026-11-09-flyer-showcase-relocation-and-example-images-design.md` (bygger på `docs/superpowers/specs/2026-11-09-flyer-package-showcase-design.md`)

## Global Constraints

- Migrasjonsfilen er `supabase/migrations/194_flyer_showcase_scope_and_example_images.sql` — bekreft på nytt ved kjøretid at `194_` fortsatt er ledig (`ls supabase/migrations | tail -5 && git status --short`), siden tallet raskt blir utdatert.
- **Avbryt, ikke slett:** migrasjonens Del 1 skal `RAISE EXCEPTION` og la tabellen stå urørt hvis `quote_package_showcase_items` allerede har rader — aldri en blind `DELETE`. Dette er load-bearing, ikke valgfritt.
- Ny nøkkel for `quote_package_showcase_items` blir `(flyer_id, quote_id, kind)` — samme par som `sales_flyer_packages` allerede bruker for flyer↔pakke-koblingen.
- Lagringssti for pakke-eksempelmedia endres fra `quote-packages/{quoteId}/...` til `quote-packages/{flyerId}/{quoteId}/{kind}-{random}.{ext}`.
- `copyLibraryImageToFlyer`s `field`-union utvides med eksakt `'example_image_1'` … `'example_image_8'` — ingen ny kopieringsfunksjon.
- "Eksempelbilder"-seksjonens header bruker samme faste gull-skillelinje + store-bokstaver-etikett som nabo-seksjonene "Tidligere arbeid"/"Pakker" — ikke header-løs som BTS-strimmelen.
- "Eksempelbilder" vises alltid i redigeringsmodus; for en anonym besøkende vises den kun når minst ett av de 8 feltene er satt.
- Ingen endring i "Se mer"-modalen (`PackageDetailModal`) eller ikon-chip-tellingen — kun *hvor* eksempelmedia redigeres, og at det nå er per-flyer.
- `components/sales-flyer/SalesFlyerView.tsx` kan ha flyttet seg igjen siden denne planen ble skrevet — en urelatert, pågående live-redigering av "Tidligere arbeid"-case-kortene (inline Vimeo-avspilling) er i gang akkurat nå. **Les filen på nytt, direkte før redigering, i Task 5 og Task 6 — stol ikke på linjenumrene i denne planen.**
- Rør ikke `ExampleWorkSection.tsx`, dens `CollagePreset`-system, eller dens debug-`fetch`-kall — utenfor scope.
- Ingen endring i `sales_flyer_cases`/"Tidligere arbeid"-seksjonens egen logikk, `PackagePickerModal.tsx`, `ImagePickerModal.tsx`/`VideoPickerModal.tsx`s internals, eller flyer↔pakke-koblingen (`sales_flyer_packages`).

## Review Focus

- **Samme `quote_id` koblet til to forskjellige flyers må ikke lekke eller utelate eksempelmedia på tvers** — selve grunnen til at Del 1 eksisterer. Eid av Task 5.
- **Migrasjonens avbryt-sjekk må faktisk utløses** (ikke stille slette) hvis en rad finnes når migrasjonen kjøres, og fortsette normalt når raden er borte. Eid av Task 1.
- **"Se mer"-knappens synlighet/innhold på flyer-editorens eget pakkekort må oppdateres rett etter at eksempelmedia er redigert i den nye modalen** — uten en full sideoppfriskning. Eid av Task 5.
- **En delvis utfylt "Eksempelbilder"-grid for en anonym besøkende** (noen av 8 satt, noen ikke) må vise tomme slots som blanke — ikke en ødelagt bilde-tag eller "Ingen bilde ennå"-plassholdertekst (som kun hører redigeringsmodus til). Eid av Task 6.
- **Hvert av de 8 bildene må lande i riktig rutenett-posisjon** — en feilkobling mellom `example_image_N` og grid-slot N ville flytte bilder usynlig til feil plass. Eid av Task 6 (test med 8 visuelt distinkte bilder).

## File Structure

- `supabase/migrations/194_flyer_showcase_scope_and_example_images.sql` (ny) — `flyer_id` på `quote_package_showcase_items` + oppdatert RPC + 8 nye `sales_flyers`-kolonner.
- `lib/types.ts` — `SalesFlyer` får 8 `example_image_N_path`-felt; `QuotePackageShowcaseItem` får `flyer_id`.
- `lib/actions/quote-package-showcase.ts` — de 4 funksjonene får `flyerId` som nytt første parameter.
- `lib/actions/sales-flyers.ts` — `copyLibraryImageToFlyer`s felt-union utvides; `getShowcaseItemsByQuoteId` → `getShowcaseItemsByFlyerAndQuoteId`.
- `components/quote/PackageShowcasePanel.tsx` — `flyerId`-prop lagt til, tråder gjennom alle kall.
- `app/admin/projects/[id]/quote/page.tsx` — gammel wiring fjernes.
- `components/sales-flyer/SalesFlyerView.tsx` — ny "Eksempelmedia"-knapp/modal pr. pakkekort, ny "Eksempelbilder"-seksjon.

---

### Task 1: Migrasjon 194 (del 1 + del 2) + felt-union + typer

**Files:**
- Create: `supabase/migrations/194_flyer_showcase_scope_and_example_images.sql`
- Modify: `lib/types.ts` (`SalesFlyer`-typen, etter `bts_image_2_path`; `QuotePackageShowcaseItem`-typen)
- Modify: `lib/actions/sales-flyers.ts` (`copyLibraryImageToFlyer`s `field`-parameter, linje ~294-297)

**Interfaces:**
- Produces: kolonne `quote_package_showcase_items.flyer_id uuid NOT NULL REFERENCES sales_flyers(id) ON DELETE CASCADE`; indeks `quote_package_showcase_items_flyer_quote_idx (flyer_id, quote_id, kind, order_index)` (gammel indeks droppet); RPC `replace_quote_package_showcase_items(p_quote_id uuid, p_flyer_id uuid, p_kind text, p_items jsonb)`; kolonner `sales_flyers.example_image_1_path` … `example_image_8_path text`; `copyLibraryImageToFlyer(slug, imageId, field)`s `field`-union utvidet med `'example_image_1' | ... | 'example_image_8'`; `SalesFlyer.example_image_1_path`…`_8_path: string | null`; `QuotePackageShowcaseItem.flyer_id: string`.
- Consumes: ingen (første task).

- [ ] **Step 1: Bekreft migrasjonsnummeret fortsatt er ledig**

Run: `ls supabase/migrations | tail -5 && git status --short`
Expected: høyeste committede fil er `193_quote_package_showcase.sql`; ingen `194_`-fil finnes ennå.

- [ ] **Step 2: Skriv `supabase/migrations/194_flyer_showcase_scope_and_example_images.sql`**

```sql
-- Del 1: flyer_id på quote_package_showcase_items (nøkkel blir (flyer_id, quote_id, kind))
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM quote_package_showcase_items LIMIT 1) THEN
    RAISE EXCEPTION 'quote_package_showcase_items har eksisterende rader — avbryter i stedet for å slette blindt. Avklar med Magnus før denne migrasjonen kjøres på nytt.';
  END IF;
END $$;

ALTER TABLE quote_package_showcase_items ADD COLUMN flyer_id uuid NOT NULL REFERENCES sales_flyers(id) ON DELETE CASCADE;
DROP INDEX IF EXISTS quote_package_showcase_items_quote_id_idx;
CREATE INDEX quote_package_showcase_items_flyer_quote_idx ON quote_package_showcase_items (flyer_id, quote_id, kind, order_index);

DROP FUNCTION IF EXISTS public.replace_quote_package_showcase_items(uuid, text, jsonb);

CREATE OR REPLACE FUNCTION public.replace_quote_package_showcase_items(
  p_quote_id uuid,
  p_flyer_id uuid,
  p_kind text,
  p_items jsonb
) RETURNS void AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  IF p_kind NOT IN ('main_video', 'social_clip', 'photo') THEN
    RAISE EXCEPTION 'unknown kind';
  END IF;

  PERFORM 1 FROM quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown quote_id';
  END IF;

  PERFORM 1 FROM sales_flyers WHERE id = p_flyer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown flyer_id';
  END IF;

  DELETE FROM quote_package_showcase_items WHERE quote_id = p_quote_id AND flyer_id = p_flyer_id AND kind = p_kind;

  INSERT INTO quote_package_showcase_items (quote_id, flyer_id, kind, media_type, path, caption, order_index)
  SELECT p_quote_id, p_flyer_id, p_kind, item->>'media_type', item->>'path', item->>'caption', ord - 1
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(item, ord);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Del 2: 8 faste eksempelbilde-kolonner på sales_flyers (fast rutenett, ikke en liste)
ALTER TABLE sales_flyers ADD COLUMN example_image_1_path text;
ALTER TABLE sales_flyers ADD COLUMN example_image_2_path text;
ALTER TABLE sales_flyers ADD COLUMN example_image_3_path text;
ALTER TABLE sales_flyers ADD COLUMN example_image_4_path text;
ALTER TABLE sales_flyers ADD COLUMN example_image_5_path text;
ALTER TABLE sales_flyers ADD COLUMN example_image_6_path text;
ALTER TABLE sales_flyers ADD COLUMN example_image_7_path text;
ALTER TABLE sales_flyers ADD COLUMN example_image_8_path text;
```

- [ ] **Step 3: Legg til de 8 feltene på `SalesFlyer` i `lib/types.ts`**, og legg til `flyer_id: string` på `QuotePackageShowcaseItem`.

- [ ] **Step 4: Utvid `copyLibraryImageToFlyer`s `field`-parameter i `lib/actions/sales-flyers.ts`**

```ts
field: 'hero_poster' | 'bts_image_1' | 'bts_image_2' |
  'example_image_1' | 'example_image_2' | 'example_image_3' | 'example_image_4' |
  'example_image_5' | 'example_image_6' | 'example_image_7' | 'example_image_8'
```

- [ ] **Step 5: Test avbryt-sjekken — seed en rad, kjør migrasjonen, bekreft avbrudd**

Run: `psql "$DATABASE_URL" -c "INSERT INTO quote_package_showcase_items (quote_id, kind, media_type, path) SELECT id, 'photo', 'image', 'test-abort-guard' FROM quotes LIMIT 1;"`
Run: `npm run migrate:single -- supabase/migrations/194_flyer_showcase_scope_and_example_images.sql`
Expected: migrasjonen **feiler** med meldingen "...avbryter i stedet for å slette blindt...". Bekreft deretter med `psql "$DATABASE_URL" -c "\d quote_package_showcase_items"` at `flyer_id`-kolonnen **ikke** er lagt til.

- [ ] **Step 6: Fjern testraden, kjør migrasjonen på nytt, bekreft suksess**

Run: `psql "$DATABASE_URL" -c "DELETE FROM quote_package_showcase_items WHERE path = 'test-abort-guard';"`
Run: `npm run migrate:single -- supabase/migrations/194_flyer_showcase_scope_and_example_images.sql`
Expected: "✨ Migration completed successfully!"

- [ ] **Step 7: Bekreft skjemaet**

Run: `psql "$DATABASE_URL" -c "\d quote_package_showcase_items" && psql "$DATABASE_URL" -c "\d sales_flyers"`
Expected: `flyer_id`-kolonnen + ny indeks på første tabell; alle 8 `example_image_N_path`-kolonner på andre.

- [ ] **Step 8: `npx tsc --noEmit`**

Expected: clean (felt-union-utvidelsen er rent additiv, ingen kallere ennå).

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/194_flyer_showcase_scope_and_example_images.sql lib/types.ts lib/actions/sales-flyers.ts
git commit -m "feat: scope quote package showcase per flyer, add example image columns"
```

---

### Task 2: Tråd `flyerId` gjennom `lib/actions/quote-package-showcase.ts`

**Files:**
- Modify: `lib/actions/quote-package-showcase.ts` (alle 4 funksjonene)

**Interfaces:**
- Consumes: migrasjon 194s RPC `replace_quote_package_showcase_items(p_quote_id, p_flyer_id, p_kind, p_items)` og `flyer_id`-kolonnen (Task 1).
- Produces (brukt av Task 3): `copyLibraryImageToQuotePackage(flyerId, quoteId, imageId, kind)`; `copyLibraryVideoToQuotePackage(flyerId, quoteId, videoId, kind)`; `listQuotePackageShowcaseItems(flyerId, quoteId): Promise<QuotePackageShowcaseItem[]>`; `setQuotePackageShowcaseItems(flyerId, quoteId, kind, items): Promise<{ok:true}|{error:string}>`.

- [ ] **Step 1:** Legg til `flyerId: string` som nytt, første parameter på `copyLibraryImageToQuotePackage`; endre `destPath` til `` `quote-packages/${flyerId}/${quoteId}/${kind}-${Math.random().toString(36).substring(2)}.${ext}` ``.
- [ ] **Step 2:** Samme endring på `copyLibraryVideoToQuotePackage`.
- [ ] **Step 3:** Legg til `flyerId: string` som nytt, første parameter på `listQuotePackageShowcaseItems`; legg til `.eq('flyer_id', flyerId)` i tillegg til eksisterende `.eq('quote_id', quoteId)`.
- [ ] **Step 4:** Legg til `flyerId: string` som nytt, første parameter på `setQuotePackageShowcaseItems`; legg til `p_flyer_id: flyerId` i `.rpc(...)`-kallet.
- [ ] **Step 5: `npx tsc --noEmit`**

Expected: feil **kun** i `components/quote/PackageShowcasePanel.tsx` (de 4 kallstedene mangler nå det nye første argumentet) — fikses i Task 3. Ingen andre nye feil.

- [ ] **Step 6: Commit**

```bash
git add lib/actions/quote-package-showcase.ts
git commit -m "feat: scope quote package showcase actions per flyer"
```

---

### Task 3: Tråd `flyerId` gjennom `PackageShowcasePanel.tsx`

**Files:**
- Modify: `components/quote/PackageShowcasePanel.tsx`

**Interfaces:**
- Consumes: de 4 funksjonene fra Task 2 (nye `flyerId`-først-signaturer).
- Produces (brukt av Task 5): `<PackageShowcasePanel flyerId={string} quoteId={string} />`.

- [ ] **Step 1:** Legg til `flyerId: string` på `Props`-typen (sammen med eksisterende `quoteId: string`).
- [ ] **Step 2:** Oppdater `useEffect`-oppstarten til å kalle `listQuotePackageShowcaseItems(flyerId, quoteId)`, og legg `flyerId` til dependency-arrayen.
- [ ] **Step 3:** Oppdater `persistKind` til å kalle `setQuotePackageShowcaseItems(flyerId, quoteId, kind, payload)`.
- [ ] **Step 4:** Oppdater `handlePickedVideos`/`handlePickedImages` til å kalle `copyLibraryVideoToQuotePackage(flyerId, quoteId, id, kind)` / `copyLibraryImageToQuotePackage(flyerId, quoteId, id, kind)`, og sett `flyer_id: flyerId` på hvert lokalt konstruerte temp-`QuotePackageShowcaseItem` (typen krever nå feltet).
- [ ] **Step 5: `npx tsc --noEmit`**

Expected: nøyaktig én feil, i `app/admin/projects/[id]/quote/page.tsx` ved `<PackageShowcasePanel quoteId={activeQuote.id} />` ("Property 'flyerId' is missing") — fikses i Task 4.

- [ ] **Step 6: Commit**

```bash
git add components/quote/PackageShowcasePanel.tsx
git commit -m "feat: thread flyerId through PackageShowcasePanel"
```

---

### Task 4: Fjern gammel wiring fra `app/admin/projects/[id]/quote/page.tsx`

**Files:**
- Modify: `app/admin/projects/[id]/quote/page.tsx`

**Interfaces:** ingen nye.

- [ ] **Step 1:** Fjern importen `import { PackageShowcasePanel } from '@/components/quote/PackageShowcasePanel'` (linje 15 ved lesing — bekreft på nytt).
- [ ] **Step 2:** Fjern hele `<div style={{ marginTop: 16, ... }}>`-blokken med "Eksempelmedia for Se mer-visningen"-headingen og `<PackageShowcasePanel quoteId={activeQuote.id} />` (lest som linje 818-823) — la resten av `activeQuote.package_label ? (...)`-grenen (tittel, Dupliser/Fjern-knapper, `pkgError`) stå urørt.
- [ ] **Step 3: `npx tsc --noEmit`**

Expected: clean.

- [ ] **Step 4: Manuell verifikasjon**

Åpne et pakke-mal-tilbud i tilbudsbyggeren — bekreft at ingen "Eksempelmedia for Se mer-visningen"-heading eller panel vises noe sted på siden.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/projects/[id]/quote/page.tsx"
git commit -m "feat: remove package showcase panel from quote builder"
```

---

### Task 5: "Eksempelmedia"-knapp + modal pr. pakkekort i `SalesFlyerView.tsx` + rescoping av henting

**Files:**
- Modify: `lib/actions/sales-flyers.ts` (rename `getShowcaseItemsByQuoteId` → `getShowcaseItemsByFlyerAndQuoteId`, legg til `flyerId`-parameter + filter; oppdater kallstedet i `getOrderedPackages`)
- Modify: `components/sales-flyer/SalesFlyerView.tsx` — **les filen på nytt, direkte før redigering** (se Global Constraints: urelatert, pågående arbeid på "Tidligere arbeid"-case-kortene)

**Interfaces:**
- Consumes: `<PackageShowcasePanel flyerId quoteId />` (Task 3).
- Produces: ingen videre konsumert av Task 6 (uavhengig task).

- [ ] **Step 1:** I `lib/actions/sales-flyers.ts`, gi nytt navn til `getShowcaseItemsByQuoteId(quoteIds)` → `getShowcaseItemsByFlyerAndQuoteId(flyerId: string, quoteIds: string[])`; legg til `.eq('flyer_id', flyerId)` i tillegg til eksisterende `.in('quote_id', quoteIds)`.
- [ ] **Step 2:** Oppdater kallstedet i `getOrderedPackages` til `getShowcaseItemsByFlyerAndQuoteId(flyerId, packages.map(p => p.quote_id))` (`flyerId` er allerede funksjonens eget parameter).
- [ ] **Step 3:** Les `components/sales-flyer/SalesFlyerView.tsx` på nytt. Importer `PackageShowcasePanel` fra `@/components/quote/PackageShowcasePanel`.
- [ ] **Step 4:** Legg til state `const [showcaseEditorQuoteId, setShowcaseEditorQuoteId] = useState<string | null>(null)`.
- [ ] **Step 5:** Legg til `async function refreshPackagesAfterShowcaseEdit()` som henter på nytt via `getSalesFlyerBySlug(slug, { includeDraft: true })` og kaller `set('packages', fresh.packages)` ved suksess (samme mønster som `handleCasePickerSave`/`handlePackagePickerSave`). Kall den fra `function closeShowcaseEditor() { setShowcaseEditorQuoteId(null); refreshPackagesAfterShowcaseEdit() }`.
- [ ] **Step 6:** I `renderPackageCard`, inne i `editing &&`-blokken, legg til en knapp merket "Eksempelmedia" som kaller `setShowcaseEditorQuoteId(pkg.quote_id)` (plassert ved siden av "Se mer"-knappen, kun synlig i redigeringsmodus).
- [ ] **Step 7:** Rendre editor-overlayen én gang sammen med de andre modalene nederst i komponenten — **min avgjørelse** (spec flagget ingen eksakt fil): gjenbruk samme visuelle hvit-panel-konvensjon som det eksisterende "⚙ Innstillinger"-panelet (`background:'#fff', color:'#1A1812', border:'1px solid #ddd', borderRadius:10, boxShadow:'0 8px 30px rgba(0,0,0,0.4)'`), men som en fullskjerm-sentrert overlay (`position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:50` — **ikke** høyere enn 50, siden `PackageShowcasePanel`s egne interne `ImagePickerModal`/`VideoPickerModal` også bruker `z-50`/`z-index:50` og må kunne stable seg oppå via DOM-rekkefølge, ikke z-index): `isOpen={showcaseEditorQuoteId !== null}`, innhold `<PackageShowcasePanel flyerId={flyer.id} quoteId={showcaseEditorQuoteId!} />`, lukkeknapp kaller `closeShowcaseEditor()`.
- [ ] **Step 8: `npx tsc --noEmit`**

Expected: clean.

- [ ] **Step 9: Manuell verifikasjon (Review Focus: krysslekkasje + stale "Se mer")**

Opprett et pakke-mal-tilbud uten eksempelmedia, koble det til **to** forskjellige test-flyers A og B via "Velg pakker". Åpne "Eksempelmedia" på pakken i flyer A, legg til ett bilde; lukk — bekreft at "Se mer" dukker opp på kortet **umiddelbart**, uten sideoppfriskning. Gjør det samme i flyer B med et **annet** bilde. Last begge flyer-sidene på nytt og bekreft at A kun viser sitt eget bilde og B kun sitt — ingen sammenblanding. Åpne også "Eksempelmedia" og klikk "+ Legg til bilde" inni den — bekreft at bildevelgeren faktisk vises oppå editor-overlayen, ikke bak den.

- [ ] **Step 10: Commit**

```bash
git add lib/actions/sales-flyers.ts components/sales-flyer/SalesFlyerView.tsx
git commit -m "feat: move package showcase editing to the flyer, scoped per flyer"
```

---

### Task 6: Ny "Eksempelbilder"-seksjon (8 bilder) i `SalesFlyerView.tsx`

**Files:**
- Modify: `components/sales-flyer/SalesFlyerView.tsx` — **les filen på nytt, direkte før redigering**

**Interfaces:**
- Consumes: `copyLibraryImageToFlyer`s utvidede felt-union; `SalesFlyer.example_image_1_path`…`_8_path` (begge Task 1).
- Produces: ingen videre konsumert.

- [ ] **Step 1:** Les filen på nytt.
- [ ] **Step 2:** Utvid `imagePickerTarget`s type fra `'hero_poster' | 'bts_image_1' | 'bts_image_2' | null` til også å inkludere `'example_image_1' | 'example_image_2' | 'example_image_3' | 'example_image_4' | 'example_image_5' | 'example_image_6' | 'example_image_7' | 'example_image_8'`.
- [ ] **Step 3:** Generaliser `handleImagePicked`s felt-utledning fra den eksisterende 3-veis-ternæren til `` const field = `${target}_path` as Field `` — hvert mål (gammelt og nytt) følger nå eksakt `<target>_path`-navnekonvensjonen, så ternæren erstattes i stedet for å utvides til 11 grener.
- [ ] **Step 4:** Lag `renderExampleImageSlot(path: string | null, field: Field, target: ..., className: string)`, en speiling av den eksisterende BTS-bilde-slot-blokken: vanlig `<img>` når `path` er satt; når **ikke** redigering og `path` er `null`, render ingenting (ikke en plassholder — Review Focus); i redigering, vis "Ingen bilde ennå"-teksten + "Velg bilde"-knappen (+ `FieldError`) akkurat som BTS gjør.
- [ ] **Step 5:** Beregn `const exampleImagePaths = [1,2,3,4,5,6,7,8].map(n => flyer[`example_image_${n}_path` as Field] as string | null)` og `const hasAnyExampleImage = exampleImagePaths.some(Boolean)`.
- [ ] **Step 6:** Sett inn en ny `<section>` mellom "Tidligere arbeid"-seksjonens avsluttende `)}` og "Pakker"-seksjonens åpning, gated på `{(hasAnyExampleImage || editing) && (...)}`, med samme gull-skillelinje-header som "Tidligere arbeid"/"Pakker" (`<span className="h-px w-12" style={{ background: GOLD }} /><p ...>Eksempelbilder</p>`), deretter mobil (vertikal stabling, 8× `h-[400px]`) og desktop-layout (`700 / 800+400+400 / 800+400+400 / 600`, midt-blokken gjentatt én gang til som spec beskriver), hver slot rendret via `renderExampleImageSlot` med `field`/`target` = `example_image_${n}` for `n` 1-8.
- [ ] **Step 7: `npx tsc --noEmit`**

Expected: clean.

- [ ] **Step 8: Manuell verifikasjon (spec Verifikasjon, + Review Focus: riktig grid-posisjon og tomme slots)**

I redigeringsmodus, bruk de 8 "Velg bilde"-knappene med **8 visuelt distinkte** bilder — bekreft at hvert bilde lander i sin tiltenkte posisjon (hero / venstre-tårn-1 / høyre-topp-1 / høyre-bunn-1 / venstre-tårn-2 / høyre-topp-2 / høyre-bunn-2 / bunn). Last siden som anonym (ikke-staff) besøkende — bekreft riktig asymmetrisk desktop-rutenett og vertikal stabling på mobil (smal viewport). Fjern ett bilde (sett tilbake til tomt) — bekreft at redigeringsmodus fortsatt viser de resterende 7 pluss én tom plassholder-slot, og at en anonym besøkende ser den nå-tomme slotten som blank (ingen ødelagt bilde, ingen plassholdertekst) mens de andre 7 fortsatt vises. Fjern alle 8 — bekreft at hele seksjonen forsvinner for en anonym besøkende, men fortsatt vises (med 8 tomme plassholdere) i redigeringsmodus.

- [ ] **Step 9: Commit**

```bash
git add components/sales-flyer/SalesFlyerView.tsx
git commit -m "feat: add Eksempelbilder section to sales flyer"
```

---

### Task 7: Ende-til-ende-verifikasjon

**Files:** ingen — kun verifikasjon.

- [ ] **Step 1: Full `npx tsc --noEmit` på hele grenen**

Expected: clean.

- [ ] **Step 2: Migrasjonsnummer-kollisjonssjekk**

Run: `ls supabase/migrations | tail -5 && git status --short`
Expected: `194_...` committed, ingen gap/renummerering.

- [ ] **Step 3:** Re-bekreft Task 4s manuelle sjekk fortsatt holder (ingen spor av det gamle panelet i tilbudsbyggeren) etter alle senere endringer.
- [ ] **Step 4:** Re-kjør hele to-flyers-isolasjonssjekken fra Task 5 én gang til, ende-til-ende (samme pakke, to flyers, forskjellig eksempelmedia på hver), for å bekrefte at ingenting regredierte etter Task 6s endringer i samme fil.
- [ ] **Step 5: Bibliotek-sletting-sikkerhet**

I `/admin/images`, slett et biblioteksbilde som er brukt både som kilde for et pakke-eksempelmedia-element og som en av de 8 eksempelbildene. Last den aktuelle flyeren på nytt — bekreft at begge fortsatt vises uendret (kopi, ikke referanse).

- [ ] **Step 6:** Gå gjennom spec'ens egen "Verifikasjon"-seksjon punkt for punkt én gang til på én test-flyer, og noter alt som har regrediert.
- [ ] **Step 7: Commit** (kun hvis Step 6 avdekket fikser)
