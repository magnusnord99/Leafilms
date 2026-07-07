# Send til kunde — AI-utkast med lenke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Begge "send til kunde"-inngangene (fra `TilbudStepper` og fra kontrakt-steget) skal lande på den eksisterende AI-utkast-siden (`/admin/projects/[id]/email`) med en klikkbar lenke til `/p/{token}` (pitch + tilbud + signerbar kontrakt) allerede skrevet naturlig inn i utkastet — uansett hvilken e-posttype som er utledet fra pipeline-steget.

**Architecture:** Ingen ny sende-mekanisme bygges. `TilbudStepper`s sendeknapp endres fra å kalle en direkte-send-funksjon (`sendTilbudToKunde`, som er ikke-redigerbar og aldri virket pga. manglende `RESEND_API_KEY`) til å navigere til `/email`-siden, som allerede har fungerende AI-utkast + redigering + faktisk sending + logging + stadieovergang. Betingelsen som i dag begrenser lenken til `emailType === 'pitch'` løsnes slik at lenken alltid følger med når `pitchToken` finnes.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, React client components. Prosjektet har ingen automatisert testsuite (ingen jest/vitest/playwright er satt opp) — verifisering skjer via `npx tsc --noEmit`, `npm run lint`, og manuell klikk-gjennomgang i dev-server, slik spec-en selv beskriver.

## Global Constraints

- Følg eksisterende kodekonvensjoner i repoet (server components som default, `'use client'` kun der nødvendig — begge berørte filer er allerede `'use client'`).
- Ingen nye migrasjoner, ingen ny UI utover det som allerede finnes på `/email`-siden.
- `RESEND_API_KEY` er fortsatt ikke satt — dette endres ikke her (se spec, "Ikke i scope").
- Norsk UI-tekst, konsistent med resten av appen.

---

## Task 1: Fjern direkte-sending fra `sendTilbudToKunde`

**Files:**
- Modify: `lib/actions/pipeline.ts:1585-1671` (fjern hele funksjonen og JSDoc-kommentaren over den)

**Interfaces:**
- Consumes: ingenting nytt.
- Produces: ingenting — dette fjerner en eksportert funksjon. Task 2 fjerner det siste kallstedet, så rekkefølgen her betyr ikke noe for kompilering så lenge begge tasks er gjort før commit av Task 2, men vi gjør dem i denne rekkefølgen for et rent, forklarende diff-par.

- [ ] **Step 1: Bekreft at `sendTilbudToKunde` kun brukes ett sted**

Kjør:
```bash
grep -rn "sendTilbudToKunde" --include="*.tsx" --include="*.ts" . | grep -v node_modules
```
Forventet output (før denne planen er gjennomført):
```
app/admin/projects/[id]/page.tsx:6:import { ... sendTilbudToKunde ... } from '@/lib/actions/pipeline'
app/admin/projects/[id]/page.tsx:648:    const result = await sendTilbudToKunde(projectId, hubData.pitchToken)
lib/actions/pipeline.ts:1589:export async function sendTilbudToKunde(
```
Hvis det dukker opp flere treff enn dette, stopp og undersøk før du går videre — planen forutsetter at det kun er ett kallsted.

- [ ] **Step 2: Slett funksjonen**

Åpne `lib/actions/pipeline.ts` og slett hele blokken fra og med JSDoc-kommentaren rett over
`export async function sendTilbudToKunde` til og med den avsluttende `}` for funksjonen
(linje 1585–1671 i nåværende fil — bruk `grep -n "sendTilbudToKunde\|^ \* Henter kontrakt" lib/actions/pipeline.ts`
for å bekrefte start/slutt før sletting, siden linjenumre kan ha forskjøvet seg fra forrige lesing).

Blokken som fjernes ser slik ut (til orientering, ikke lim inn — bare slett den tilsvarende delen
i den faktiske filen):

