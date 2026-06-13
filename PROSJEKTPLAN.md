# Leafilms — Intern Plattform: Prosjektplan

## Visjon

Erstatte ClickUp med ett samlet internt system for Leafilms. Alt skal henge sammen — leads, prosjekter, tilbud, oppgaver, kommunikasjon med kunder — i én plattform. Ingen løse ender, ingen systemer som ikke snakker med hverandre.

---

## Pipeline (fast for alle prosjekter)

```
Lead → Møte → Tilbud sendt → Kontrakt → Pre-prod → Produksjon → Post-prod → Levering → Fakturert → Videresalg
```

Hvert steg har:
- Faste oppgave-maler som opprettes automatisk
- Kobling til relevante handlinger (sende tilbud, signere kontrakt, sende faktura osv.)
- Automatisk fremgang til neste steg når alle oppgaver er fullført

---

## Systemets deler

### 1. Leads (CRM) — `/admin/leads`
Samler alle potensielle kunder før de blir et prosjekt.
- Logg kontakt og kommunikasjon
- Send e-post fra systemet
- Konverter lead til prosjekt med ett klikk
- Leads som ikke blir prosjekter forblir her (ryddig separasjon)

### 2. Pipeline — `/admin/pipeline`
Kanban-oversikt over alle aktive prosjekter, gruppert per pipeline-steg.
- Kanban-visning (standard)
- Listevisning (alternativ)
- Dra-og-slipp for å flytte prosjekter mellom steg (fremtidig)

### 3. Prosjekt-hub — `/admin/projects/[id]`
Navet for hvert prosjekt. Alt samlet på ett sted:
- Nåværende pipeline-steg + fremgang
- Oppgaver per steg
- Tilbud + prosjektbeskrivelse
- Kontrakt
- E-postlogg
- Teammedlemmer tilknyttet prosjektet

### 4. Tilbud + Prosjektbeskrivelse — `/admin/projects/[id]/pitch`
Henger tett sammen (slik det er i dag). Den interaktive prosjektbeskrivelsen sendes med tilbudet.
- Rediger pitch og priser
- Klikk **Publiser** → system genererer e-post med unik link
- Send e-posten fra systemet
- Handling markerer oppgaven ferdig → pipeline går videre til "Tilbud sendt"

### 5. Oppgaver — `/admin/projects/[id]/tasks`
Koblet til pipeline-steg. Oppgave-maler opprettes automatisk ved stegbytte.
- Assignee = innloggede Leafilms-brukere
- Status: Todo / I gang / Ferdig
- Prioritet: Lav / Medium / Høy
- Frist

### 6. E-post
Sendes via **Resend** — støtter eget domene (f.eks. `post@leafilms.no`) når dere er klare. Ingen omskriving av kode ved domenebytte.

---

## Workflow-prinsipp

Handlinger i systemet er koblet til oppgaver og pipeline. Eksempel på flyten for "Tilbud sendt":

```
1. Rediger prosjektbeskrivelse og tilbud
2. Klikk [Publiser]
3. System genererer e-postutkast med unik kundelink
4. Gjennomgå og send fra systemet
5. Oppgave "Send tilbud og prosjektbeskrivelse" → Ferdig
6. Pipeline-steg → "Tilbud sendt"
```

Dette mønsteret gjentar seg gjennom hele pipeline.

---

## Arkitektur

### URL-struktur
```
/admin/leads                      → CRM med e-post
/admin/pipeline                   → Kanban over alle prosjekter
/admin/projects                   → Listevisning (eksisterer, utvides)
/admin/projects/[id]              → Prosjekt-hub (ny)
/admin/projects/[id]/tasks        → Oppgaver per steg (ny)
/admin/projects/[id]/pitch        → Prosjektbeskrivelse admin (utvides)
/admin/projects/[id]/quote        → Tilbud (eksisterer)
/admin/projects/[id]/contract     → Kontrakt (utvides)
```

### Database — nye tabeller
| Tabell | Beskrivelse |
|---|---|
| `pipeline_stage` (kolonne på `projects`) | Nåværende steg i pipeline |
| `tasks` | Oppgaver per prosjekt og steg |
| `task_templates` | Faste oppgave-maler per pipeline-steg |
| `leads` | CRM-data, e-postlogg, kobling til prosjekt |
| `email_log` | Alle e-poster sendt fra systemet |

### Stack-tillegg
- **Resend** — e-postutsending
- **React Email** — e-postmaler med design

---

## Iterasjoner

### Iterasjon 1 — Prototype (nå)
Mål: få strukturen bekreftet med ekte data og fungerende flyt.

1. DB-migrasjon `040_`: `pipeline_stage`, `tasks`, `task_templates`, `leads`, `email_log`
2. `/admin/pipeline` — Kanban-visning av alle prosjekter
3. `/admin/projects/[id]` — Prosjekt-hub
4. Publish-flyt: pitch → e-post via Resend → pipeline-fremgang

### Iterasjon 2
- Leads CRM komplett med e-postintegrasjon
- Oppgave-maler automatisk ved stegbytte
- Kontrakt-håndtering

### Iterasjon 3
- Fullstendig e-post-logg per prosjekt
- Videresalg-automatisering
- Rapportering og statistikk

### Fremtidig
- Fakturaintegrasjon
- Kalender-visning
- Mobil-optimalisering

---

## Prinsipper

- **Alt henger sammen** — ingen løse moduler
- **Lean iterasjoner** — liten, solid leveranse før neste steg
- **Ingen over-ingeniering** — bygg for dagens behov, ikke hypotetisk fremtid
- **Ekte data fra start** — ingen testdata i produksjonssystemet
