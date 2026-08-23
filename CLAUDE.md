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
- `supabase/migrations/138_notification_urgency.sql` (legger til urgent-kolonne på notifications + de 5 meldingstabellene, og oppdaterer varsel-triggerne til å kopiere den — "Haster"-knappen i chattene har ingen effekt før denne er kjørt). Filen forsvant fra disk natt til 2026-08-12 (verken committet, stashet eller gjenfinnbar via git) og er skrevet på nytt 2026-08-12, rekonstruert fra trigger-funksjonenes siste kjente versjon i 099_notification_actions.sql/127_preprod_messages.sql (samme kilder migrasjonens egen kommentar viste til) — ikke fra løs hukommelse. Verifiser gjerne mot faktisk DB-tilstand (`pg_get_functiondef`) før kjøring siden den ble skrevet på nytt.
- `supabase/migrations/139_task_waiting_review.sql` (utvider tasks_status_check med 'waiting_review' + legger til gallery_reviews.task_id — postprod-steget (Selektering/Redigering) settes ikke til "venter på review" ved kollega-review før denne er kjørt). Samme situasjon som 138 — forsvant og ble skrevet på nytt 2026-08-12, denne gang fra en komplett kopi lest tidligere samme kveld, så høy tillit til at den er identisk med originalen.
- `supabase/migrations/140_admin_tasks_project_link.sql` (legger til project_id på admin_tasks — "Gjennomgå bildeutvalg"-oppgaven i /admin/internal viser ingen lenke til prosjektet før denne er kjørt)
- `supabase/migrations/141_ai_schema_introspection.sql` (legger til get_schema_context()-funksjon + noen COMMENT-er — intern AI-bot (lib/ai/chat.ts) bruker en statisk skjemabeskrivelse som fallback inntil denne er kjørt, se STATIC_SCHEMA_FALLBACK i lib/ai/schema-context.ts)
- `supabase/migrations/142_delivery_field_comments.sql` (dokumenterer delivery_video/delivery_photo for AI-boten, samme mønster som 141)
- `supabase/migrations/145_harden_leads_rls.sql` (staff-only RLS på leads/email_log — customer JWT kan lese/slette hele CRM-en og e-postarkivet inntil den er kjørt)

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
