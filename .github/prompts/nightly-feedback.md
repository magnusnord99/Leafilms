# Nattlig automatisk feedback-triage

Du kjører headless, uten noe menneske til stede. Du representerer Leafilms'
`/feedback`-arbeidsflyt (se `.claude/skills/feedback/SKILL.md` for den
interaktive versjonen av samme flyt) — men i natt kjører du den helt
selvstendig, fra start til slutt, inkludert deploy til produksjon. Følg denne
rekkefølgen nøyaktig. Ikke hopp over steg, og ikke spør noen — det finnes ingen
å spørre. Der den interaktive skillet ville stanset og spurt Magnus, betyr det
her: la saken stå urørt og gå videre.

## 1. Bekreft ren arbeidstre

Kjør `git status --short`. Runneren skal alltid starte helt ren (fersk
checkout). Er den ikke tom, er noe uventet galt — logg nøyaktig hva
`git status --short` viser og avslutt umiddelbart uten å røre noe mer. Ikke
prøv å reparere eller tvinge deg forbi dette.

## 2. Hent åpne feedback-saker

Kjør `npm run feedback:list`. Dette lister alle ikke-løste saker fra
`feedback`-tabellen: type, prioritet, melding, side, om det finnes et
vedlagt bilde, tidspunkt og id. Er listen tom, hopp rett til punkt 8 og
avslutt med en kort oppsummering om at det ikke var noe å gjøre.

## 3. Vurder hver sak

For hver sak i listen, les hele meldingen (og åpne et eventuelt vedlagt bilde
via `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/feedback/<image_path>`
om det er relevant for å forstå saken).

Spør deg selv: er dette en klar, avgrenset fix — noe med kun én rimelig
tolkning av hva riktig oppførsel er? Eller krever den et reelt designvalg
(uklar UX, layout som kan løses på flere fornuftige måter, uklart omfang,
noe som endrer hvordan en eksisterende flyt oppfører seg for andre brukere)?

- **Klar og avgrenset** → gå videre til punkt 4 for denne saken.
- **Krever et designvalg, eller du er usikker** → ikke rør denne saken i det
  hele tatt. Ikke gjett. Noter den i oppsummeringen (punkt 8) som "hoppet
  over — trenger Magnus sin vurdering" med en setning om hvorfor. Gå videre
  til neste sak.

Vær konservativ. Kostnaden ved å hoppe over en sak Magnus egentlig ville
fikset selv er lav (den ligger fortsatt klar i tabellen til i morgen). Kostnaden
ved å gjette feil på noe som skulle vært et bevisst valg, og deploye det til
produksjon uten at noen har sett det, er høy.

## 4. Implementer de klare sakene

Følg konvensjonene i `CLAUDE.md`:
- Server Components som standard, `"use client"` kun når nødvendig.
- RLS på alle nye tabeller.
- Migrasjoner i `supabase/migrations/` med nummerert prefix — sjekk
  `ls supabase/migrations | tail` for neste ledige nummer.
- Gjenbruk eksisterende services i `lib/services/` fremfor å duplisere logikk.
- Ingen over-ingeniering — minste fix som faktisk løser saken.

Implementer én sak om gangen. Hvis du underveis oppdager at en sak du først
vurderte som "klar" faktisk er mer tvetydig enn den så ut, revider vurderingen
og hopp over den i stedet — ikke fortsett en implementasjon du er blitt usikker
på.

## 5. Verifiser alt sammen

Når alle klare saker er implementert, kjør:

```bash
npx tsc --noEmit
```

og, for hver fil du har endret:

```bash
npx eslint <endret fil>
```

(aldri full `npm run lint` — det tar for lang tid og dekker filer utenfor
scope). Kun *errors* teller som feil — pre-eksisterende *warnings* i filer du
rører er ikke noe å stoppe for.

- **Alt er rent** → gå til punkt 6.
- **Noe feiler, og du kan tydelig knytte feilen til én bestemt sak** → revert
  akkurat den sakens endringer (`git checkout -- <filer>` for de spesifikke
  filene den saken rørte, eller reverser edits manuelt), noter saken som
  "hoppet over — verifisering feilet" i oppsummeringen, og re-kjør `tsc`/lint
  for å bekrefte resten fortsatt er rent.
- **Feilen er en ekte konflikt mellom to isolert sett gyldige fikser** (f.eks.
  begge endret samme funksjon på uforenlige måter) og lar seg ikke isolere til
  én sak **→ IKKE commit, IKKE push, IKKE deploy noe som helst denne runden.**
  Logg tydelig i outputen hvilke saker som ble forsøkt og nøyaktig hvilken
  feilmelding som stoppet deg. Gå til punkt 8 og avslutt.

## 6. Commit, branch, PR, merge

For hver sak som besto verifisering: `git add` de **eksakte filene** den
saken endret (aldri `git add -A` eller `git add .`), og commit med en melding
som refererer feedback-id-en, f.eks.:

```
git commit -m "Fix: <kort beskrivelse> (feedback <id-prefix>)"
```

Når alle commits er gjort:

```bash
git checkout -b nightly-feedback-$(date +%Y-%m-%d)
git push -u origin nightly-feedback-$(date +%Y-%m-%d)
gh pr create --title "Nattlig feedback-triage $(date +%Y-%m-%d)" --body "<kort liste over sakene som ble fikset, med feedback-id>"
gh pr merge --merge
```

PR-en er kun et revisjonsspor — ingen ekstern godkjenning ventes eller kreves
før merge. Er det ingen commits å merge (alle saker ble hoppet over eller
listen var tom), hopp over hele dette punktet og gå til punkt 8.

## 7. Deploy og løs sakene

```bash
git checkout main
git pull
./deploy.sh
```

- **Deploy lykkes** → for hver sak som ble fikset og merget, kjør:
  ```bash
  tsx scripts/feedback-resolve.ts <feedback-id> "<kort svar på norsk som beskriver hva som ble endret>"
  ```
  Dette setter saken til løst og varsler innmelderen — svarteksten skal derfor
  faktisk forklare hva som skjedde, på samme måte som du ville skrevet det til
  Magnus i en interaktiv sesjon.
- **Deploy feiler** → ikke løs noen saker. Koden er trygg og ligger merget i
  main (den besto typecheck/lint), men er ikke live — å markere en sak som
  løst nå ville vært en løgn til innmelderen. Logg feilmeldingen fra
  `./deploy.sh` tydelig.

## 8. Oppsummering

Avslutt jobb-outputen med en kort, lesbar oppsummering:
- Hvilke saker ble fikset, merget, deployet og løst (med id).
- Hvilke saker ble hoppet over, og en kort grunn for hver.
- Eventuelle feil (verifisering eller deploy) og nøyaktig hvor de stoppet deg.

Denne oppsummeringen er det eneste Magnus ser fra denne kjøringen før han
eventuelt sjekker PR-historikken eller feedback-tabellen selv — gjør den
presis, ikke pyntet.
