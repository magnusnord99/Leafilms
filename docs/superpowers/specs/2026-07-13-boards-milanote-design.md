# Boards — intern Milanote-erstatning

**Dato:** 2026-07-13
**Status:** Godkjent av Magnus (design), venter på spec-review

## Mål og suksesskriterium

Teamet skal kunne gjennomføre preproduksjonen på et reelt prosjekt — moodboard,
storyboard og planlegging — utelukkende i Leafilms-appen, slik at
Milanote-abonnementet kan sies opp.

Ingen migrering fra Milanote: nye prosjekter starter i den nye løsningen,
gamle boards arkiveres/forkastes av teamet selv.

## Omfang (v1)

- Uendelig canvas per board med pan, zoom, minimap, zoom-to-fit, multi-select
- Kort-typer: notat, bilde, video, lenke, farge, to-do, kolonne, board-kort
- Piler mellom kort med valgfri label
- Nestede boards (board-i-board) med brødsmulesti
- Live-oppdateringer via Supabase Realtime (ikke live-markører/CRDT)
- Offentlig read-only delingslenke per board
- Knyttet til prosjekter via preprod-modulen

Utenfor scope i v1: live-markører og samtidig tekstredigering, kommentarer på
kort, maler, Pexels-bildesøk, eksport til PDF, redigeringstilgang for eksterne.

## Teknologivalg

**Canvas-motor: React Flow (`@xyflow/react`).** MIT-lisensiert; gir pan/zoom,
drag, multi-select, marquee, minimap og kanter (piler) ferdig. Hvert kort er en
custom node — en vanlig React-komponent stylet med admin-paletten. Vurdert og
forkastet: egenbygd canvas (1–2 uker ekstra på grunnmekanikk), tldraw
(lisenskostnad/vannmerke + eget design som er vanskelig å integrere).

## Datamodell

Migrasjon `supabase/migrations/098_boards.sql` (verifiser høyeste eksisterende
nummer før kjøring; 097 finnes i dag):

### `boards`
| Kolonne | Type | Merknad |
|---|---|---|
| id | uuid PK | |
| project_id | uuid FK → projects | NOT NULL |
| parent_board_id | uuid FK → boards | NULL = rotboard for prosjektet |
| title | text | |
| share_token | text UNIQUE | NULL = ikke delt |
| created_by | uuid FK → profiles | |
| created_at / updated_at | timestamptz | |

Ett rotboard per prosjekt (unik delvis indeks på `project_id` der
`parent_board_id IS NULL`), opprettes lazy første gang preprod-siden åpner det.

### `board_cards`
| Kolonne | Type | Merknad |
|---|---|---|
| id | uuid PK | |
| board_id | uuid FK → boards | ON DELETE CASCADE |
| type | text | `note` \| `image` \| `video` \| `link` \| `color` \| `todo` \| `column` \| `board` |
| x, y | double precision | fri posisjon på canvas |
| width | double precision | NULL = auto |
| z_index | int | |
| column_id | uuid FK → board_cards | satt når kortet ligger i en kolonne |
| sort_order | int | rekkefølge i kolonnen |
| content | jsonb | typespesifikk, se under |
| created_at / updated_at | timestamptz | |

`content` per type: notat `{ text }` (lettvekts markdown-delmengde: overskrift,
punktliste, fet); bilde `{ url, caption }`; video `{ embed_url }` eller
`{ url }` for opplastet; lenke `{ url, title, description, image_url }`; farge
`{ hex }`; todo `{ items: [{ id, text, checked }] }`; kolonne `{ title }`;
board `{ child_board_id }`.

Slettes et kolonne-kort, løsrives kortene i den (`column_id` nulles, kortene
beholder posisjon nær kolonnens plass) — de slettes ikke. Slettes et board-kort,
slettes child-boardet med innhold (med bekreftelsesdialog).

