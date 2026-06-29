# Contract Signature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Legg til håndtegnet signatur (canvas) på kontraktsiden i pitchen, generer en PDF med signaturen, last opp til Supabase Storage, og vis lenke i admin.

**Architecture:** Kunden tegner signaturen i en `<canvas>` i `ContractSigningSection.tsx`. Canvas-bildet eksporteres som base64 PNG og sendes til `/api/contracts/sign`. API-et genererer en PDF med pdfkit i minnet, laster den opp til Supabase Storage (`contracts`-bucket), lagrer public URL i `contracts.pdf_url`, og sender PDF som e-postvedlegg via Resend. Admin-fanen viser en "Åpne signert kontrakt →"-lenke.

**Tech Stack:** Next.js 16 App Router, pdfkit (allerede installert), Supabase Storage, Resend, TypeScript

## Global Constraints

- Cinematisk mørk palett på `/p/*`-sider: bakgrunn `#0D0D12`, gull `#C49434`, tekst `#E8E1D5`
- Admin-palett: `#181920` bg, `#7C5CFC` accent, `#4CAF7D` success
- DM Sans for brødtekst, Cormorant Garamond for headings (begge via `var(--font-*)`)
- Ingen nye npm-pakker
- Migrasjoner nummereres fra `076_`
- Supabase service client brukes i API-routes (`createServiceClient` fra `@/lib/supabase-server`)
- Autentisert Supabase client brukes i server actions (`createClient` fra `@/lib/supabase-server`)

---

## Filkart

| Fil | Handling | Ansvar |
|-----|----------|--------|
| `supabase/migrations/076_contract_pdf_url.sql` | Opprett | `pdf_url TEXT`-kolonne + `contracts` storage bucket + RLS |
| `app/p/[token]/ContractSigningSection.tsx` | Modifiser | Canvas-komponent, `hasSigned`-state, `signatureImage` i submit |
| `app/api/contracts/sign/route.ts` | Modifiser | Valider `signatureImage`, generer PDF, upload Storage, lagre URL, vedlegg i e-post |
| `lib/actions/contracts.ts` | Modifiser | Returner `pdfUrl` fra `getProjectContractData` |
| `app/admin/projects/[id]/page.tsx` | Modifiser | `contractPdfUrl`-state + "Åpne signert kontrakt →"-lenke |

---

## Task 1: Database-migrasjon og Storage-bucket

**Files:**
- Create: `supabase/migrations/076_contract_pdf_url.sql`

**Interfaces:**
- Produces: `contracts.pdf_url TEXT` kolonne, public `contracts`-bucket i Supabase Storage

- [ ] **Steg 1: Opprett migrasjonsfil**

Opprett `supabase/migrations/076_contract_pdf_url.sql` med innhold:

```sql
-- Legg til pdf_url-kolonne på contracts-tabellen
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- Opprett public storage-bucket for signerte kontrakt-PDFer
INSERT INTO storage.buckets (id, name, public)
VALUES ('contracts', 'contracts', true)
ON CONFLICT (id) DO NOTHING;

-- Kun service role kan laste opp filer
CREATE POLICY "Service role can insert contract PDFs"
  ON storage.objects FOR INSERT TO service_role
  WITH CHECK (bucket_id = 'contracts');

-- Alle kan lese (public bucket med UUID-baserte filnavn)
CREATE POLICY "Public can read contract PDFs"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'contracts');
```

- [ ] **Steg 2: Kjør migrasjon mot Supabase**

```bash
cd leafilms-pitch
npx supabase db push
```

Forventet output: migrasjon `076_contract_pdf_url` kjørt uten feil.

- [ ] **Steg 3: Verifiser i Supabase Studio**

Åpne Supabase Studio → Table Editor → `contracts`. Bekreft at kolonnen `pdf_url` er synlig. Gå til Storage → bekreft at `contracts`-bucketen eksisterer og er markert som public.

- [ ] **Steg 4: Commit**

```bash
git add supabase/migrations/076_contract_pdf_url.sql
git commit -m "feat: add pdf_url column to contracts and contracts storage bucket"
```

