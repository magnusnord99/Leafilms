# Google Meet-integrasjon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La admin opprette en Google Meet-lenke for et prosjekt fra appen, og la både admin og kunde bli med i møtet via lenken (samtalen foregår på Google sin side, ikke embeddet i appen).

**Architecture:** Ett Google-konto (f.eks. et felles "booking"-konto for LeaFilms) autoriseres én gang via OAuth og gir appen et refresh token som lagres server-side. Når admin trykker "Opprett møte" på et prosjekt, kaller en API-route Google Meet REST API v2 (`spaces.create`) med dette tokenet og lagrer den returnerte møtelenken i en ny tabell `project_meetings`. Admin-UI viser lenken; den offentlige `/p/[token]`-siden viser en "Bli med i møte"-knapp som henter lenken via delelenke-token (samme mønster som kontraktsignering).

**Tech Stack:** Next.js 16 App Router, Supabase (Postgres + RLS), Google Meet REST API v2 (ren `fetch`, ingen `googleapis`-pakke), eksisterende `lib/supabase-server.ts`-klienter.

## Global Constraints

- Følg eksisterende migrasjonsmønster i `database-migrations/` — ett nummerert `.sql`-fil per migrasjon, UUID-primærnøkler, RLS-policyer for `authenticated`-rollen skrevet eksplisitt (se `035_price_catalog_rls.sql`).
- Dette repoet har **ingen automatisert testoppsett** (ingen jest/vitest, ingen `test`-script i `package.json`). Alle verifiseringssteg i denne planen er derfor manuelle (dev-server + `curl`/nettleser), ikke automatiserte tester.
- Admin-only API-routes skal bruke samme auth-sjekk som `app/api/projects/[id]/duplicate/route.ts`: hent bruker via `createClient()`, slå opp `profiles.role === 'admin'`, avvis med 401 ellers.
- Offentlige (kunde-vendte) routes skal validere `shareToken` mot `project_shares` med `createServiceClient()`, samme mønster som `app/api/contracts/sign/route.ts`.
- Google-hemmeligheter (`client_secret`, `refresh_token`) skal aldri eksponeres til klienten — kun brukes server-side i API-routes.
- Før du lager migrasjonsfilen i Task 2: kjør `npm run migrate:show` for å bekrefte høyeste eksisterende nummer lokalt, og sjekk også faktisk migrasjonshistorikk i Supabase Dashboard → SQL Editor (`select * from schema_migrations order by version desc limit 5;` eller tilsvarende) — produksjonsdatabasen har tidligere ligget foran de lokale filnumrene.

---

## Fil-oversikt

| Fil | Ansvar |
|---|---|
| `docs/google-meet-setup.md` | Manuelle steg for Google Cloud-oppsett (ikke kode) |
| `database-migrations/049_google_meet_integration.sql` | Tabeller `google_oauth_tokens` og `project_meetings` + RLS |
| `lib/google/oauth.ts` | Bygge auth-URL, bytte kode mot tokens, hente/oppdatere gyldig access token |
| `lib/google/meet.ts` | Kalle Meet API for å opprette et møterom |
| `app/api/auth/google/connect/route.ts` | Admin trigger: redirect til Googles samtykkeskjerm |
| `app/api/auth/google/callback/route.ts` | Google redirect hit: bytter kode mot refresh token, lagrer det |
| `app/api/projects/[id]/meetings/route.ts` | Admin: opprette + liste møter for et prosjekt |
| `app/admin/projects/[id]/meeting/page.tsx` | Admin-UI: "Opprett møte"-knapp, liste over møter |
| `app/api/projects/[id]/meetings/join/route.ts` | Offentlig (token-validert): hent aktiv møtelenke |
| `app/p/[token]/PublicProjectClient.tsx` | Legg til "Bli med i møte"-knapp (modifiser eksisterende fil) |

---

### Task 1: Google Cloud-oppsett (manuelt, dokumentert)

**Files:**
- Create: `docs/google-meet-setup.md`

Dette er ikke kode — det er steg dere gjør i Google Cloud Console én gang, dokumentert slik at implementasjonen i Task 3 har noe å peke på.

- [ ] **Step 1: Opprett Google Cloud-prosjekt og aktiver API**

Skriv `docs/google-meet-setup.md` med følgende innhold:

