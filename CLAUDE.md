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
- `supabase/migrations/136_task_turn_ready_notification.sql` (widener notifications_type_check — koden feiler stille inntil den er kjørt, se lib/actions/pipeline.ts)
- `supabase/migrations/137_delivery_galleries.sql` (legger til gallery_type-kolonne — "Send til kollega for godkjenning"-knappen på postprod-siden feiler inntil den er kjørt)
- ⚠️ `supabase/migrations/138_notification_urgency.sql` og `139_task_waiting_review.sql` — **filene mangler fra disk** (funnet under database-revisjon 2026-08-12, verken committet, stashet eller på annen måte gjenfinnbare via git). Koden forutsetter fortsatt at de er kjørt: `notifications.urgent`-kolonnen ("Haster"-knappen i chattene), `tasks.status = 'waiting_review'` (postprod-steg satt til "venter på review" ved kollega-review, se lib/actions/gallery-reviews.ts) og `gallery_reviews.task_id`. Disse tre tingene vil feile/være no-op inntil migrasjonene er skrevet på nytt og kjørt. Skriv dem på nytt (samme mønster som andre migrasjoner i denne mappen) før de kjøres — ikke anta at nummer 138/139 er reservert til noe annet.
- `supabase/migrations/140_admin_tasks_project_link.sql` (legger til project_id på admin_tasks — "Gjennomgå bildeutvalg"-oppgaven i /admin/internal viser ingen lenke til prosjektet før denne er kjørt)
- `supabase/migrations/141_ai_schema_introspection.sql` (legger til get_schema_context()-funksjon + noen COMMENT-er — intern AI-bot (lib/ai/chat.ts) bruker en statisk skjemabeskrivelse som fallback inntil denne er kjørt, se STATIC_SCHEMA_FALLBACK i lib/ai/schema-context.ts)
- `supabase/migrations/142_delivery_field_comments.sql` (dokumenterer delivery_video/delivery_photo for AI-boten, samme mønster som 141)

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