### `board_edges`
`id`, `board_id` (FK, CASCADE), `from_card_id`, `to_card_id` (begge FK →
board_cards, CASCADE), `label` (nullable), `created_at`.

### Storage
Bucket `board-images` etter mønster fra `059_selection_galleries.sql`:
begrenset filstørrelse og mime-typer (bilder + video). Offentlig lesing (som
eksisterende buckets), opplasting kun for autentiserte.

### RLS
Alle tre tabellene: SELECT/INSERT/UPDATE/DELETE for autentiserte staff-brukere
(samme mønster som øvrige admin-tabeller). Ingen offentlige policies —
delingssiden leser server-side med service-klient etter token-validering.

## Ruter og komponenter

- `/admin/boards/[boardId]` — canvas-editoren (admin-palett `#181920`/`#7C5CFC`,
  klientkomponent). Brødsmulesti: prosjektnavn → rotboard → … → aktivt board.
- `/admin/preprod/[id]` — `millanote_url`-feltet erstattes av «Boards»-knapp som
  åpner (og ved behov oppretter) prosjektets rotboard. `millanote_url` beholdes
  i `PreprodData` for gamle prosjekter, men vises kun når den har verdi.
- `/b/[token]` — offentlig read-only-visning, cinematisk palett
  (`#0C0B09`/`#C49434`). Server component; validerer token, rendrer canvas i
  visningsmodus (pan/zoom, lightbox, navigering til underboards — underboards
  er implisitt delt via foreldre-boardets token). Ugyldig token → 404.
- `lib/actions/boards.ts` — server actions: CRUD for boards/kort/piler,
  opprett-rotboard, generer/fjern share_token, hent lenke-metadata.
- `components/boards/` — `BoardCanvas` (React Flow-oppsett), én node-komponent
  per korttype, verktøylinje, delingsdialog.

## Canvas-oppførsel

- Verktøylinje langs venstre kant: velg korttype, klikk på canvas for å
  plassere. Bilder kan også slippes rett fra filsystemet på canvaset.
- Kolonner: React Flow parent-nodes. Kort som slippes over en kolonne får
  `column_id` + `sort_order` og stables vertikalt; dras ut igjen for fri
  plassering.
- Piler: dra fra kort-kant til kort-kant (standard React Flow edge-oppretting).
- Dobbeltklikk på board-kort navigerer inn i underboardet.
- Delete-tast sletter valgte kort/piler (bekreftelse ved board-kort).

## Lagring og sanntid

- Optimistisk UI: endringer vises umiddelbart, lagres via server actions i
  bakgrunnen. Posisjon lagres ved slipp (ikke per piksel-bevegelse).
- Feilet lagring: diskret toast med retry, kortet markeres som ulagret.
- Supabase Realtime `postgres_changes` på `board_cards` og `board_edges`
  filtrert på `board_id`. Egne endringer filtreres bort (klient-id i payload
  eller sammenligning mot lokal state) så kort ikke «hopper».
- Konflikter: last-write-wins per kort.

## Feilhåndtering

- Opplasting: valider mime-type og størrelse klient-side før opplasting, vis
  tydelig feilmelding ved avslag fra bucketen.
- Lenke-metadata: server action henter og parser og faller tilbake til rent
  domenenavn hvis siden ikke svarer/mangler metadata; kortet fungerer uansett.
- Ugyldig/deaktivert share_token → 404.

## Testing

Manuell ende-til-ende-verifisering på et engangs-testprosjekt (aldri
write-operasjoner mot ekte prosjektdata):

1. Opprett rotboard fra preprod-siden
2. Opprett alle åtte kort-typer, rediger, flytt, slett
3. Kolonne-stabling inn/ut, storyboard-flyt
4. Piler mellom kort, med label
5. Underboard: opprett, naviger inn/ut, slett med bekreftelse
6. Realtime: to vinduer side om side, endringer flyter begge veier
7. Deling: generer lenke, åpne i inkognito, verifiser read-only + underboard-
   navigering, deaktiver lenke → 404
