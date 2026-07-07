# Intern signering av kontrakter (Leafilms-side)

## Bakgrunn

I dag signerer kun kunden kontrakten, via signaturcanvas på den offentlige pitch-siden (`app/p/[token]/ContractSigningSection.tsx` → `app/api/contracts/sign/route.ts`). "Vår side" av avtalen er bare et trykt navn hardkodet i den globale kontraktmalen (f.eks. "Eivind Lea\nLEAFILMS") — ingen faktisk signatur, og ingen kobling til hvem i teamet som faktisk sto for avtalen.

Målet: den som publiserer kontrakten til kunden skal signere den for Leafilms i samme steg, med en gjenbrukbar lagret signatur, slik at kunden ser en allerede signert avtale fra vår side når de åpner den.

## Endringer

### 1. Datamodell

Ny migrasjon `supabase/migrations/086_internal_contract_signature.sql`:

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS signature_image TEXT;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS our_signature JSONB;
```

- `profiles.signature_image` — base64 PNG (samme format som kundens signaturcanvas i dag), én lagret signatur per teammedlem. Tegnes og lagres automatisk første gang vedkommende signerer en kontrakt (se del 2) — ingen egen innstillingsside.
- `contracts.our_signature` — satt én gang når kontrakten først signeres internt:
  ```ts
  type OurSignature = {
    profileId: string
    signerName: string
    signatureImage: string   // base64 PNG, kopi tatt på signeringstidspunktet
    signedAt: string          // ISO-dato
  }
  ```
  Denormalisert kopi av navn/bilde lagres på kontrakten (ikke bare en referanse til `profiles`) slik at en senere endring av ens lagrede signatur ikke endrer allerede signerte kontrakter.
- `our_signature` bevares ved senere redigering/republisering/avpublisering av kontrakten — man signerer ikke på nytt for hver tekstjustering, kun første gang.

### 2. Publiseringsflyt (admin)

Når **"Publiser kontrakt til kunde"** / **"Oppdater kontrakt"** trykkes på `app/admin/projects/[id]/page.tsx`:

- **Hvis `contract.our_signature` allerede finnes:** publiseringen skjer som i dag, uendret — ingen ny modal.
- **Hvis den ikke finnes ennå** (første gang, eller en eldre kontrakt publisert før denne funksjonen fantes): en bekreftelsesmodal **"Bekreft signering"** åpnes før selve publiseringen kjøres:
  - **Har innlogget bruker (`profiles.signature_image`) en lagret signatur:** modalen viser signaturbildet + navn, med en lenke **"Ikke deg? Tegn på nytt →"** som bytter til tegne-kanvas ved behov.
  - **Har brukeren ingen lagret signatur ennå:** modalen viser tegne-kanvas direkte (gjenbruker samme tegnelogikk som `ContractSigningSection.tsx` — canvas, strek, tøm-knapp), med en forhåndshuket avkrysningsboks **"Lagre til neste gang"**.
  - Knapp **"Signer og publiser"**: lagrer signaturbildet på `profiles.signature_image` (hvis huket av / hvis det ikke fantes en lagret fra før og brukeren tegnet en ny), setter `contracts.our_signature` til gjeldende bruker + tegnet/lagret bilde + tidspunkt, og fortsetter deretter med eksisterende publiserings-logikk (`publishContract`).
- Signaturen er alltid den innloggede brukerens egen — ingen mulighet til å velge en kollega å signere på vegne av.

### 3. Visning for kunden og PDF

- **`ContractSigningSection.tsx`:** en ny fast rad øverst i kontrakt-boksen, over avtaleteksten: **"✓ Signert av {signerName} for Leafilms · {signedAt, formatert}"** med signaturbildet ved siden av. Vises så snart kontrakten er publisert (dvs. `our_signature` finnes), uavhengig av om kunden selv har signert ennå.
- Kundens egen signeringsflyt er uendret.
- **`app/api/contracts/sign/route.ts`** (PDF-generering ved fullført kundesignering): PDF-en inkluderer nå **begge** signaturbildene — vår (`contract.our_signature.signatureImage`) og kundens (`signatureImage` fra request) — i signeringsseksjonen, i stedet for bare kundens som i dag.
- Ingen endring i selve kontraktmalen/malteksten (den trykte navnelinjen i malen står som den er) — signaturblokken er et eget visuelt element, ikke noe som limes inn i brødteksten.

### 4. Berørte filer

- `supabase/migrations/086_internal_contract_signature.sql` (ny)
- `lib/types.ts` — `Contract.our_signature` + `OurSignature`-type (det finnes ingen delt `Profile`-type i dag — profiler brukes som inline object-typer der de trengs, så `signature_image` legges kun til i de spesifikke spørringene/retur-typene som trenger det)
- `lib/actions/contracts.ts` — `getProjectContractData` returnerer `ourSignature` + gjeldende brukers `signatureImage` (fra `profiles`); ny funksjon `signContractInternally(projectId, signatureImage, saveToProfile: boolean)` som setter `profiles.signature_image` (hvis valgt) og `contracts.our_signature`, kalt før `publishContract` i UI-flyten
- `app/admin/projects/[id]/page.tsx` — "Bekreft signering"-modal (gjenbrukbar tegne-kanvas-komponent), wiring til publiser/oppdater-knappene
- `app/p/[token]/ContractSigningSection.tsx` — ny signatur-status-rad
- `app/api/contracts/sign/route.ts` — PDF med begge signaturer

En liten, gjenbrukbar `SignatureCanvas`-komponent trekkes ut (brukes både av kundens signering og den nye interne signerings-modalen) for å unngå å duplisere tegnelogikken som i dag ligger inline i `ContractSigningSection.tsx`.

## Utenfor scope

- Ingen egen "min signatur"-innstillingsside — signatur settes opp inline første gang man publiserer.
- Ingen mulighet til å signere på vegne av en kollega — alltid innlogget brukers egen signatur.
- Ingen endring i selve kontraktmal-teksten eller malredigeringssiden.
- Ingen re-signering kreves ved republisering/oppdatering av en allerede internt signert kontrakt.