```markdown
# Google Meet API-oppsett

## 1. Google Cloud-prosjekt
1. Gå til https://console.cloud.google.com og opprett et nytt prosjekt (eller bruk et eksisterende).
2. Aktiver "Google Meet API" under "APIs & Services" → "Library".

## 2. OAuth-samtykkeskjerm
1. "APIs & Services" → "OAuth consent screen".
2. Velg "External" (med mindre dere har Google Workspace og vil begrense til org).
3. Fyll inn appnavn ("LeaFilms Pitch"), support-e-post.
4. Legg til scope: `https://www.googleapis.com/auth/meetings.space.created`.
5. Legg til det Google-kontoen som skal eie møtene (f.eks. booking@leafilms.no) som test-bruker hvis appen er i "Testing"-status.

## 3. OAuth-klient
1. "APIs & Services" → "Credentials" → "Create Credentials" → "OAuth client ID".
2. Type: "Web application".
3. Authorized redirect URI:
   - Lokalt: `http://localhost:3000/api/auth/google/callback`
   - Produksjon: `https://<deres-domene>/api/auth/google/callback`
4. Noter ned Client ID og Client Secret.

## 4. Miljøvariabler
Legg til i `.env.local` (og i Vercel/prod env):

```
GOOGLE_MEET_CLIENT_ID=<client id fra steg 3>
GOOGLE_MEET_CLIENT_SECRET=<client secret fra steg 3>
GOOGLE_MEET_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

## 5. Koble til kontoen (etter at koden i denne planen er implementert)
1. Logg inn som admin i appen.
2. Naviger til `/api/auth/google/connect`.
3. Logg inn med Google-kontoen som skal eie møtene, godkjenn samtykke.
4. Du blir sendt tilbake til admin — refresh token er nå lagret i databasen.
```

- [ ] **Step 2: Commit**

```bash
git add docs/google-meet-setup.md
git commit -m "docs: legg til oppsettsguide for Google Meet-integrasjon"
```

---

### Task 2: Databasemigrasjon

**Files:**
- Create: `database-migrations/049_google_meet_integration.sql`

**Interfaces:**
- Produces: tabellene `google_oauth_tokens (id, account_label, refresh_token, access_token, access_token_expires_at, created_at, updated_at)` og `project_meetings (id, project_id, created_by, title, meet_link, google_space_name, status, created_at)` — brukes av `lib/google/oauth.ts`, `lib/google/meet.ts` og API-routene i Task 3/4/5.

- [ ] **Step 1: Skriv migrasjonsfilen**

```sql
-- 049_google_meet_integration.sql
-- Google OAuth-tokens for kontoen som eier Meet-rommene (ett rad per konto, service-role-only)
CREATE TABLE IF NOT EXISTS google_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_label TEXT NOT NULL UNIQUE,
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE google_oauth_tokens ENABLE ROW LEVEL SECURITY;
-- Ingen policyer for anon/authenticated med vilje — kun service_role (som omgår RLS)
-- skal kunne lese/skrive refresh tokens.

-- Møter knyttet til et prosjekt
CREATE TABLE IF NOT EXISTS project_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id),
  title TEXT NOT NULL DEFAULT 'Møte',
  meet_link TEXT NOT NULL,
  google_space_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_meetings_project_id ON project_meetings(project_id);

ALTER TABLE project_meetings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_read_project_meetings" ON project_meetings;
DROP POLICY IF EXISTS "authenticated_insert_project_meetings" ON project_meetings;
DROP POLICY IF EXISTS "authenticated_update_project_meetings" ON project_meetings;
DROP POLICY IF EXISTS "authenticated_delete_project_meetings" ON project_meetings;

CREATE POLICY "authenticated_read_project_meetings"
  ON project_meetings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated_insert_project_meetings"
  ON project_meetings FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated_update_project_meetings"
  ON project_meetings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_delete_project_meetings"
  ON project_meetings FOR DELETE
  TO authenticated
  USING (true);
-- Merk: ingen anon-policy. Den offentlige "bli med i møte"-siden leser
-- alltid via createServiceClient() etter manuell shareToken-validering
-- (se app/api/projects/[id]/meetings/join/route.ts), ikke direkte RLS.
```

- [ ] **Step 2: Kjør migrasjonen**

```bash
npm run migrate:show   # bekreft at filen ser riktig ut
npm run migrate        # eller npm run migrate:psql, avhengig av hva som fungerer i miljøet
```

Forventet: ingen feilmeldinger, og i Supabase Dashboard → Table Editor ser du de to nye tabellene.