---

## Task 2: Tegnecanvas i ContractSigningSection

**Files:**
- Modify: `app/p/[token]/ContractSigningSection.tsx`

**Interfaces:**
- Consumes: ingenting nytt — endrer eksisterende komponent
- Produces: `signatureImage: string` (base64 PNG) sendt i POST-body til `/api/contracts/sign`

- [ ] **Steg 1: Legg til canvas-state og refs**

I `ContractSigningSection.tsx`, legg til disse imports og state-variabler øverst i komponenten (etter eksisterende `useState`-imports):

```tsx
import { useRef, useEffect, useCallback } from 'react'
```

Legg til i komponentens state-deklarasjoner (etter `const [error, setError] = useState<string | null>(null)`):

```tsx
const canvasRef = useRef<HTMLCanvasElement>(null)
const isDrawing = useRef(false)
const [hasSigned, setHasSigned] = useState(false)
```

- [ ] **Steg 2: Implementer tegne-logikk**

Legg til disse funksjonene inne i komponenten, etter state-deklarasjonene:

```tsx
const getCanvasPos = useCallback((e: MouseEvent | Touch, canvas: HTMLCanvasElement) => {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const scaleY = canvas.height / rect.height
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  }
}, [])

const startDrawing = useCallback((x: number, y: number) => {
  const canvas = canvasRef.current
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  isDrawing.current = true
  ctx.beginPath()
  ctx.moveTo(x, y)
}, [])

const draw = useCallback((x: number, y: number) => {
  if (!isDrawing.current) return
  const canvas = canvasRef.current
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.lineTo(x, y)
  ctx.stroke()
  setHasSigned(true)
}, [])

const stopDrawing = useCallback(() => {
  isDrawing.current = false
}, [])

const clearCanvas = useCallback(() => {
  const canvas = canvasRef.current
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  setHasSigned(false)
}, [])
```

- [ ] **Steg 3: Sett opp canvas-kontekst med useEffect**

Legg til etter funksjonene:

```tsx
useEffect(() => {
  const canvas = canvasRef.current
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.strokeStyle = '#E8E1D5'
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
}, [])
```

- [ ] **Steg 4: Oppdater canSubmit**

Bytt ut eksisterende `canSubmit`-linje:

```tsx
// Gammel:
const canSubmit = name.trim() !== '' && email.trim() !== '' && accepted && !signing

// Ny:
const canSubmit = name.trim() !== '' && email.trim() !== '' && accepted && hasSigned && !signing
```

- [ ] **Steg 5: Oppdater handleSign til å inkludere signaturbildet**

Bytt ut `body: JSON.stringify({...})` i `handleSign`:

```tsx
// Gammel:
body: JSON.stringify({
  projectId,
  signerName: name,
  signerEmail: email,
  contractSnapshot: contractText,
}),

// Ny:
body: JSON.stringify({
  projectId,
  signerName: name,
  signerEmail: email,
  contractSnapshot: contractText,
  signatureImage: canvasRef.current?.toDataURL('image/png') ?? '',
}),
```

- [ ] **Steg 6: Legg til canvas-JSX i render**

Legg til følgende blokk i `return`-JSX, mellom `</label>` (avkrysningsboksen) og `{/* Error */}`:

