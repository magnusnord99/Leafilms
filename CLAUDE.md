# Leafilms — Prosjektkontekst

## Hva vi bygger

Leafilms er en norsk filmproduksjonsbedrift. Vi bygger deres interne business-plattform — en Next.js web-app som erstatter ClickUp og samler alt på ett sted. Brukerne er Leafilms-teamet selv (interne ansatte).

## Stack

- **Framework:** Next.js 16 (App Router)
- **Database:** Supabase (PostgreSQL + RLS)
- **Auth:** Supabase Auth
- **Styling:** Tailwind CSS v4
- **Language:** TypeScript (strict mode)
- **AI:** `@anthropic-ai/sdk` + OpenAI SDK
- **Hosting:** Google Cloud Run (`deploy.sh`, service `leafilms-pitch` i prosjekt smoringauto, europe-north1). NB: det finnes et Vercel-prosjekt med git-integrasjon, men det har ingen miljøvariabler og er ikke ekte produksjon — cron-jobbene i `vercel.json` kjører derfor ikke.
- **Fonts:** Cormorant Garamond (headings) + DM Sans (body)
- **Design:** Cinematic warm dark palette — ingen generisk AI-estetikk

## Kodekonvensjoner

- Next.js App Router — server components by default, `"use client"` kun når nødvendig
- Tailwind CSS v4 — ingen `@apply` der det ikke er nødvendig
- Supabase med RLS — **alltid** sett opp RLS på nye tabeller
- Migrasjoner i `supabase/migrations/` med nummerert prefix — neste er `099_` (sjekk `ls supabase/migrations | tail` først; tallet her blir fort utdatert)
- Eksisterende services i `lib/services/` — ikke dupliser logikk
- Types i `lib/types.ts` — hold oppdatert ved endringer

## Uapplied migrasjoner (blokkert)

- `database-migrations/036_project_messages.sql`
- `database-migrations/037_market_analysis.sql`
- `database-migrations/039_pitch_feedback.sql`

Disse er skrevet men ikke kjort mot Supabase enna.

## Utviklingsfilosofi

- **Lean:** minste mulige feature som gir verdi, lever raskt, iterer
- **Kvalitet over hastighet:** gjør ting riktig første gang
- **Ingen over-ingeniering:** ikke bygg for hypotetisk fremtid
- **Eksisterende mønstre:** følg kodekonvensjoner som allerede er i bruk
- **Magnus er PO:** snakker norsk, vil ha konkrete anbefalinger fremfor åpne spørsmål

## Teamet

- **Team Lead (denne sesjonen):** koordinerer, delegerer, rapporterer til Magnus
- **Kai** — Frontend Developer
- **Nova** — Backend/Fullstack Developer
- **Lena** — Tech Lead / Code Reviewer