- [ ] **Step 3: Commit**

```bash
git add database-migrations/049_google_meet_integration.sql
git commit -m "feat: legg til tabeller for Google Meet-integrasjon"
```

---

### Task 3: OAuth-flyt (koble til Google-konto)

**Files:**
- Create: `lib/google/oauth.ts`
- Create: `app/api/auth/google/connect/route.ts`
- Create: `app/api/auth/google/callback/route.ts`

**Interfaces:**
- Consumes: `createClient()` og `createServiceClient()` fra `lib/supabase-server.ts` (eksisterer allerede); tabell `google_oauth_tokens` fra Task 2.
- Produces: `getValidAccessToken(): Promise<string>` — brukes av `lib/google/meet.ts` i Task 4. `getGoogleAuthUrl(): string` og `exchangeCodeForTokens(code: string): Promise<{ access_token: string; refresh_token?: string; expires_in: number }>` — brukt internt av routene i denne oppgaven.

- [ ] **Step 1: Skriv `lib/google/oauth.ts`**

```typescript
import { createServiceClient } from '@/lib/supabase-server'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const MEET_SCOPE = 'https://www.googleapis.com/auth/meetings.space.created'
const ACCOUNT_LABEL = 'default'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Mangler miljøvariabel: ${name}`)
  }
  return value
}

export function getGoogleAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: requireEnv('GOOGLE_MEET_CLIENT_ID'),
    redirect_uri: requireEnv('GOOGLE_MEET_REDIRECT_URI'),
    response_type: 'code',
    scope: MEET_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: requireEnv('GOOGLE_MEET_CLIENT_ID'),
      client_secret: requireEnv('GOOGLE_MEET_CLIENT_SECRET'),
      redirect_uri: requireEnv('GOOGLE_MEET_REDIRECT_URI'),
      grant_type: 'authorization_code',
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Google token exchange feilet (${response.status}): ${body}`)
  }

  return response.json()
}

export async function storeRefreshToken(refreshToken: string, accessToken: string, expiresInSeconds: number): Promise<void> {
  const supabase = createServiceClient()
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString()

  const { error } = await supabase
    .from('google_oauth_tokens')
    .upsert(
      {
        account_label: ACCOUNT_LABEL,
        refresh_token: refreshToken,
        access_token: accessToken,
        access_token_expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'account_label' }
    )

  if (error) {
    throw new Error(`Klarte ikke lagre Google-token: ${error.message}`)
  }
}

export async function getValidAccessToken(): Promise<string> {
  const supabase = createServiceClient()
  const { data: row, error } = await supabase
    .from('google_oauth_tokens')
    .select('refresh_token, access_token, access_token_expires_at')
    .eq('account_label', ACCOUNT_LABEL)
    .single()

  if (error || !row) {
    throw new Error('Ingen Google-konto koblet til. Besøk /api/auth/google/connect som admin først.')
  }

  const stillValid =
    row.access_token &&
    row.access_token_expires_at &&
    new Date(row.access_token_expires_at).getTime() - Date.now() > 60_000

  if (stillValid) {
    return row.access_token as string
  }

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: row.refresh_token,
      client_id: requireEnv('GOOGLE_MEET_CLIENT_ID'),
      client_secret: requireEnv('GOOGLE_MEET_CLIENT_SECRET'),
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Klarte ikke fornye Google access token (${response.status}): ${body}`)
  }

  const refreshed: GoogleTokenResponse = await response.json()
  await storeRefreshToken(row.refresh_token, refreshed.access_token, refreshed.expires_in)
  return refreshed.access_token
}
```

- [ ] **Step 2: Skriv `app/api/auth/google/connect/route.ts`**

```typescript
import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase-server'
import { getGoogleAuthUrl } from '@/lib/google/oauth'