```tsx
{/* Signaturcanvas */}
<div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <label
      style={{
        fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
        fontSize: '0.75rem',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: 'rgba(232,225,213,0.5)',
      }}
    >
      Signatur
    </label>
    <button
      type="button"
      onClick={clearCanvas}
      style={{
        background: 'none',
        border: 'none',
        fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
        fontSize: '0.7rem',
        color: 'rgba(232,225,213,0.35)',
        cursor: 'pointer',
        padding: '2px 4px',
        letterSpacing: '0.05em',
      }}
    >
      Tøm
    </button>
  </div>
  <canvas
    ref={canvasRef}
    width={700}
    height={160}
    onMouseDown={e => {
      const canvas = canvasRef.current
      if (!canvas) return
      const pos = getCanvasPos(e.nativeEvent, canvas)
      startDrawing(pos.x, pos.y)
    }}
    onMouseMove={e => {
      const canvas = canvasRef.current
      if (!canvas) return
      const pos = getCanvasPos(e.nativeEvent, canvas)
      draw(pos.x, pos.y)
    }}
    onMouseUp={stopDrawing}
    onMouseLeave={stopDrawing}
    onTouchStart={e => {
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas) return
      const pos = getCanvasPos(e.touches[0], canvas)
      startDrawing(pos.x, pos.y)
    }}
    onTouchMove={e => {
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas) return
      const pos = getCanvasPos(e.touches[0], canvas)
      draw(pos.x, pos.y)
    }}
    onTouchEnd={stopDrawing}
    style={{
      width: '100%',
      height: 160,
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${hasSigned ? 'rgba(196,148,52,0.4)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 4,
      cursor: 'crosshair',
      touchAction: 'none',
      display: 'block',
    }}
  />
  {!hasSigned && (
    <p style={{
      fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
      fontSize: '0.7rem',
      color: 'rgba(232,225,213,0.3)',
      margin: 0,
      textAlign: 'center',
    }}>
      Tegn signaturen din her
    </p>
  )}
</div>
```

- [ ] **Steg 7: Manuell test i nettleser**

Start dev-server (`npm run dev`), åpne en pitch-URL (`/p/[token]`) for et prosjekt der kontrakten er publisert. Verifiser:
- Canvas vises mellom avkrysningsboksen og "Signer"-knappen
- Man kan tegne med mus — streken er synlig (hvit på mørk bakgrunn)
- "Signer"-knappen er deaktivert frem til canvas har innhold + alle andre felt er fylt
- "Tøm"-knappen nullstiller canvas og deaktiverer "Signer"-knappen igjen
- Grensen på canvas får gull-farge (`rgba(196,148,52,0.4)`) når noe er tegnet

- [ ] **Steg 8: Commit**

```bash
git add "app/p/[token]/ContractSigningSection.tsx"
git commit -m "feat: add signature canvas to contract signing section"
```

---

## Task 3: PDF-generering, Storage-upload og e-postvedlegg i API

**Files:**
- Modify: `app/api/contracts/sign/route.ts`

**Interfaces:**
- Consumes: `signatureImage: string` (base64 PNG, prefix `data:image/png;base64,`) i POST-body
- Produces: `contracts.pdf_url` satt i databasen etter signering

- [ ] **Steg 1: Legg til pdfkit-import og valider signatureImage**

Legg til øverst i filen, etter eksisterende imports:

```ts
import PDFDocument from 'pdfkit'
```

Utvid `body`-destrukturering og validering:

```ts
// Gammel:
const { projectId, signerName, signerEmail, contractSnapshot } = body

if (!projectId || !signerName || !signerEmail || !contractSnapshot) {
  return Response.json(
    { error: 'Manglende felt: projectId, signerName, signerEmail, contractSnapshot' },
    { status: 400 }
  )
}

// Ny:
const { projectId, signerName, signerEmail, contractSnapshot, signatureImage } = body

if (!projectId || !signerName || !signerEmail || !contractSnapshot || !signatureImage) {
  return Response.json(
    { error: 'Manglende felt: projectId, signerName, signerEmail, contractSnapshot, signatureImage' },
    { status: 400 }
  )
}

if (typeof signatureImage !== 'string' || !signatureImage.startsWith('data:image/png;base64,') || signatureImage.length < 200) {
  return Response.json({ error: 'Ugyldig signaturbildet' }, { status: 400 })
}
```

- [ ] **Steg 2: Legg til signatureImage i signature_data**

I `update`-kallet til `contracts`-tabellen, legg til `signatureImage` i `signature_data`-objektet:

```ts
// Gammel:
signature_data: {
  signerName,
  signerEmail,
  signedAt,
  contractSnapshot,
  ip,
},

// Ny:
signature_data: {
  signerName,
  signerEmail,
  signedAt,
  contractSnapshot,
  ip,
  signatureImage,
},
```

- [ ] **Steg 3: Generer PDF med pdfkit**