```typescript
/**
 * Sender tilbudet til kunden via e-post og flytter prosjektet til 'kontrakt'-steget.
 * Brukes når alle 3 substeg (pitch, tilbud, kontrakt) er klare.
 */
export async function sendTilbudToKunde(
  projectId: string,
  pitchToken: string | null
): Promise<{ ok: boolean; error?: string }> {
  // ... hele body ...
}
```

- [ ] **Step 3: Typecheck (forventet å feile her — det er OK)**

Kjør:
```bash
npx tsc --noEmit
```
Forventet: FEIL — `app/admin/projects/[id]/page.tsx` klager på at `sendTilbudToKunde` ikke finnes
(fordi Task 2 ikke er gjort ennå). Dette er forventet mellomtilstand; ikke commit ennå.

- [ ] **Step 4: Gå videre til Task 2 før commit**

Ikke commit denne endringen alene — den kompilerer ikke uten Task 2. Fortsett direkte til Task 2,
og gjør én felles commit etter Step 3 der.

---

## Task 2: Rut `TilbudStepper`s sendeknapp til `/email`-siden

**Files:**
- Modify: `app/admin/projects/[id]/page.tsx`

**Interfaces:**
- Consumes: `projectId: string` (allerede en prop på `TilbudStepper`, brukes til å bygge lenken).
- Produces: ingen nye eksporterte symboler.

- [ ] **Step 1: Fjern importen av `sendTilbudToKunde`**

I toppen av filen (linje 6), fjern `sendTilbudToKunde` fra import-listen:

```typescript
import { getProjectHub, updateTaskStatus, getAllProfiles, toggleTaskAssignee, updateProjectDeliveryInfo, saveProjectMeetingNotes, analyzeProjectNotes, getContractStatus, setProjectLead } from '@/lib/actions/pipeline'
```

- [ ] **Step 2: Fjern `sendingTilbud`-state**

Finn linjen (rundt linje 582):
```typescript
  const [sendingTilbud, setSendingTilbud] = useState(false)
```
Slett den.

- [ ] **Step 3: Fjern `handleSendTilbud`-funksjonen**

Finn og slett (rundt linje 645-655):
```typescript
  async function handleSendTilbud() {
    if (!hubData) return
    setSendingTilbud(true)
    const result = await sendTilbudToKunde(projectId, hubData.pitchToken)
    setSendingTilbud(false)
    if (result.ok) {
      await fetchHub()
    } else {
      alert(result.error ?? 'Noe gikk galt')
    }
  }
```

- [ ] **Step 4: Fjern `onSend`/`sending` fra `TilbudStepper`s props og type**

I `TilbudStepper`-funksjonssignaturen (rundt linje 246-266), fjern `onSend` og `sending` fra
både destrukturering og typen:

Før:
```typescript
function TilbudStepper({
  projectId,
  hasSections,
  quote,
  notesValue,
  customerId,
  projectTitle,
  isContractPublished,
  onSend,
  sending,
}: {
  projectId: string
  hasSections: boolean
  quote: Quote | null
  notesValue: string
  customerId: string | null
  projectTitle: string
  isContractPublished: boolean
  onSend: () => void
  sending: boolean
}) {
```

Etter:
```typescript
function TilbudStepper({
  projectId,
  hasSections,
  quote,
  notesValue,
  customerId,
  projectTitle,
  isContractPublished,
}: {
  projectId: string
  hasSections: boolean
  quote: Quote | null
  notesValue: string
  customerId: string | null
  projectTitle: string
  isContractPublished: boolean
}) {
```

- [ ] **Step 5: Erstatt send-knappen med en lenke til `/email`-siden**

