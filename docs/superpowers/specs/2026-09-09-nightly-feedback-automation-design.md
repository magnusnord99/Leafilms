# Nattlig automatisk feedback-triage — Design spec

**Dato:** 2026-09-09
**Status:** Godkjent av Magnus (retning: full autonomi inkl. deploy)

## Bakgrunn

`/feedback`-skillet (`.claude/skills/feedback/`) er en manuell arbeidsflyt Magnus/Claude
kjører interaktivt: liste opp åpne saker fra `feedback`-tabellen, vurdere hver sak, fikse
de klare/avgrensede, deploye, og løse saken i databasen (som varsler innmelderen).

Magnus vil ha dette til å kjøre av seg selv hver kveld, uavhengig av om noen
terminal-sesjon er åpen. `CronCreate` (Claude Code sin innebygde scheduler) er
sesjonsbundet og utløper etter 7 dager — ikke egnet for en varig løsning. Dette
krever i stedet en ordentlig GitHub Actions cron-jobb som kjører Claude Code
headless via Anthropics offisielle `claude-code-action`.

## Mål

- En GitHub Actions-workflow som trigges på en cron-schedule (kveld, norsk tid),
  helt uavhengig av lokale terminal-sesjoner.
- Jobben kjører den samme vurderingen som er brukt interaktivt denne sesjonen:
  klar/avgrenset sak → fiks, commit, merge, deploy, løs saken. Krever saken et reelt
  designvalg (uklar UX, flere rimelige tolkninger) → la den stå urørt i tabellen,
  ikke gjett.
- **Full autonomi godkjent av Magnus** — ingen menneskelig godkjenning kreves før
  merge eller deploy for saker jobben selv vurderer som trygge. Det eneste
  sikkerhetsnettet er jobbens egen verifisering (typecheck/lint) — feiler den,
  stoppes alt før merge/deploy.

## Arkitektur

```
GitHub Actions (schedule: cron, UTC)
  └─ actions/checkout (main)
  └─ setup-node + npm ci
  └─ anthropics/claude-code-action
        prompt: .github/prompts/nightly-feedback.md
        (kjører i repo-rot, samme verktøy som lokal Claude Code)
  └─ [jobben selv, styrt av prompten]:
       1. npm run feedback:list → åpne saker
       2. Per sak: vurder mot samme bar som /feedback-skillet (steg 2)
          - Klar/avgrenset → implementer (følg CLAUDE.md-konvensjoner)
          - Uklar/designvalg → hopp over, ikke rør
       3. npx tsc --noEmit + npx eslint på berørte filer
          - Feiler noe → stopp HELT (ingen merge/deploy), logg hvorfor i jobb-loggen
       4. git add <spesifikke filer> (aldri -A), commit per sak
       5. Push til en egen branch (nightly-feedback-YYYY-MM-DD), åpne PR, merge
          umiddelbart (ingen ekstern godkjenning — PR-en er kun revisjonsspor)
       6. ./deploy.sh
       7. tsx scripts/feedback-resolve.ts <id> "<norsk svar>" per løst sak
```

### Hvorfor `claude-code-action` og ikke en hjemmesnekret `claude -p`-kommando

Anthropics egen GitHub Action er bygget nettopp for headless/CI-bruk av Claude
Code — den håndterer autentisering, verktøytilgang og output-parsing på en måte
en manuell `claude -p`-kommando i en workflow-step ikke gjør ut av boksen. Bruk
den fremfor å reimplementere det samme.

### Secrets — Magnus setter disse selv

Jeg (Claude) skriver aldri API-nøkler/tokens inn i noe felt eller `gh secret set`
selv — det er eksplisitt utenfor hva jeg gjør, uavhengig av kontekst. Magnus må
legge inn disse i repoets GitHub-secrets (Settings → Secrets and variables →
Actions), enten via UI eller `gh secret set <NAVN>` i sin egen terminal:

| Secret | Kilde |
|---|---|
| `ANTHROPIC_API_KEY` | Ny nøkkel fra console.anthropic.com — **fakturert separat fra Claude-abonnementet**, egen kostnad å følge med på |
| `NEXT_PUBLIC_SUPABASE_URL` | Samme verdi som i `.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Samme verdi som i `.env.local` |
| `SUPABASE_SERVICE_ROLE_KEY` | Samme verdi som i `.env.local` |
| `OPENAI_API_KEY` | Samme verdi som i `.env.local` |
| `QUOTE_API_URL` / `QUOTE_API_TOKEN` | Samme verdi som i `.env.local` |
| `GCP_SA_KEY` | Ny service account-nøkkel (JSON) i prosjekt `smoringauto` med `Cloud Run Admin` + `Cloud Build Editor` — Magnus oppretter denne i GCP Console (IAM → Service Accounts) |

`GITHUB_TOKEN` (innebygd, ingen oppsett nødvendig) brukes til å committe/pushe/
merge PR-en — workflowen ber om `contents: write` + `pull-requests: write`.

### Schedule

`13 0 * * *` (UTC) — ca. kl. 02:13 norsk sommertid / 01:13 vintertid. Off-minutt
med vilje (unngår GH Actions' kjente forsinkelser rundt hele/halve timer).

### Feilhåndtering

- `tsc`/`eslint` feiler på en enkelt sak → hopp over akkurat den saken, fortsett
  med resten (ikke la én dårlig sak blokkere natten).
- `tsc`/`eslint` feiler etter at ALLE saker er implementert (integrasjonsfeil
  mellom to isolert sett gyldige fikser) → ikke merge noe denne runden, logg
  hvilke saker som ble forsøkt og hvorfor det ble stoppet.
- `./deploy.sh` feiler → PR-en er allerede merget til main (koden er trygg —
  samme typecheck/lint-bar som alltid), men ingen feedback-saker løses/varsles
  siden endringen ikke er live. Neste natts kjøring (eller Magnus manuelt) kan
  prøve deploy på nytt.
- Git-hygiene følger samme regel som `/feedback`-skillet: `git status --short`
  før noe røres; uventede endringer i arbeidstreet (en annen prosess/sesjon
  midt i noe) → ikke fortsett denne natten, logg og avslutt.

### Ikke i scope

- Ingen Slack/e-post-varsling til Magnus om natten — han sjekker PR-historikk/
  feedback-tabellen når han vil. (Kan legges til senere om ønskelig.)
- Ingen endring av selve `/feedback`-skillet eller `feedback-list.ts`/
  `feedback-resolve.ts` — nattjobben bruker dem som de er.
- Ingen automatisk `git worktree`-isolasjon — jobben kjører i en frisk
  Actions-runner (allerede isolert per kjøring), trenger ikke worktree-mønsteret
  lokale sesjoner bruker.