export async function GET(req: NextRequest) {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  const { data: profile } = user
    ? await authClient.from('profiles').select('role').eq('id', user.id).single()
    : { data: null }

  if (!user || profile?.role !== 'admin') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return Response.redirect(getGoogleAuthUrl())
}
```

- [ ] **Step 3: Skriv `app/api/auth/google/callback/route.ts`**

```typescript
import { NextRequest } from 'next/server'
import { exchangeCodeForTokens, storeRefreshToken } from '@/lib/google/oauth'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  if (error) {
    return Response.redirect(new URL(`/admin?google_error=${encodeURIComponent(error)}`, req.url))
  }

  if (!code) {
    return Response.json({ error: 'Mangler code-parameter fra Google' }, { status: 400 })
  }

  const tokens = await exchangeCodeForTokens(code)

  if (!tokens.refresh_token) {
    // Skjer typisk hvis kontoen allerede har godkjent appen uten "prompt=consent" —
    // be brukeren koble til på nytt via Google-kontoens tilgangsside først.
    return Response.json(
      { error: 'Fikk ikke refresh_token fra Google. Fjern appens tilgang på myaccount.google.com/permissions og prøv /api/auth/google/connect på nytt.' },
      { status: 500 }
    )
  }

  await storeRefreshToken(tokens.refresh_token, tokens.access_token, tokens.expires_in)

  return Response.redirect(new URL('/admin?google_connected=1', req.url))
}
```

- [ ] **Step 4: Manuell verifisering**

```bash
npm run dev
```

Logg inn som admin i nettleseren, gå til `http://localhost:3000/api/auth/google/connect`, gjennomfør Google-samtykket, og bekreft at du blir sendt til `/admin?google_connected=1`. Sjekk i Supabase Table Editor at `google_oauth_tokens` har én rad med `account_label = 'default'`.

- [ ] **Step 5: Commit**

```bash
git add lib/google/oauth.ts app/api/auth/google/connect/route.ts app/api/auth/google/callback/route.ts
git commit -m "feat: legg til Google OAuth-tilkobling for Meet-integrasjon"
```

---

### Task 4: Meet API-klient

**Files:**
- Create: `lib/google/meet.ts`

**Interfaces:**
- Consumes: `getValidAccessToken()` fra Task 3.
- Produces: `createMeetSpace(): Promise<{ spaceName: string; meetingUri: string }>` — brukes av API-routen i Task 5.

- [ ] **Step 1: Skriv `lib/google/meet.ts`**

```typescript
import { getValidAccessToken } from './oauth'

const MEET_API_URL = 'https://meet.googleapis.com/v2/spaces'

interface MeetSpaceResponse {
  name: string
  meetingUri: string
  meetingCode: string
}

export async function createMeetSpace(): Promise<{ spaceName: string; meetingUri: string }> {
  const accessToken = await getValidAccessToken()

  const response = await fetch(MEET_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Google Meet API feilet (${response.status}): ${body}`)
  }

  const space: MeetSpaceResponse = await response.json()
  return { spaceName: space.name, meetingUri: space.meetingUri }
}
```

*Merk til implementerende utvikler: Meet API v2 er relativt ny — dobbeltsjekk request/response-formatet mot https://developers.google.com/workspace/meet/api/reference/rest/v2/spaces/create før implementasjon, i tilfelle Google har endret feltnavn.*

- [ ] **Step 2: Commit**

```bash
git add lib/google/meet.ts
git commit -m "feat: legg til Meet API-klient for å opprette møterom"
```

---

### Task 5: Admin API-route for å opprette/liste møter

**Files:**
- Create: `app/api/projects/[id]/meetings/route.ts`

**Interfaces:**
- Consumes: `createMeetSpace()` fra Task 4, `createClient()`/`createServiceClient()` fra `lib/supabase-server.ts`, tabell `project_meetings`.
- Produces: `POST /api/projects/[id]/meetings` → `{ id, meet_link, title, created_at }`; `GET /api/projects/[id]/meetings` → `{ meetings: Array<{ id, meet_link, title, status, created_at }> }` — brukes av admin-UI i Task 6.

- [ ] **Step 1: Skriv routen**

```typescript
import { NextRequest } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'
import { createMeetSpace } from '@/lib/google/meet'

