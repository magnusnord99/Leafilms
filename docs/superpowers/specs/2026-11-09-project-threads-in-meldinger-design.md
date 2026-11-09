# Prosjekttråder i Meldinger

## Hensikt

I dag er "Meldinger" (`/admin/meldinger`) kun direktemeldinger (1:1-samtaler).
Samtidig finnes det syv andre steder i appen der man kan skrive meldinger
knyttet til et prosjekt, en oppgave, et tilbud eller en lead — men disse
lever kun inni den aktuelle siden, som en flytende chat-knapp man må finne
igjen manuelt. Hvis man har svart i en slik tråd og vil finne den igjen
senere, må man huske/gjette hvilken side den lå på.

Målet er at alle tråder man er en del av (fordi man er tildelt, @nevnt,
eller har skrevet der selv — avledet direkte av hvem som allerede får
varsler om tråden i dag) blir søkbare/synlige på ett sted: en ny seksjon
i Meldinger, tydelig skilt fra direktemeldinger. Å klikke en tråd tar deg
tilbake til riktig side med riktig panel åpnet — man svarer der tråden
faktisk bor, ikke inline i Meldinger.

## Mål

- Alle 7 trådtyper (se under) samlet i én liste i Meldinger, sortert
  etter siste aktivitet, med uleste-tall per tråd.
- Tydelig visuelt skilt fra direktemeldinger (egen seksjon/fane).
- Klikk på en tråd navigerer til riktig side og åpner riktig panel
  automatisk (gjenbruk av eksisterende `?chat=1`/`?task=X&chat=1`-mønster).
- Ingen nye databasetabeller eller migrasjoner — bygges på data som
  allerede finnes (`notifications`, `conversations`, prosjekt/task/quote-
  titler).
- Meldinger-badgen i navigasjonsmenyen reflekterer også uleste
  prosjekttråder, ikke bare direktemeldinger.

## Ikke-mål / anti-mål

- **Ikke** inline svar/visning av alle 7 chat-typene inni Meldinger-siden.
  Det hadde krevd å bygge om 4 forskjellige chat-UI-er til å virke i en
  felles kontekst — overarbeid for et ønske om å *finne* tråden, ikke
  skrive i den derfra.
- **Ikke** et nytt "medlemskap i tråd"-konsept. Hvem som ser en tråd i
  lista er identisk med hvem som allerede mottar varsler om den
  (bekreftet av Magnus: tildeling og @nevning er allerede det som styrer
  varsling i dag).
- **Ikke** retrofit av gamle tråder du aldri har fått varsel om. Hvis du
  blir tildelt et prosjekt/oppgave *etter* at tidligere meldinger ble
  sendt, dukker tråden opp i lista først når neste melding kommer (samme
  begrensning som varslersystemet har i dag) — ikke noe vi løser nå.
- Det er en kjent (akseptert) svakhet at "siste melding"-forhåndsvisningen
  i lista kan bli hengende på en gammel verdi hvis brukeren på et tidspunkt
  mister tilgangen til tråden (f.eks. fjernes som assignee) uten at det
  finnes nyere varsler. Lavt praktisk omfang, ikke noe vi bygger rundt.

## Nåværende arkitektur (grunnlag)

To helt forskjellige lagringsmønstre for "prosjektmeldinger" i dag:

**A. Egne tabeller (ingen kobling til `conversations`):**

| Type | Tabell | Scope | UI-komponent | Side |
|---|---|---|---|---|
| Prosjektchat | `project_messages` | `project_id` | `ProjectChat.tsx` | flere sider, flytende knapp |
| Produksjon-oppgavechat | `task_messages` | `task_id` | `TaskChat`/`TaskChatPanel.tsx` | postprod/preprod-oppgaver |
| Preprodchat | `preprod_messages` | `project_id` | `PreprodChat.tsx` | `/admin/preprod/[id]` |
| Tilbudschat | `quote_messages` | `quote_id` + `project_id` | `QuoteChat.tsx` | `/admin/projects/[id]/quote` |

**B. Delt med direktemeldinger (`conversations`/`conversation_messages`,
skilt med en nullable FK-kolonne på `conversations`):**

| Type | Kolonne på `conversations` | UI-komponent | Side |
|---|---|---|---|
| Produksjonschat (gruppe) | `project_id` | `ProductionChat.tsx` | `/admin/produksjon/[id]`, også brukt på lead/email-siden |
| Lead-chat | `lead_id` | `ProductionChat.tsx` (gjenbrukt, egen `title`) | `/admin/leads/[id]` |
| E-postdiskusjon | `email_discussion_project_id` | `ProductionChat.tsx` (gjenbrukt) | `/admin/projects/[id]/email` |

