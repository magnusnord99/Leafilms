# Nattlig automatisk feedback-triage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En GitHub Actions cron-workflow som hver natt kjører Claude Code headless (via `anthropics/claude-code-action@v1`) gjennom en full `/feedback`-triage: fikser klare/avgrensede saker, deployer, og løser dem i databasen — uten menneskelig godkjenning, med typecheck/lint som eneste sikkerhetsnett.

**Architecture:** Ett workflow-steg leser en prompt-fil (`.github/prompts/nightly-feedback.md`) inn i en multiline step-output, og sender den videre som `prompt`-input til `claude-code-action`. Selve logikken (vurdere saker, implementere, verifisere, committe, deploye, løse) ligger i prompt-filen — workflowen er kun oppsett (checkout, Node, GCP-auth) + selve action-kallet med bred Bash-tilgang.

**Tech Stack:** GitHub Actions, `anthropics/claude-code-action@v1`, `google-github-actions/auth@v2` (GCP-autentisering for deploy), eksisterende `npm run feedback:list` / `tsx scripts/feedback-resolve.ts`.

**Spec:** `docs/superpowers/specs/2026-09-09-nightly-feedback-automation-design.md`

## Global Constraints

- Cron: `13 0 * * *` (UTC, ca. 02:13 norsk tid) — verbatim fra specen.
- Full autonomi godkjent av Magnus: ingen manuell godkjenning før merge/deploy for saker jobben selv vurderer som trygge.
- Jeg (Claude, i denne sesjonen) skriver ALDRI faktiske secret-verdier inn noe sted — verken i filer, `gh secret set`, eller chat. Kun secret-NAVN refereres i workflow-YAML-en (`${{ secrets.X }}`).
- Secrets som trengs (Magnus setter selv, se spec): `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `QUOTE_API_URL`, `QUOTE_API_TOKEN`, `GCP_SA_KEY`.
- Prompt-filens instruksjoner må speile samme vurderingsbar som `.claude/skills/feedback/SKILL.md` steg 2 ("er dette en klar, avgrenset fix... hvis vagt, hopp over") — men uten muligheten til å stoppe og spørre (ingen menneske er der), så "spør Magnus" blir "ikke rør denne saken, la den stå urørt i tabellen."
- Typecheck (`npx tsc --noEmit`) og targeted eslint er eneste automatiserte gate — feiler den, ingen merge/deploy denne runden (se spec § Feilhåndtering for nøyaktig oppførsel per feil-scenario).
- Ingen automatisk test-runner finnes i repoet (bekreftet i tidligere specs samme mønster) — ikke innfør en som del av denne planen.

---

### Task 1: Prompt-fil for nattjobben

**Files:**
- Create: `.github/prompts/nightly-feedback.md`

**Interfaces:**
- Produces: en markdown-fil med fullstendige instruksjoner til Claude Code (kjørt headless av Task 2 sin workflow) — konsumeres av workflowen som rå tekst, ikke av annen kode.

- [x] **Step 1: Skriv prompt-filen**

Filen skal instruere den headless kjøringen til å, i rekkefølge:

1. Kjør `git status --short`. Er arbeidstreet ikke tomt (uventet — runneren skal alltid være ren), stopp og logg hvorfor uten å røre noe mer.
2. Kjør `npm run feedback:list` (evt. `tsx scripts/feedback-list.ts` direkte) for å hente åpne saker.
3. For hver sak, vurder mot nøyaktig samme bar som `.claude/skills/feedback/SKILL.md` steg 2 beskriver: er det en klar, avgrenset fix uten reelle designvalg? Hvis noe er uklart eller har mer enn én rimelig tolkning — IKKE implementer, IKKE rør saken, gå videre til neste. Det finnes intet menneske å spørre i natt.
4. For hver sak som er klar: implementer etter konvensjonene i `CLAUDE.md` (Server Components default, RLS på nye tabeller, migrasjoner nummerert under `supabase/migrations/`, gjenbruk `lib/services/`).
5. Etter at ALLE klare saker er implementert: kjør `npx tsc --noEmit` og `npx eslint <berørte filer>` (aldri full `npm run lint`). Feiler noe:
   - Isoler hvilken sak som forårsaket feilen om mulig (revert den enkeltvis og re-kjør), fortsett med resten.
   - Hvis feilen ikke lar seg isolere til én sak (ekte integrasjonskonflikt mellom to isolert sett gyldige fikser) — ikke commit/merge/deploy NOE denne runden. Logg tydelig i jobb-output hvilke saker som ble forsøkt og hvorfor det ble stoppet. Avslutt.
6. For saker som besto verifisering: `git add <eksakte filer>` (aldri `-A`), ett commit per sak med melding som refererer feedback-id-en (samme mønster som skillets steg 5).
7. Push til en ny branch `nightly-feedback-<YYYY-MM-DD>`, opprett PR mot `main` med `gh pr create`, merge den umiddelbart med `gh pr merge --merge` (PR-en er kun revisjonsspor, ingen ekstern godkjenning ventes).
8. Kjør `./deploy.sh` fra reponot (etter at branchen er merget til main lokalt/i checkout — `git checkout main && git pull`).
9. Feiler deploy: IKKE kjør `feedback-resolve.ts` for noen sak denne runden (koden er trygg og merget, men ikke live — å løse saken nå ville løyet til innmelderen). Logg feilen tydelig.
10. Lykkes deploy: for hver sak som ble fikset, kjør `tsx scripts/feedback-resolve.ts <feedback-id> "<kort norsk svar som beskriver hva som ble endret>"`.
11. Avslutt med en kort oppsummering i jobb-output: hvilke saker ble løst, hvilke ble hoppet over (og hvorfor kort), eventuelle feil.

Skriv dette som løpende, presis prose i filen — ikke som pseudokode. Ikke bruk plassholdere.

- [x] **Step 2: Commit**

```bash
git add .github/prompts/nightly-feedback.md
git commit -m "Legg til prompt for nattlig automatisk feedback-triage"
```

---

### Task 2: GitHub Actions-workflow

**Files:**
- Create: `.github/workflows/nightly-feedback.yml`

**Interfaces:**
- Consumes: `.github/prompts/nightly-feedback.md` (Task 1) — lest inn som step-output og sendt til `claude-code-action`s `prompt`-input.
- Produces: selve schedule-triggeret workflow-kjøringen. Ingen kode andre tasks konsumerer (siste task i planen).

- [x] **Step 1: Skriv workflow-filen**

```yaml
name: Nightly Feedback Triage