async function requireAdmin(): Promise<{ userId: string } | null> {
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  const { data: profile } = user
    ? await authClient.from('profiles').select('role').eq('id', user.id).single()
    : { data: null }

  if (!user || profile?.role !== 'admin') {
    return null
  }
  return { userId: user.id }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: projectId } = await params
  const body = await req.json().catch(() => ({}))
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : 'Møte'

  const { spaceName, meetingUri } = await createMeetSpace()

  const supabase = createServiceClient()
  const { data: meeting, error } = await supabase
    .from('project_meetings')
    .insert({
      project_id: projectId,
      created_by: admin.userId,
      title,
      meet_link: meetingUri,
      google_space_name: spaceName,
    })
    .select('id, meet_link, title, created_at')
    .single()

  if (error || !meeting) {
    return Response.json({ error: `Klarte ikke lagre møtet: ${error?.message}` }, { status: 500 })
  }

  return Response.json(meeting, { status: 201 })
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin()
  if (!admin) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: projectId } = await params
  const supabase = createServiceClient()
  const { data: meetings, error } = await supabase
    .from('project_meetings')
    .select('id, meet_link, title, status, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ meetings: meetings ?? [] })
}
```

- [ ] **Step 2: Manuell verifisering**

Med dev-server kjørende og en gyldig admin-sesjon i nettleseren (kopier session-cookien til en `curl`, eller test via nettleserens devtools "fetch"):

```bash
curl -X POST http://localhost:3000/api/projects/<en-ekte-project-id>/meetings \
  -H "Content-Type: application/json" \
  -H "Cookie: <admin session cookies fra nettleseren>" \
  -d '{"title": "Oppstartsmøte"}'
```

Forventet: `201` med JSON som inneholder en `meet_link` som starter med `https://meet.google.com/`. Bekreft raden i `project_meetings`-tabellen i Supabase.

- [ ] **Step 3: Commit**

```bash
git add app/api/projects/[id]/meetings/route.ts
git commit -m "feat: API-route for å opprette og liste prosjektmøter"
```

---

### Task 6: Admin-UI for møter

**Files:**
- Create: `app/admin/projects/[id]/meeting/page.tsx`
- Modify: der prosjekt-fanene rendres (samme sted `quote`/`contact`/`email`-fanene er lenket fra) — legg til en "Møte"-fane. Finn eksakt fil ved å søke etter hvor `/quote` lenkes fra i prosjektsiden (`app/admin/projects/[id]/page.tsx` eller en delt nav-komponent) og speil samme mønster.

**Interfaces:**
- Consumes: `GET`/`POST /api/projects/[id]/meetings` fra Task 5.

- [ ] **Step 1: Skriv `app/admin/projects/[id]/meeting/page.tsx`**