Gruppe B ligger allerede teknisk sett i resultatet fra `getConversations()`
(`lib/actions/messages.ts`) som Meldinger bruker i dag — men vises der
identisk med en vanlig DM (bare deltakernavn, ingen kontekst, ingen lenke
tilbake). De må flyttes ut av "Direkte"-lista og inn i "Prosjekttråder".

**Varsling** (`notifications`-tabellen) dekker allerede alle 7 typene med
egne `type`-verdier (`project_message(_mention/_reaction)`,
`task_message(_mention/_reaction)`, `preprod_message(_mention/_reaction)`,
`quote_message(_mention/_reaction)`, `direct_message`,
`conversation_message_mention/_reaction`), og har kolonnene som trengs for
å slå opp kontekst: `project_id`, `task_id`, `conversation_id`,
`message_id`, pluss ferdige joins i `getNotifications()`
(`projects(title, pipeline_stage)`, `tasks(title, pipeline_stage)`,
`leads(name, company)`).

Viktig begrensning: kun type A (project/task/preprod/quote) og ren
`lead_assigned`-varsling har dedikerte lenke-tilbake-mønstre i dag
(`VarslerClient.tsx`s `navigateTo()`, linje ~172–230:
`?chat=1`/`?task=X&chat=1`). Gruppe B
(produksjonschat/lead-chat/e-postdiskusjon) har **ingen** dyplenke i dag —
`direct_message`/`conversation_message_mention` ruter alltid generisk til
`/admin/meldinger`, og `ProductionChat.tsx` har ikke støtte for å
tvangsåpnes via URL (i motsetning til `ProjectChat`/`PreprodChat` som
begge har en `forceOpen`-prop).

## Løsning

### 1. Trådnøkkel og label — mapping fra varseltype til tråd

Bygg en ny server action, f.eks. `lib/actions/project-threads.ts` →
`getProjectThreads()`, som henter brukerens `notifications`-rader (de 7
relevante type-gruppene, ikke `task_assigned`/`lead_assigned` osv.) uten
dagens 50-rads cap i `getNotifications()` — forslag: siste 300, sortert
på `created_at desc` (nok til at "siste 30 dager"-filteret i UI fortsatt
gir mening, uten paginering i v1).

Grupper radene på en trådnøkkel, avledet slik:

| Varseltype(r) | Trådnøkkel | Label-grunnlag | Lenke (gjenbruk `navigateTo`-logikken) |
|---|---|---|---|
| `project_message*` | `project:{project_id}` | `projects.title` | `/admin/projects/{project_id}?chat=1` |
| `task_message*` | `task:{task_id}` | `tasks.title` + `projects.title` | samme switch som i `navigateTo()` (avhenger av `pipeline_stage`) |
| `preprod_message*`/`preprod_mention` | `preprod:{project_id}` | `projects.title` | `/admin/preprod/{project_id}?chat=1` |
| `quote_message*`/`quote_mention` | `quote:{project_id}` | `projects.title` | `/admin/projects/{project_id}/quote?chat=1` |
| `direct_message`/`conversation_message_mention`/`conversation_message_reaction` **der conversations.project_id er satt** | `production:{project_id}` | `projects.title` | `/admin/produksjon/{project_id}?chat=1` (ny, se pkt. 3) |
| samme, **der conversations.lead_id er satt** | `lead:{lead_id}` | `leads.name` | `/admin/leads/{lead_id}?chat=1` (ny) |
| samme, **der conversations.email_discussion_project_id er satt** | `email:{project_id}` | `projects.title` | `/admin/projects/{project_id}/email?chat=1` (ny) |
| samme, **ingen av de tre satt** | — (ikke en prosjekttråd) | — | forblir i "Direkte"-lista, uendret |

For å klassifisere `conversation_id` → de tre siste radene: hent
`conversations.id, project_id, lead_id, email_discussion_project_id` for
alle distincte `conversation_id` som dukker opp blant notifikasjonene
(én enkelt `IN (...)`-query), og slå opp mot den lokalt.