on:
  schedule:
    - cron: '13 0 * * *'
  workflow_dispatch: {}

permissions:
  contents: write
  pull-requests: write

jobs:
  triage:
    runs-on: ubuntu-latest
    timeout-minutes: 45
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Authenticate to GCP (for ./deploy.sh)
        uses: google-github-actions/auth@v2
        with:
          credentials_json: '${{ secrets.GCP_SA_KEY }}'

      - name: Set up gcloud CLI
        uses: google-github-actions/setup-gcloud@v2

      - name: Configure git identity
        run: |
          git config user.name "leafilms-nightly-bot"
          git config user.email "noreply@leafilms.no"

      - name: Load nightly prompt
        id: prompt
        run: |
          {
            echo 'text<<NIGHTLY_PROMPT_EOF'
            cat .github/prompts/nightly-feedback.md
            echo 'NIGHTLY_PROMPT_EOF'
          } >> "$GITHUB_OUTPUT"

      - uses: anthropics/claude-code-action@v1
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          QUOTE_API_URL: ${{ secrets.QUOTE_API_URL }}
          QUOTE_API_TOKEN: ${{ secrets.QUOTE_API_TOKEN }}
          GH_TOKEN: ${{ github.token }}
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: ${{ steps.prompt.outputs.text }}
          claude_args: |
            --allowedTools "Bash,Read,Write,Edit,Grep,Glob"
            --max-turns 120
```

Merk:
- `fetch-depth: 0` på checkout — trengs for at `git checkout main && git pull`/branch-opprettelse inni prompten skal ha full historikk.
- `GH_TOKEN` satt til `github.token` slik at `gh pr create`/`gh pr merge` inni den headless kjøringen fungerer uten ekstra oppsett.
- `--max-turns 120` er en grov øvre grense mot en løpsk kjøring — juster opp om jobben faktisk trenger flere runder for en natt med mange saker (se etter i jobb-loggen om den treffer taket).
- Alle env-variabler appen selv trenger (Supabase, OpenAI, quote-API) må være satt i jobbens miljø siden `./deploy.sh` og eventuelle Next.js-scripts leser dem direkte — de settes IKKE av `claude-code-action` selv.

- [x] **Step 2: Typecheck YAML-syntaks**

Ingen `npx tsc`-relevans for en YAML-fil. Verifiser i stedet med:

```bash
python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/nightly-feedback.yml'))" && echo "YAML gyldig"
```

Forventet: `YAML gyldig`, ingen parse-feil.

- [x] **Step 3: Commit**

```bash
git add .github/workflows/nightly-feedback.yml
git commit -m "Legg til nattlig GitHub Actions-workflow for automatisk feedback-triage"
```

---

## Etter implementasjon (ikke en del av denne planens tasks — manuelt av Magnus)

1. Legg inn de 7 secrets-ene fra specen i repo-settings (Settings → Secrets and variables → Actions).
2. Første kjøring bør trigges manuelt via `workflow_dispatch` (Actions-fanen → "Nightly Feedback Triage" → "Run workflow") og overvåkes, i stedet for å vente til kl. 02:13 uten tilsyn — fanger opp ev. secret-oppsett-feil raskt.