```tsx
'use client'

import { useEffect, useState, use } from 'react'

interface Meeting {
  id: string
  meet_link: string
  title: string
  status: string
  created_at: string
}

export default function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params)
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadMeetings() {
    setLoading(true)
    const res = await fetch(`/api/projects/${projectId}/meetings`)
    if (res.ok) {
      const data = await res.json()
      setMeetings(data.meetings)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadMeetings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function handleCreate() {
    setCreating(true)
    setError(null)
    const res = await fetch(`/api/projects/${projectId}/meetings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Møte' }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Klarte ikke opprette møte')
      setCreating(false)
      return
    }
    await loadMeetings()
    setCreating(false)
  }

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold mb-4" style={{ color: '#181920' }}>Videomøter</h1>

      <button
        onClick={handleCreate}
        disabled={creating}
        className="rounded-md px-4 py-2 text-white disabled:opacity-50"
        style={{ backgroundColor: '#7C5CFC' }}
      >
        {creating ? 'Oppretter…' : 'Opprett møte'}
      </button>

      {error && <p className="text-red-600 mt-2 text-sm">{error}</p>}

      <div className="mt-6 space-y-3">
        {loading && <p>Laster…</p>}
        {!loading && meetings.length === 0 && <p className="text-gray-500">Ingen møter opprettet ennå.</p>}
        {meetings.map((m) => (
          <div key={m.id} className="border rounded-md p-3 flex items-center justify-between">
            <div>
              <p className="font-medium">{m.title}</p>
              <a href={m.meet_link} target="_blank" rel="noopener noreferrer" className="text-sm underline" style={{ color: '#7C5CFC' }}>
                {m.meet_link}
              </a>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(m.meet_link)}
              className="text-sm border rounded px-2 py-1"
            >
              Kopier lenke
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

*Merk: fargene `#181920`/`#7C5CFC` er admin-fargepaletten fra `lib/admin-theme.ts` — ikke bland med den offentlige `/p/*`-paletten (se prosjektminne "To design-systemer"). Sjekk `lib/admin-theme.ts` for om det finnes ferdige klasser/konstanter å bruke i stedet for hardkodede hex-verdier her.*

- [ ] **Step 2: Legg til navigasjonslenke til fanen**

Åpne filen som lenker til `/quote`-fanen (finn med `grep -rn "projects/\${.*}/quote\"" app/admin` eller tilsvarende) og legg til en tilsvarende lenke til `/admin/projects/${id}/meeting` med tekst "Møte".

- [ ] **Step 3: Manuell verifisering**

```bash
npm run dev
```

Naviger til `/admin/projects/<en-ekte-id>/meeting` i nettleseren, trykk "Opprett møte", bekreft at en lenke dukker opp og at den faktisk åpner et Google Meet-rom når du klikker den.

- [ ] **Step 4: Commit**

```bash
git add app/admin/projects/[id]/meeting/page.tsx
git commit -m "feat: admin-UI for å opprette og liste videomøter"
```

---

### Task 7: Offentlig "Bli med i møte"-knapp

**Files:**
- Create: `app/api/projects/[id]/meetings/join/route.ts`
- Modify: `app/p/[token]/PublicProjectClient.tsx`

**Interfaces:**
- Consumes: tabellene `project_shares` og `project_meetings`.
- Produces: `POST /api/projects/[id]/meetings/join` med body `{ shareToken }` → `{ meet_link: string, title: string } | { meeting: null }`.

- [ ] **Step 1: Skriv `app/api/projects/[id]/meetings/join/route.ts`**

```typescript
import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params
  const body = await req.json().catch(() => ({}))
  const shareToken = typeof body.shareToken === 'string' ? body.shareToken : null

  if (!shareToken) {
    return Response.json({ error: 'Mangler shareToken' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Samme mønster som app/api/contracts/sign/route.ts: verifiser at delelenken
  // faktisk peker på dette prosjektet før vi gir ut møtelenken.
  const { data: share, error: shareError } = await supabase
    .from('project_shares')
    .select('project_id')
    .eq('token', shareToken)
    .eq('project_id', projectId)
    .single()

  if (shareError || !share) {
    return Response.json({ error: 'Ugyldig delelenke for dette prosjektet' }, { status: 403 })
  }

  const { data: meeting } = await supabase
    .from('project_meetings')
    .select('meet_link, title')
    .eq('project_id', projectId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return Response.json({ meeting: meeting ?? null })
}
```

- [ ] **Step 2: Legg til knapp i `PublicProjectClient.tsx`**

Følg samme mønster som `select-addons`-kallet i denne filen (linje ~121-131: `useEffect` som POSTer med `{ projectId, shareToken }`). Legg til:

```typescript
const [meetingLink, setMeetingLink] = useState<string | null>(null)

useEffect(() => {
  if (!shareToken || !projectId) return
  fetch(`/api/projects/${projectId}/meetings/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shareToken }),
  })
    .then((res) => res.json())
    .then((data) => setMeetingLink(data.meeting?.meet_link ?? null))
    .catch(() => setMeetingLink(null))
}, [shareToken, projectId])
```

Og render knappen der det gir mening i den cinematiske offentlige designen (farger fra det offentlige designsystemet — `#0C0B09`/`#C49434`, IKKE admin-paletten — se prosjektminne "To design-systemer"):

```tsx
{meetingLink && (
  <a
    href={meetingLink}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-block rounded-md px-6 py-3 font-medium"
    style={{ backgroundColor: '#C49434', color: '#0C0B09' }}
  >
    Bli med i møte
  </a>
)}
```

*Finn eksakt plassering (hvilken seksjon/komponent) ved å se hvor andre lignende call-to-action-elementer rendres i samme fil, og match eksisterende layout-mønster i stedet for å bare dumpe den øverst.*

- [ ] **Step 3: Manuell verifisering**

Opprett et møte for et testprosjekt via admin-UI (Task 6), hent prosjektets offentlige delelenke, åpne den i inkognitovindu, og bekreft at "Bli med i møte"-knappen vises og lenker til riktig Google Meet-rom. Test også med en ugyldig/utløpt `shareToken` (jf. prosjektminne om å teste write-endepunkter med ugyldig token, ikke ekte data) og bekreft `403`.

- [ ] **Step 4: Commit**

```bash
git add app/api/projects/[id]/meetings/join/route.ts "app/p/[token]/PublicProjectClient.tsx"
git commit -m "feat: legg til offentlig \"bli med i møte\"-knapp på delt prosjektside"
```

---

## Rekkefølge og avhengigheter

Task 1 → 2 → 3 → 4 → 5 → 6 og 7 (6 og 7 kan gjøres i valgfri rekkefølge etter Task 5, begge er uavhengige konsumenter av samme API). Task 1 og 2 kan gjøres parallelt hvis to personer jobber på dette.