**Reaksjonsvarsler (`*_message_reaction`) telles ikke med noe sted i
denne listen** — verken i `lastMessage` (en reaksjon har ingen tekst å
forhåndsvise; `VarslerClient.tsx` linje ~497–499 viser selve emojien som
`message_preview` for disse, noe som ikke skal lekke inn som "siste
melding"-tekst i en generisk forhåndsvisningslinje) eller i `unreadCount`.
Kun de rene melding- og @nevning-variantene (`project_message`,
`project_message_mention`, osv.) teller. Dette er et bevisst valg, ikke
en gjetning: det er konsistent med at badgen i navigasjonen (pkt. 4) også
utelater reaksjoner, og unngår at en tråd kan vise "1 ulest" mens
Meldinger-badgen viser 0.

For hver trådnøkkel (etter dette filteret): `lastMessage` = nyeste varsel
sin `message_preview`/`sender_name`/`created_at` i gruppen, `unreadCount`
= antall `read = false` i gruppen.

**Ekstraher lenkelogikken fra `VarslerClient.tsx`s `navigateTo()`**
(linje ~172–230) til en delt, ren funksjon (f.eks.
`lib/notification-routing.ts` → `getThreadHref(...)`) som begge sider
(`/admin/varsler` og den nye prosjekttråd-lista i Meldinger) bruker. Unngår
at lenkemønstrene drifter fra hverandre over tid.

### 2. UI i Meldinger

`MeldingerClient.tsx` får en seksjons-toggle øverst i sidepanelet
("Direkte" / "Prosjekttråder" — samme visuelle mønster som dagens
"Siste 30 dager"-knapp). "Prosjekttråder"-visningen:

- Samme radoppsett som dagens samtaleliste (avatar/ikon, navn/label,
  siste melding, uleste-badge), men avatar erstattes av et ikon per type
  (prosjekt/oppgave/preprod/tilbud/produksjon/lead/e-post — eksakt
  ikonvalg er byggerens call).
- Klikk → `router.push(href)` (navigerer bort fra Meldinger, ingen
  inline-tråd), og markerer alle uleste varsler i den trådnøkkelen som
  leste (samme oppførsel som `markConversationRead` gjør for DM-er i dag).
- "Direkte"-lista (`getConversations()`) må filtreres til å **utelate**
  samtaler der `conversations.project_id`/`lead_id`/`email_discussion_project_id`
  er satt — de hører nå hjemme i "Prosjekttråder" i stedet.

### 3. Manglende dyplenker må bygges (kun for gruppe B)

**Rettelse etter builder-check:** `ProductionChat.tsx` har *ikke* samme
oppbygning som `ProjectChat`/`PreprodChat`. De to siste er flytende
paneler med en egen `open`/`setOpen`-state (lukket som standard,
`forceOpen` setter den til `true`). `ProductionChat.tsx` har ingen slik
state — den rendres alltid synlig, inline, i et to-kolonne-grid på alle
tre sidene som bruker den (`/admin/produksjon/[id]`, `/admin/leads/[id]`,
`/admin/projects/[id]/email`). Det finnes altså ingenting å "tvangsåpne".

Riktig løsning for disse tre: `?chat=1` skal scrolle panelet inn i
synsfeltet og sette fokus i meldingsfeltet (f.eks. en `id` på
panel-wrapperen + `scrollIntoView` i en `useEffect` som leser
`searchParams`, pluss `autoFocus`/`.focus()` på tekstfeltet) — ikke åpne
noe. Dette er et mindre stykke arbeid enn det opprinnelige forslaget.

**Sjekket:** `.claude/worktrees/produksjon-page-team-board-deliverables/`
har egne kopier av `app/admin/produksjon/[id]/page.tsx`,
`ProjectChat.tsx` og `PreprodChat.tsx` — men siste commit på den branchen
(`worktree-produksjon-page-team-board-deliverables`) er fra 2026-09-08,
to måneder gammel, og er en ren merge av main inn i branchen (ikke eget
arbeid). Regnes som forlatt — ingen kollisjonsrisiko i praksis, men verdt
en rask `git status` i worktreen rett før man begynner, i tilfelle den
har blitt tatt opp igjen siden.

### 4. Meldinger-badge i navigasjon

`MeldingerBadge.tsx` sin telling (`in('type', ['direct_message',
'conversation_message_mention'])`) utvides til å også telle
`project_message`, `project_message_mention`, `task_message`,
`task_message_mention`, `preprod_message`, `preprod_mention`,
`quote_message`, `quote_mention` (ikke `*_reaction`-typene — reaksjoner
teller heller ikke med i dag for direktemeldinger, så det er konsistent
å holde dem utenfor badgen i begge faner). Realtime-lytteren i samme
komponent må utvides med de samme typene.

## Hva som er overlatt til byggeren

- Eksakt ikonvalg/fargekoding per trådtype i UI.
- Om "Prosjekttråder"-seksjonen skal være default-fane eller "Direkte"
  skal forbli default (anbefaling: "Direkte" forblir default, siden det
  er dagens vane).
- Eksakt wording på labels ("Produksjonschat – {prosjekt}" vs.
  "{prosjekt} – Produksjon" osv.).
- Om 300-rads cap på notifikasjons-query er nok i praksis, eller bør
  justeres — ingen paginering bygges i v1 uansett.
- Nøyaktig verifisering av hvilke `tasks`/`projects`-felt som allerede er
  tilgjengelig via eksisterende joins i `getNotifications()` vs. må
  hentes separat for `task_message`-grenen (preprod- vs. postprod-steg
  har ulik routing i dagens `navigateTo()` — denne detaljen må leses ut
  av koden på nytt under planlegging, ikke anta fra dette dokumentet).
