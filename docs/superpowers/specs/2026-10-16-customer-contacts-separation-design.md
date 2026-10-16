# Kunde/kontaktperson-separasjon — design

## Bakgrunn

`customers`-tabellen ble opprinnelig modellert som "én kontaktperson som representerer et firma" — `name`, `email`, `phone` og `company` ligger flatt på samme rad. `customer_contacts` ble lagt til i migrasjon 117 for å støtte flere kontaktpersoner per kunde (bygget for board/schedule-funksjonen), men resten av appen (prosjektopprettelse, tilbud, kontrakter, fakturering) leser/skriver fortsatt de gamle inline-feltene direkte på `customers`. Resultat: to parallelle, inkonsistent brukte kontaktbegreper, og ingen samlet "hvem er hovedkontakt hos denne kunden".

Dagens feltbruk er dessuten motsatt av det man ville forvente: `name` er et obligatorisk felt vist som hovedoverskrift og representerer i praksis *personen*, mens `company` er valgfritt og vises som undertekst.

Videre: `ProjectForm.tsx` oppretter nye kunder direkte og skriver aldri til `customer_contacts`, så kunder opprettet etter migrasjon 117 kan mangle en kontaktperson-rad helt.

## Mål

- `customers` representerer kun **kontoen** (firma, eller privatkunde uten firma).
- All personspesifikk kontaktinfo (navn, e-post, telefon, rolle) ligger i `customer_contacts`.
- Man velger hvilken kontaktperson som er **hovedkontakt** (`is_primary`), og nøyaktig én hovedkontakt per kunde er garantert.
- Alle steder i appen som i dag leser kundens kontaktinfo direkte, oppdateres til å bruke hovedkontakten.

## Ikke-mål

- Ingen ny UI for å velge en *annen* kontakt enn hovedkontakten i tilbud/kontrakt/faktura (kun boards har det i dag, via `BoardContacts`/`customer_contact_id`, og det berøres ikke).
- Ingen endring i `customer_contacts`-skjemaet (id, customer_id, name, email, phone, role, is_primary finnes allerede).

## Datamodell

**`customers`** (migrasjon `172_customer_account_only.sql`):
- Behold: `id`, `name` (blir kontonavnet — se backfill), `customer_number`, `org_nummer`, `address`, `notes`, `invoice_email`, `invoice_reference`, `invoice_info_skipped`, `invoice_info_confirmed_at`, `logo_path`, `created_at`, `updated_at`.
- Fjern: `email`, `phone`, `company`.

**`customer_contacts`**: ingen skjemaendring. Nøyaktig én `is_primary = true` per `customer_id` garanteres av en ny trigger (se under), ikke av en unique constraint (siden en rad kan være midlertidig uten primærkontakt rett etter opprettelse).

## Migrasjon/backfill (i `172_customer_account_only.sql`)

Kjøres i denne rekkefølgen, i samme migrasjon:

1. **Backfill manglende kontakter:** for hver `customers`-rad uten noen `customer_contacts`-rad, opprett én med `name`/`email`/`phone` fra `customers` og `is_primary = true`. Dette fanger opp kunder opprettet via `ProjectForm.tsx` siden migrasjon 117.
2. **Rett kontonavn:** `UPDATE customers SET name = company WHERE company IS NOT NULL AND company != ''`. Kunder uten firma beholder det eksisterende (person-)navnet som kontonavn — det er allerede riktig for en privatkunde.
3. **Primærkontakt-trigger:** `BEFORE INSERT OR UPDATE ON customer_contacts` — når `NEW.is_primary = true`, sett `is_primary = false` på alle andre rader med samme `customer_id`. Garanterer invarianten uansett hvor endringen skjer (admin-UI, server action), på samme måte som varseltriggerne i prosjektet allerede fungerer.
4. **Drop kolonner:** `email`, `phone`, `company` fjernes fra `customers`.

## Kodeendringer

- **`lib/types.ts`**: `Customer`-typen mister `email`, `phone`, `company`.
- **`app/admin/customers/new/page.tsx`** og **`app/admin/customers/[id]/edit/page.tsx`**: formen blir ren konto-form (navn, org.nr, adresse, notater, fakturafelt). Kontaktpersoner redigeres i en egen liste under (samme UI-mønster som `BoardContacts.tsx`), med en "Sett som hovedkontakt"-knapp per kontakt.
- **`app/admin/customers/[id]/page.tsx`**: vis hovedkontakten tydelig (badge "Hovedkontakt") i kontaktlisten.
- **`app/admin/projects/new/ProjectForm.tsx`**: når en ny kunde opprettes inline, opprett også én `customer_contacts`-rad (`is_primary = true`) fra de samme skjemafeltene, i stedet for å skrive kontaktinfo på `customers`.
- **Tilbud/kontrakt/faktura** (`components/quote/QuoteBuilder.tsx`, `components/sections/QuoteSection.tsx`, `app/admin/contracts/page.tsx`, `app/admin/faktura/[id]/page.tsx`, og ev. andre steder som leser `customer.email`/`customer.phone`): bytt til å hente kundens hovedkontakt via join mot `customer_contacts` (`is_primary = true`) for navn/e-post/telefon som skal vises eller brukes ved utsendelse.
- **`components/boards/BoardContacts.tsx`**: ingen skjemaendring nødvendig (bruker allerede `customer_contacts`), men default-valget i kontaktvelgeren bør være hovedkontakten der ingen er valgt ennå.

## Testing

- Verifiser migrasjonen mot en kopi av faktisk data (eller lokalt) før kjøring mot prod: sjekk at ingen kunde ender uten nøyaktig én `is_primary`-kontakt, og at ingen `company`-verdier går tapt (stikkprøve før/etter).
- Manuell test: opprette ny kunde med kontaktperson via `ProjectForm.tsx`, sette en annen kontakt som hovedkontakt via admin-UI og bekrefte at den forrige automatisk blir `is_primary = false`, og at tilbud/kontrakt/faktura viser riktig hovedkontakt.
