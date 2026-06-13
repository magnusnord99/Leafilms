# Leafilms — Systemflyt

## Overordnet prinsipp

Alle meningsfulle handlinger har sin egen side (endepunkt). Ingen viktige funksjoner skjules i popups eller inline-paneler. Systemet er bygget rundt én fast pipeline som alle prosjekter følger — og hvert pipeline-steg har sin primæraksjon.

---

## Pipeline

```
Lead → Møte → Sende tilbud → Kontrakt → Pre-produksjon → Produksjon → Post-produksjon → Levering → Fakturert → Videresalg
```

Hvert steg har:
- Faste oppgavemaler som seedes automatisk første gang et prosjekt entrer steget
- En primæraksjon (se under)
- Automatisk fremgang til neste steg når alle oppgaver er fullført

---

## Primæraksjon per steg

| Steg | Primæraksjon | Destinasjon |
|------|-------------|-------------|
| Lead | Ta kontakt | Prosjekt-hub (kontaktinfo) |
| Møte | Send møtelink | `/email` — AI genererer invitasjon |
| Sende tilbud | Send tilbud | `/email` — AI genererer tilbudsmail + pitch-link |
| Kontrakt | Send kontrakt | `/contract` — kontrakthåndtering |
| Pre-produksjon | Oppgaver | Prosjekt-hub oppgaveliste |
| Produksjon | Oppgaver | Prosjekt-hub oppgaveliste |
| Post-produksjon | Oppgaver | Prosjekt-hub oppgaveliste |
| Levering | Lever materiale | Prosjekt-hub |
| Fakturert | Send faktura | Fremtidig faktura-integrering |
| Videresalg | Send oppfølging | `/email` — AI genererer videresalgsmail |

---

## Endepunkter

### `/admin/pipeline`
Kanban-oversikt over alle prosjekter gruppert per pipeline-steg.
- Horisontal scroll, én kolonne per steg
- Prosjektkort med stage-spesifikk primærknapp
- "→ Neste steg"-knapp på hvert kort
- Listevisning tilgjengelig via `/admin/projects`

### `/admin/leads`
CRM for potensielle kunder som ennå ikke er blitt prosjekter.
- Legg til, rediger og følg opp leads
- Send e-post direkte fra lead-kortet
- Konverter lead → prosjekt med ett klikk (prosjektet starter i Lead-steget)
- *(Iterasjon 2)*

### `/admin/projects/[id]`
**Prosjekt-hubben** — navet for hvert enkelt prosjekt.
- Viser nåværende pipeline-steg med visuell fremgang
- Oppgaveliste for nåværende steg (sjekkliste)
- Hurtiglenker til alle underendepunkter
- Tabs: Oversikt | Pitch & Tilbud | Kontrakt

### `/admin/projects/[id]/pitch`
**Prosjektbeskrivelse-editoren** — der innholdet i pitchen bygges.
- Redigerer seksjoner, tekst, bilder og videoer
- Tilgang til cases-bibliotek for inspirasjon
- Tilgang til priskatalog for prissetting
- Tilgang til teambiblioteket
- Publiser → genererer unik kundelink (`/p/[token]`)
- *(Eksisterende editor fra `/edit` integreres her)*

### `/admin/projects/[id]/email`
**E-postsiden** — all kommunikasjon med kunden herfra.
- Viser riktig e-posttype basert på pipeline-steg
- AI genererer utkast fra prosjektinfo automatisk
- Redigerbart emne og brødtekst
- Relevante felter per type (møtelink-input, pitch-link osv.)
- Logg over tidligere sendte e-poster
- Send via Resend (eget domene: `post@leafilms.no`)

### `/admin/projects/[id]/quote`
**Tilbudsbyggeren** — priser og betingelser.
- Eksisterer allerede
- Linjeposter med timesatser og utstyr
- PDF-generering
- Kobles automatisk til pitch via prosjekt-ID

### `/admin/projects/[id]/contract`
**Kontrakthåndtering** — signeringsflyt.
- Genererer kontrakt fra tilbudsdata
- Sending til kunde for signering
- Sporer signeringsstatus
- *(Iterasjon 2/3)*

---

## Dataflyten

```
LEAD (CRM)
  │
  └─ konverteres til ──► PROSJEKT
                              │
                    ┌─────────┼──────────────┐
                    │         │              │
                  PITCH    TILBUD        KONTRAKT
                 (editor)  (priser)     (signering)
                    │         │
                    └────┬────┘
                         │
                    E-POST (/email)
                    AI genererer fra prosjektdata
                    Sendes via Resend
                         │
                    EMAIL_LOG
                    (alle sendte e-poster lagres)
```

---

## E-postflyt (kjerneprinsipp)

All e-post følger samme mønster gjennom hele pipeline:

1. Bruker navigerer til `/admin/projects/[id]/email`
2. System leser pipeline-steg og henter prosjektdata
3. AI (`claude-sonnet-4-6`) genererer emne + brødtekst
4. Bruker leser over og justerer
5. Bruker sender — e-post går via Resend
6. Sending logges i `email_log`-tabellen
7. Oppgave for steget markeres fullført
8. Pipeline kan gå videre til neste steg

**Fremtidig:** møtelink genereres automatisk via Google Meet API.

---

## Automatikk

| Trigger | Handling |
|---------|---------|
| Prosjekt entrer nytt steg | Oppgavemaler seedes automatisk fra `task_templates` |
| Alle oppgaver i steg er fullført | Pipeline kan avanseres til neste steg |
| Pitch publiseres | Unik kundelink genereres (`/p/[token]`) |
| E-post sendes | Logges i `email_log`, oppgave markeres ferdig |

---

## Database (nøkkeltabeller)

| Tabell | Formål |
|--------|--------|
| `projects` | Alle prosjekter med `pipeline_stage` og `pipeline_data` (JSONB) |
| `customers` | Kundedata — kobles til prosjekter |
| `leads` | CRM — potensielle kunder før de blir prosjekter |
| `tasks` | Oppgaver per prosjekt og pipeline-steg |
| `task_templates` | Standard oppgaver per steg — seedes ved stegbytte |
| `quotes` | Tilbudsdata med priser og betingelser |
| `contracts` | Kontrakter med signeringsstatus |
| `email_log` | Alle e-poster sendt fra systemet |
| `project_shares` | Unike tokens for offentlige pitch-lenker |

---

## Teknisk stack

- **Framework:** Next.js 16 App Router
- **Database:** Supabase (PostgreSQL + RLS)
- **Auth:** Supabase Auth
- **E-post:** Resend (`post@leafilms.no`)
- **AI:** Anthropic Claude (`claude-sonnet-4-6`) — e-postutkast, markedsanalyse
- **Hosting:** Vercel
- **Design:** Cinematic warm dark — Cormorant Garamond + DM Sans
