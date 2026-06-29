# Design: Håndtegnet signatur på kontrakt

**Dato:** 2026-06-29
**Status:** Godkjent

## Oversikt

Kunder skal kunne signere produksjonsavtalen ved å tegne signaturen sin med mus eller trackpad direkte i pitchen (`/p/[token]`). Signaturen lagres, genererer en PDF av kontrakten, og PDF-en sendes til begge parter og lagres slik at Leafilms enkelt kan åpne den i admin.

## Scope

- Legge til tegnecanvas i `ContractSigningSection.tsx`
- Sende signaturbildet til API og lagre i `signature_data` JSONB
- Generere PDF server-side med pdfkit
- Laste opp PDF til Supabase Storage
- Lagre PDF-URL på `contracts`-raden
- Sende PDF som e-postvedlegg via Resend
- Vise "Åpne signert kontrakt →"-lenke i admin

## Frontend — ContractSigningSection.tsx

### Tegnecanvas
- `<canvas>`-element plassert mellom avkrysningsboksen og "Signer"-knappen
- Støtter både mus (`mousedown`, `mousemove`, `mouseup`) og touch (`touchstart`, `touchmove`, `touchend`)
- Hvit strek på mørk bakgrunn, konsistent med den cinematiske paletten på `/p/*`-sider
- "Tøm"-knapp øverst til høyre i canvas-rammen for å nullstille og tegne på nytt
- Label over canvas: "Signatur" med samme stil som eksisterende felt-labels

### Validering
`canSubmit` krever at **alle fire** betingelser er oppfylt:
1. `name.trim() !== ''`
2. `email.trim() !== ''`
3. `accepted === true`
4. `hasSigned === true` — settes til `true` første gang brukeren løfter pennen etter å ha tegnet

### Innsending
Når brukeren klikker "Signer":
- `canvas.toDataURL('image/png')` eksporterer signaturen som base64 PNG
- Feltet `signatureImage` legges til i POST-body til `/api/contracts/sign`
- Avkrysningsboksen og canvas deaktiveres mens signering pågår

## API — /api/contracts/sign

### Mottak og validering
- `signatureImage` legges til i listen over påkrevde felt
- Validering: strengen må starte med `data:image/png;base64,` og ha minimumslengde (forhindrer tom canvas)

### Lagring av signaturdata
`signature_data` JSONB-kolonnen (allerede eksisterende) utvides med:
```json
{
  "signerName": "...",
  "signerEmail": "...",
  "signedAt": "...",
  "contractSnapshot": "...",
  "ip": "...",
  "signatureImage": "data:image/png;base64,..."
}
```

### PDF-generering med pdfkit
Genereres i minnet (ingen disk-skriving). Struktur:

1. **Tittel:** "Produksjonsavtale" — stor skrift
2. **Kontrakttekst:** `contractSnapshot` som løpende tekst, monospace font
3. **Signeringsseksjon nederst:**
   - Horisontal linje
   - "Signert av: [navn] ([e-post])"
   - "Dato: [formatert norsk dato og tid]"
   - "IP: [ip]"
   - Signaturbilde embedded fra base64-buffer

### Supabase Storage upload
- Bucket: `contracts` (opprettes med migrasjon)
- Filnavn: `{contractId}-{timestamp}.pdf`
- Lastes opp med service client
- Returnerer public URL som lagres i `pdf_url`-kolonnen på `contracts`-raden

### E-post via Resend
Begge eksisterende e-poster (kunde + Leafilms) får PDF-en lagt til som vedlegg:
```json
{
  "attachments": [{
    "filename": "Produksjonsavtale-[prosjektnavn].pdf",
    "content": "<base64-encoded PDF>"
  }]
}
```

## Database

### Migrasjon 076_contract_pdf_url.sql
```sql
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS pdf_url TEXT;
```

### Storage bucket
Bucketen settes til `public: true` — filnavn er `{contractId}-{timestamp}.pdf` (UUID-basert, praktisk umulig å gjette), noe som gjør at admin kan åpne PDF direkte i ny nettleserfane uten autentisering.

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('contracts', 'contracts', true);

CREATE POLICY "Service role can insert contracts"
  ON storage.objects FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'contracts');
```

## Admin — /admin/projects/[id]?tab=kontrakt

I kontrakts-fanen, under eksisterende signaturinfo (navn, e-post, dato), legges det til:

```
Åpne signert kontrakt →   (lenke, åpner i ny fane)
```

- Hentes fra `contractData.pdfUrl` via eksisterende `getProjectContractData`-action (utvides til å returnere `pdf_url`)
- Vises kun hvis `pdf_url` er satt (ikke alle eldre kontrakter har PDF)
- Stil: diskret lenke i gull (`#C49434`) konsistent med admin-temaet

## Filer som endres

| Fil | Endring |
|-----|---------|
| `app/p/[token]/ContractSigningSection.tsx` | Legg til canvas-komponent og `signatureImage` i submit |
| `app/api/contracts/sign/route.ts` | Motta signaturbildet, generer PDF, upload til Storage, lagre URL |
| `lib/actions/contracts.ts` | Returner `pdf_url` fra `getProjectContractData` |
| `app/admin/projects/[id]/page.tsx` | Vis "Åpne signert kontrakt →"-lenke |
| `supabase/migrations/076_contract_pdf_url.sql` | Ny `pdf_url TEXT`-kolonne + Storage bucket + RLS |

## Ikke i scope

- Ingen innebygd PDF-visning i admin (åpnes i ny fane)
- Ingen re-generering av PDF for eldre signerte kontrakter
- Ingen avansert PDF-styling/branding