Finn blokken (rundt linje 353-376):
```typescript
      {/* Send-knapp */}
      <div style={{ marginTop: 10 }}>
        <button
          onClick={onSend}
          disabled={!allDone || sending}
          style={{
            fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600,
            padding: '12px 20px', borderRadius: 8, cursor: allDone && !sending ? 'pointer' : 'not-allowed',
            border: 'none', width: '100%',
            background: allDone ? C.accent : C.surface2,
            color: allDone ? '#fff' : C.text3,
            opacity: sending ? 0.7 : 1,
            transition: 'background 0.15s, box-shadow 0.15s',
            boxShadow: allDone ? '0 0 24px rgba(124,92,252,0.3)' : 'none',
          }}
        >
          {sending ? 'Sender...' : 'Send e-post til kunde →'}
        </button>
        {!allDone && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, textAlign: 'center', marginTop: 8 }}>
            Fullfør begge stegene for å sende tilbudet
          </p>
        )}
      </div>
```

Erstatt med (samme visuelle stil, men `allDone` styrer om knappen er en navigerbar `Link` eller en
deaktivert `button`):

```typescript
      {/* Send-knapp */}
      <div style={{ marginTop: 10 }}>
        {allDone ? (
          <Link href={`/admin/projects/${projectId}/email`} style={{ textDecoration: 'none', display: 'block' }}>
            <button
              style={{
                fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600,
                padding: '12px 20px', borderRadius: 8, cursor: 'pointer',
                border: 'none', width: '100%',
                background: C.accent,
                color: '#fff',
                transition: 'background 0.15s, box-shadow 0.15s',
                boxShadow: '0 0 24px rgba(124,92,252,0.3)',
              }}
            >
              Send e-post til kunde →
            </button>
          </Link>
        ) : (
          <button
            disabled
            style={{
              fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', fontWeight: 600,
              padding: '12px 20px', borderRadius: 8, cursor: 'not-allowed',
              border: 'none', width: '100%',
              background: C.surface2,
              color: C.text3,
            }}
          >
            Send e-post til kunde →
          </button>
        )}
        {!allDone && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, textAlign: 'center', marginTop: 8 }}>
            Fullfør begge stegene for å sende tilbudet
          </p>
        )}
      </div>
```

- [ ] **Step 6: Fjern `onSend`/`sending` fra kallstedet**

Finn (rundt linje 1165-1175):
```typescript
                <TilbudStepper
                  projectId={projectId}
                  hasSections={hasSections}
                  quote={quote}
                  notesValue={notesValue}
                  customerId={project.customer_id ?? null}
                  projectTitle={project.title}
                  isContractPublished={stepperContractPublished}
                  onSend={handleSendTilbud}
                  sending={sendingTilbud}
                />
```
Fjern de to siste propene:
```typescript
                <TilbudStepper
                  projectId={projectId}
                  hasSections={hasSections}
                  quote={quote}
                  notesValue={notesValue}
                  customerId={project.customer_id ?? null}
                  projectTitle={project.title}
                  isContractPublished={stepperContractPublished}
                />
```

- [ ] **Step 7: Typecheck**

Kjør:
```bash
npx tsc --noEmit
```
Forventet: INGEN feil relatert til `sendTilbudToKunde`, `handleSendTilbud`, `sendingTilbud`, `onSend`
eller `sending`. (Andre pre-eksisterende feil i repoet, hvis noen, er ikke i scope for denne planen —
sammenlign med output fra `git stash` hvis usikker på hva som er pre-eksisterende.)

- [ ] **Step 8: Lint**

Kjør:
```bash
npm run lint
```
Forventet: ingen nye lint-feil i `app/admin/projects/[id]/page.tsx` eller `lib/actions/pipeline.ts`.

- [ ] **Step 9: Commit**

```bash
git add app/admin/projects/\[id\]/page.tsx lib/actions/pipeline.ts
git commit -m "$(cat <<'EOF'
Rut send-til-kunde-knappen gjennom AI-utkast-siden

TilbudStepper sendte tidligere en hardkodet e-post direkte via
sendTilbudToKunde() uten utkast, redigering eller logging — og siden
RESEND_API_KEY mangler, skjedde det reelt sett ingenting. Knappen
navigerer nå til /email-siden, som allerede har fungerende
AI-utkast + redigering + faktisk sending + logging + stadieovergang.
EOF
)"
```