Legg til denne blokken etter `updateContractError`-sjekken (etter at kontrakten er oppdatert til `signed`) og før quote-oppdateringen. PDF-generering er ikke-fatal — signeringen er allerede lagret i databasen selv om PDF-en skulle feile.

```ts
// Generer PDF i minnet (ikke-fatal — kontrakt er allerede signert)
let pdfBuffer: Buffer | null = null
try {
  pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
  const doc = new PDFDocument({ margin: 60, size: 'A4' })
  const chunks: Buffer[] = []
  doc.on('data', (chunk: Buffer) => chunks.push(chunk))
  doc.on('end', () => resolve(Buffer.concat(chunks)))
  doc.on('error', reject)

  // Tittel
  doc.fontSize(16).font('Helvetica-Bold').text('Produksjonsavtale', { align: 'center' })
  doc.moveDown(0.5)
  doc.fontSize(9).font('Helvetica').fillColor('#666666')
    .text(`Generert: ${new Date(signedAt).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`, { align: 'center' })
  doc.fillColor('#000000')
  doc.moveDown(1.5)

  // Kontrakttekst
  doc.fontSize(9).font('Courier').text(contractSnapshot, {
    lineGap: 2,
    paragraphGap: 4,
  })

  doc.moveDown(2)

  // Signeringsseksjon
  doc.moveTo(60, doc.y).lineTo(doc.page.width - 60, doc.y).strokeColor('#cccccc').lineWidth(0.5).stroke()
  doc.strokeColor('#000000').lineWidth(1)
  doc.moveDown(1)

  doc.fontSize(9).font('Helvetica-Bold').text('Signatur')
  doc.font('Helvetica').moveDown(0.3)
  doc.text(`Signert av: ${signerName} (${signerEmail})`)
  doc.text(`Dato: ${new Date(signedAt).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`)
  doc.text(`IP: ${ip}`)
  doc.moveDown(0.8)

  // Signaturbilde
  const imgBase64 = signatureImage.replace('data:image/png;base64,', '')
  const imgBuffer = Buffer.from(imgBase64, 'base64')
  doc.image(imgBuffer, { width: 220, height: 55 })

  doc.end()
  })
} catch (pdfErr) {
  console.error('sign contract PDF generation error:', pdfErr)
}
```

- [ ] **Steg 4: Last opp PDF til Supabase Storage**

Legg til etter `pdfBuffer`-genereringen:

```ts
const pdfFileName = `${contract.id}-${Date.now()}.pdf`
let pdfUrl: string | null = null

if (pdfBuffer) {
const { error: uploadError } = await supabase.storage
  .from('contracts')
  .upload(pdfFileName, pdfBuffer, {
    contentType: 'application/pdf',
    upsert: false,
  })

if (uploadError) {
  console.error('sign contract PDF upload error:', uploadError)
  // Ikke fatal — logg og fortsett uten PDF-URL
} else {
  const { data: urlData } = supabase.storage
    .from('contracts')
    .getPublicUrl(pdfFileName)
  pdfUrl = urlData.publicUrl

  // Lagre PDF-URL på kontrakt-raden
  await supabase
    .from('contracts')
    .update({ pdf_url: pdfUrl })
    .eq('id', contract.id)
  }
}
```

- [ ] **Steg 5: Legg til PDF som vedlegg i begge e-poster**

Bytt ut e-postobjektene i `emails`-arrayen for å inkludere vedlegg:

```ts
// Gammel:
const emails = [
  {
    to: signerEmail,
    subject: `Bekreftelse på signert produksjonsavtale — ${projectTitle}`,
    text: `Hei ${signerName},\n\nVi bekrefter at du har signert produksjonsavtalen for ${projectTitle}.\n\nSignert av: ${signerName} (${signerEmail})\nDato: ${formattedDate}\n\nTa vare på denne e-posten som bekreftelse på inngått avtale.\n\nMed vennlig hilsen,\nLeafilms`,
  },
  {
    to: 'post@leafilms.no',
    subject: `Kontrakt signert — ${projectTitle}`,
    text: `Produksjonsavtalen for ${projectTitle} er signert.\n\nSignert av: ${signerName} (${signerEmail})\nDato: ${formattedDate}\nIP: ${ip}`,
  },
]

// Ny:
const pdfAttachment = pdfBuffer != null
  ? [{
      filename: `Produksjonsavtale-${(projectTitle ?? 'kontrakt').replace(/\s+/g, '-')}.pdf`,
      content: pdfBuffer.toString('base64'),
    }]
  : []

const emails = [
  {
    to: signerEmail,
    subject: `Bekreftelse på signert produksjonsavtale — ${projectTitle}`,
    text: `Hei ${signerName},\n\nVi bekrefter at du har signert produksjonsavtalen for ${projectTitle}.\n\nSignert av: ${signerName} (${signerEmail})\nDato: ${formattedDate}\n\nTa vare på denne e-posten som bekreftelse på inngått avtale.\n\nMed vennlig hilsen,\nLeafilms`,
    attachments: pdfAttachment,
  },
  {
    to: 'post@leafilms.no',
    subject: `Kontrakt signert — ${projectTitle}`,
    text: `Produksjonsavtalen for ${projectTitle} er signert.\n\nSignert av: ${signerName} (${signerEmail})\nDato: ${formattedDate}\nIP: ${ip}`,
    attachments: pdfAttachment,
  },
]
```

Oppdater også `body` i Resend-fetch-kallet for å inkludere `attachments`:

```ts
// Gammel:
body: JSON.stringify({
  from: 'Leafilms <post@leafilms.no>',
  to: [email.to],
  subject: email.subject,
  text: email.text,
}),

// Ny:
body: JSON.stringify({
  from: 'Leafilms <post@leafilms.no>',
  to: [email.to],
  subject: email.subject,
  text: email.text,
  attachments: email.attachments,
}),
```

- [ ] **Steg 6: Manuell test — fullfør en signering**

Bruk en test-pitch (`/p/[token]`). Fyll inn navn, e-post, hak av, tegn signatur, klikk "Signer". Verifiser:
- Responsen er `{ ok: true }` (sjekk Network-fanen i DevTools)
- `contracts`-tabellen i Supabase Studio har `status = 'signed'` og `pdf_url` er satt (ikke null)
- Filen vises i Storage → `contracts`-bucketen
- Åpne `pdf_url` direkte i nettleseren — PDF vises med kontrakttekst + signaturbildet nederst
- Begge e-poster mottatt med PDF som vedlegg

- [ ] **Steg 7: Commit**

```bash
git add "app/api/contracts/sign/route.ts"
git commit -m "feat: generate signed contract PDF, upload to storage, attach to emails"
```

---

## Task 4: Admin-visning av PDF-lenke

**Files:**
- Modify: `lib/actions/contracts.ts`
- Modify: `app/admin/projects/[id]/page.tsx`

**Interfaces:**
- Consumes: `contracts.pdf_url` fra databasen (satt i Task 3)
- Produces: "Åpne signert kontrakt →"-lenke i admin-kontrakt-fanen

- [ ] **Steg 1: Utvid getProjectContractData til å returnere pdfUrl**

I `lib/actions/contracts.ts`, oppdater returtypen til `getProjectContractData`:

```ts
// Gammel:
export async function getProjectContractData(projectId: string): Promise<{
  contractText: string
  isPublished: boolean
  contractId: string | null
  signature: {
    signerName: string
    signerEmail: string
    signedAt: string
  } | null
}>

// Ny:
export async function getProjectContractData(projectId: string): Promise<{
  contractText: string
  isPublished: boolean
  contractId: string | null
  pdfUrl: string | null
  signature: {
    signerName: string
    signerEmail: string
    signedAt: string
  } | null
}>
```

Legg til `pdfUrl` i begge `return`-statementene i funksjonen:

```ts
// I return-blokken der contract?.contract_text finnes (linje ~174):
return {
  contractText: contract.contract_text,
  isPublished: !!contract.published_at,
  contractId: contract.id,
  pdfUrl: contract.pdf_url ?? null,   // <-- legg til
  signature,
}

// I return-blokken på slutten av funksjonen (linje ~238):
return {
  contractText,
  isPublished: !!contract?.published_at,
  contractId: contract?.id ?? null,
  pdfUrl: contract?.pdf_url ?? null,  // <-- legg til
  signature,
}
```

- [ ] **Steg 2: Legg til contractPdfUrl-state i admin-siden**

I `app/admin/projects/[id]/page.tsx`, legg til state-variabel etter `contractSignature`:

```tsx
// Etter:
const [contractSignature, setContractSignature] = useState<{ signerName: string; signerEmail: string; signedAt: string } | null>(null)

// Legg til:
const [contractPdfUrl, setContractPdfUrl] = useState<string | null>(null)
```

Oppdater `loadContract`-funksjonen:

```tsx
// Gammel:
async function loadContract() {
  setLoadingContract(true)
  const data = await getProjectContractData(projectId)
  setContractText(data.contractText)
  setContractIsPublished(data.isPublished)
  setContractSignature(data.signature)
  setLoadingContract(false)
}

// Ny:
async function loadContract() {
  setLoadingContract(true)
  const data = await getProjectContractData(projectId)
  setContractText(data.contractText)
  setContractIsPublished(data.isPublished)
  setContractSignature(data.signature)
  setContractPdfUrl(data.pdfUrl)
  setLoadingContract(false)
}
```

- [ ] **Steg 3: Vis PDF-lenke i signert-banneret**

I `app/admin/projects/[id]/page.tsx`, finn `{contractSignature && (` (rundt linje 1209). Oppdater banneret til å inkludere PDF-lenken:

```tsx
// Gammel:
{contractSignature && (
  <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(76,175,125,0.08)', border: '1px solid rgba(76,175,125,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    <div>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600, color: C.success, marginBottom: 2 }}>
        ✓ Signert av {contractSignature.signerName}
      </p>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
        {contractSignature.signerEmail} · {new Date(contractSignature.signedAt).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })}
      </p>
    </div>
    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.success, background: 'rgba(76,175,125,0.1)', padding: '3px 10px', borderRadius: 4 }}>
      Bindende
    </span>
  </div>
)}

// Ny:
{contractSignature && (
  <div style={{ padding: '12px 16px', borderRadius: 8, background: 'rgba(76,175,125,0.08)', border: '1px solid rgba(76,175,125,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    <div>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600, color: C.success, marginBottom: 2 }}>
        ✓ Signert av {contractSignature.signerName}
      </p>
      <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.text3 }}>
        {contractSignature.signerEmail} · {new Date(contractSignature.signedAt).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' })}
      </p>
      {contractPdfUrl && (
        <a
          href={contractPdfUrl}
          target="_blank"
          rel="noreferrer"
          style={{
            fontFamily: 'var(--font-dm-sans)',
            fontSize: '0.72rem',
            color: C.accent,
            textDecoration: 'none',
            display: 'inline-block',
            marginTop: 4,
          }}
          onMouseEnter={e => (e.currentTarget.style.textDecoration = 'underline')}
          onMouseLeave={e => (e.currentTarget.style.textDecoration = 'none')}
        >
          Åpne signert kontrakt →
        </a>
      )}
    </div>
    <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.success, background: 'rgba(76,175,125,0.1)', padding: '3px 10px', borderRadius: 4 }}>
      Bindende
    </span>
  </div>
)}
```

- [ ] **Steg 4: Manuell test i admin**

Gå til `/admin/projects/[id]?tab=kontrakt` for prosjektet du signerte i Task 3. Verifiser:
- "✓ Signert av [navn]"-banneret vises
- "Åpne signert kontrakt →"-lenken er synlig under e-post/dato
- Klikk lenken — PDF åpnes i ny fane med korrekt innhold (tittel, kontrakttekst, signaturbildet)
- Hover på lenken understreker teksten

- [ ] **Steg 5: Commit**

```bash
git add lib/actions/contracts.ts "app/admin/projects/[id]/page.tsx"
git commit -m "feat: show signed contract PDF link in admin contract tab"
```
