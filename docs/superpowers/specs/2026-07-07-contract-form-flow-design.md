# Kontrakt-flyt: skjemabasert generering

## Bakgrunn

I dag genereres kontraktteksten ved å slå sammen en global mal (`contract_templates`, med `{{variabel}}`-plassholdere) med prosjekt-/tilbudsdata, og admin ser resultatet som én sammenhengende tekstblokk i en stor textarea (`app/admin/projects/[id]/page.tsx`, rundt linje 1383). Noen variabler fylles allerede automatisk fra prosjekt og gjeldende tilbudsversjon:

- `bedrift`, `kunde_kontakt` — fra `customers`
- `oppstart_dato`, `opptak_datoer` — fra `projects.shoot_start`/`shoot_end`
- `leveranse` — fra `projects.delivery_description` (synkronisert fra tilbudsbyggeren)
- `totalpris` — fra gjeldende tilbudsversjon (`quotes` der `is_current = true`)

Tre variabler er alltid tomme og må fylles inn manuelt ved å lete dem opp inni brødteksten:

- `org_nummer`
- `produksjons_periode`
- `signerings_sted` (hardkodet default `'Asker'` i koden, ikke synlig som eget felt)
- `signerings_dato` (default dagens dato, heller ikke synlig som eget felt)

Målet er å erstatte "let opp og skriv inn i brødteksten"-steget med et lite skjema som genererer hele kontrakten, uten å fjerne muligheten til å finpusse ordlyden i etterkant.

## Endringer

### 1. Datamodell

Ny migrasjon `supabase/migrations/085_contract_form_fields.sql`:

```sql
ALTER TABLE customers ADD COLUMN IF NOT EXISTS org_nummer TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS form_fields JSONB;
```

- `customers.org_nummer` — satt én gang per kunde, gjenbrukes automatisk i alle fremtidige kontrakter for kunden.
- `contracts.form_fields` — lagrer de kontrakt-spesifikke skjemaverdiene (se under) slik at skjemaet kan åpnes igjen senere og kontrakten regenereres. Skjema (alle valgfrie, brukes kun til å huske forrige skjemautfylling):
  ```ts
  type ContractFormFields = {
    orgNummerOverride?: string   // overstyrer customers.org_nummer for denne kontrakten
    produksjonsPeriode?: string
    signeringsSted?: string
    signeringsDato?: string      // ISO-dato
  }
  ```

### 2. Kundekort — org.nummer

- `Customer`-typen i `lib/types.ts` får `org_nummer: string | null`.
- `app/admin/customers/new/page.tsx` og `app/admin/customers/[id]/edit/page.tsx` får et nytt tekstfelt "Org.nummer", plassert ved siden av kundenummer, med samme mønster som `company`/`phone`/`address`.

### 3. Kontraktskjema

Nytt skjema som vises i stedet for fritekst-editoren når det ikke finnes en generert kontrakttekst ennå, og som kan åpnes igjen senere via en "Rediger felt →"-lenke over fritekst-editoren.

Feltene:

| Felt | Kilde / default | Type | Redigerbar |
|---|---|---|---|
| Bedrift, kundekontakt | `customers.name`/`company` | Visning (read-only) | Nei |
| Oppstartsdato, opptaksdatoer | `projects.shoot_start`/`shoot_end` | Visning (read-only) | Nei |
| Leveranse | `projects.delivery_description` | Visning (read-only) | Nei |
| Totalpris | Gjeldende tilbudsversjon (`quotes.is_current`) | Visning (read-only) | Nei |
| Org.nummer | `customers.org_nummer`, fallback tomt | Tekstfelt | Ja (overstyrer kun denne kontrakten, skriver ikke tilbake til kundekortet) |
| Produksjonsperiode | Forslag utledet fra opptaksdatoer (norsk måned + år; "juli 2026" hvis start/slutt samme måned, ellers "juli–august 2026") | Tekstfelt | Ja |
| Signeringssted | Default `"Asker"` | Tekstfelt | Ja |
| Signeringsdato | Default dagens dato | Datovelger | Ja |

De fire øverste radene er ren informasjon (kommer allerede riktig fra prosjekt/tilbud) — ikke inputs. Kun de fire nederste er skjemafelt.

Ved åpning av skjemaet: hvis `contracts.form_fields` finnes fra før, forhåndsutfylles skjemaet derfra (org.nummer-override, produksjonsperiode, sted, dato). Hvis ikke, brukes de utledede default-verdiene over.

### 4. Generer / regenerer-flyt

- **Ingen kontrakttekst lagret ennå:** Skjemaet vises. Knapp **"Generer kontrakt"** kjører `fillTemplate(template, vars)` lokalt (samme funksjon som i dag, nå med skjemaverdiene i stedet for tomme strenger for de fire variablene) og bytter visningen til fritekst-editoren, forhåndsutfylt med hele kontraktteksten.
- **Kontrakttekst finnes (utkast eller publisert):** Fritekst-editoren vises som i dag. En ny lenke **"Rediger felt →"** over editoren åpner skjemaet igjen. Knapp **"Regenerer kontrakt"** i skjemaet bygger teksten på nytt fra mal + gjeldende feltverdier og erstatter innholdet i fritekst-editoren — med en tydelig advarsel (`confirm()`) om at dette overskriver eventuelle manuelle tekstendringer som ikke er publisert.
- **Lagring uendret fra i dag:** Ingenting skrives til databasen før admin trykker **"Publiser/Oppdater kontrakt"**. Da lagres `contract_text` og `form_fields` sammen i samme `insert`/`update`-kall i `publishContract`. Generer/regenerer er en ren lokal (klient-side) handling inntil publisering, akkurat som dagens fritekst-utkast heller ikke lagres før publisering.

### 5. Berørte filer

- `supabase/migrations/085_contract_form_fields.sql` (ny)
- `lib/types.ts` — `Customer.org_nummer`, ny `ContractFormFields`-type
- `lib/actions/contracts.ts` — `getProjectContractData` returnerer også `formFields` og utledede default-forslag; `publishContract` tar imot og lagrer `form_fields`; ny hjelpefunksjon for å utlede produksjonsperiode-forslag fra opptaksdatoer
- `app/admin/customers/new/page.tsx`, `app/admin/customers/[id]/edit/page.tsx` — org.nummer-felt
- `app/admin/projects/[id]/page.tsx` — nytt kontraktskjema-steg, "Rediger felt →"-lenke, "Generer"/"Regenerer"-knapper, tilpasset visning rundt eksisterende fritekst-editor

## Utenfor scope

- Ingen endring i selve malen (`contract_templates`) eller malredigeringssiden.
- Ingen endring i signerings-flyten (`ContractSigningSection.tsx`, `app/api/contracts/sign`).
- Ingen autolagring av utkast før publisering (samme begrensning som i dag).
- Ingen støtte for flere kontraktmaler — fortsatt én global mal.