---

## Task 3: Legg alltid ved lenken i e-postutkastet når `pitchToken` finnes

**Files:**
- Modify: `app/admin/projects/[id]/email/page.tsx`

**Interfaces:**
- Consumes: `hubData.pitchToken: string | null` (allerede hentet av `getProjectHub`), `emailType: EmailType`
  (allerede utledet av `resolveEmailType`).
- Produces: ingenting nytt eksportert — kun endret intern logikk i `loadDraft()` og sidebar-render.

- [ ] **Step 1: Løsne betingelsen i `loadDraft()`**

Finn (rundt linje 111-122):
```typescript
  async function loadDraft() {
    if (!hubData) return
    setGeneratingDraft(true)
    try {
      const extraContext = emailType === 'pitch' && hubData.pitchToken
        ? `Pitch-lenke til kunden: ${window.location.origin}/p/${hubData.pitchToken}`
        : undefined
      const draft = await generateEmailDraft(projectId, emailType, extraContext)
      if (draft) { setSubject(draft.subject ?? ''); setBody(draft.body ?? '') }
    } catch {}
    finally { setGeneratingDraft(false) }
  }
```

Erstatt med:
```typescript
  async function loadDraft() {
    if (!hubData) return
    setGeneratingDraft(true)
    try {
      const extraContext = hubData.pitchToken
        ? `Lenke til prosjektside (pitch, tilbud og signerbar kontrakt): ${window.location.origin}/p/${hubData.pitchToken}`
        : undefined
      const draft = await generateEmailDraft(projectId, emailType, extraContext)
      if (draft) { setSubject(draft.subject ?? ''); setBody(draft.body ?? '') }
    } catch {}
    finally { setGeneratingDraft(false) }
  }
```

- [ ] **Step 2: Oppdater "Vedlegg / Lenker"-panelet i sidebaren**

Finn (rundt linje 282-305):
```typescript
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 18px' }}>
            <FieldLabel>Vedlegg / Lenker</FieldLabel>
            {emailType === 'meeting' && (
              <div>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginBottom: 8 }}>Møtelink</p>
                <input type="url" value={meetingLink} onChange={e => setMeetingLink(e.target.value)} placeholder="https://meet.google.com/..." style={inputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
                  onBlur={e => { e.currentTarget.style.borderColor = C.border }} />
              </div>
            )}
            {emailType === 'pitch' && hubData.pitchToken && (
              <div>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginBottom: 6 }}>Pitch-lenke</p>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.accent, wordBreak: 'break-all' }}>
                  {typeof window !== 'undefined' ? `${window.location.origin}/p/${hubData.pitchToken}` : `/p/${hubData.pitchToken}`}
                </p>
              </div>
            )}
            {emailType !== 'meeting' && emailType !== 'pitch' && (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, fontStyle: 'italic' }}>
                Ingen vedlegg for denne e-posttypen.
              </p>
            )}
          </div>
```

Erstatt med:
```typescript
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 18px' }}>
            <FieldLabel>Vedlegg / Lenker</FieldLabel>
            {emailType === 'meeting' && (
              <div>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginBottom: 8 }}>Møtelink</p>
                <input type="url" value={meetingLink} onChange={e => setMeetingLink(e.target.value)} placeholder="https://meet.google.com/..." style={inputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = C.accent }}
                  onBlur={e => { e.currentTarget.style.borderColor = C.border }} />
              </div>
            )}
            {emailType !== 'meeting' && hubData.pitchToken && (
              <div>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, marginBottom: 6 }}>Pitch-, tilbud- og kontraktlenke</p>
                <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', color: C.accent, wordBreak: 'break-all' }}>
                  {typeof window !== 'undefined' ? `${window.location.origin}/p/${hubData.pitchToken}` : `/p/${hubData.pitchToken}`}
                </p>
              </div>
            )}
            {emailType !== 'meeting' && !hubData.pitchToken && (
              <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.68rem', color: C.text3, fontStyle: 'italic' }}>
                Ingen vedlegg for denne e-posttypen.
              </p>
            )}
          </div>
```

- [ ] **Step 3: Typecheck**

Kjør:
```bash
npx tsc --noEmit
```
Forventet: ingen nye feil i `app/admin/projects/[id]/email/page.tsx`.

- [ ] **Step 4: Lint**

Kjør:
```bash
npm run lint
```
Forventet: ingen nye lint-feil.

- [ ] **Step 5: Manuell verifisering i dev-server**

```bash
npm run dev
```

Deretter, i nettleser:
1. Åpne et prosjekt i `tilbud_sendt`-steget hvor pitch er satt opp, tilbud (`quote`) finnes, og
   kontrakten er publisert (`isContractPublished === true`) — slik at "Send e-post til kunde →"
   er aktiv i `TilbudStepper`.
2. Klikk knappen → skal navigere til `/admin/projects/{id}/email`.
3. Vent til utkastet er ferdig generert (`Genererer utkast med AI...` forsvinner) → meldingsteksten
   skal inneholde en lenke i formen `https://.../p/{token}` skrevet naturlig inn i teksten, og
   "Vedlegg / Lenker"-panelet til høyre skal vise "Pitch-, tilbud- og kontraktlenke" med URL-en.
4. Flytt et testprosjekt manuelt til `kontrakt`-steget (via admin-UI eller
   `updatePipelineStage`), gå til prosjektet, klikk "Send kontrakt-epost" → samme sjekk: utkastet
   skal nå inneholde lenken, selv om `emailType` her resolver til `'general'`.
5. Bekreft at møteinvitasjon (`emailType === 'meeting'`, steg `møte`) fortsatt viser møtelink-feltet
   og ikke pitch-lenke-panelet (siden `emailType !== 'meeting'`-betingelsen ekskluderer det for
   møtetypen, som før).

Hvis noe av dette avviker, stopp og undersøk før commit.

- [ ] **Step 6: Commit**

```bash
git add app/admin/projects/\[id\]/email/page.tsx
git commit -m "$(cat <<'EOF'
Legg alltid ved prosjektlenken i e-postutkast når den finnes

Lenken til /p/{token} (pitch, tilbud og signerbar kontrakt) ble tidligere
kun lagt ved AI-utkastet når emailType var 'pitch'. Kontrakt-steget
resolver til 'general' og fikk dermed aldri lenken. Nå følger lenken med
uansett e-posttype, så lenge prosjektet har en pitchToken.
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Spec punkt 1 ("TilbudStepper sender ikke lenger direkte") → Task 1 + Task 2.
- Spec punkt 2 ("Lenken følger med uansett e-posttype") → Task 3.
- Spec punkt 3 ("Ingen endring i selve sendingen") → ingen task rører `/api/send-email` eller
  `handleSend()` i `/email/page.tsx` — bekreftet ved at ingen av de tre tasks nevner disse.
- Spec "Ikke i scope" (RESEND_API_KEY, ny UI, `/p/[token]`-siden) → ingen task rører disse.
- Spec "Testing"-seksjonen → dekket av Step 5 i Task 3 (manuell verifisering) og typecheck/lint-stegene
  i Task 2 og 3.

**Placeholder-skanning:** ingen TBD/TODO, alle kodeblokker er komplett utskrevne, ingen "similar to
Task N"-referanser.

**Type-konsistens:** `TilbudStepper`s props-type i Task 2 Step 4 fjerner nøyaktig de to feltene
(`onSend`, `sending`) som fjernes fra kallstedet i Step 6 — ingen gjenværende referanser.
`hubData.pitchToken` og `emailType` i Task 3 brukes med samme navn og type som de allerede har i
filen (ingen nye typer introduseres).
