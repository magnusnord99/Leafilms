# Utstyrsrom — fysisk lagerstyring for pakkeliste

**Dato:** 2026-07-20
**Status:** Godkjent av Magnus (design), venter på spec-review

## Mål og suksesskriterium

I dag er pakkelisten på pre-prod-siden en fritekst-avkrysningsliste uten
kobling til hvor utstyret faktisk befinner seg. Teamet skal kunne holde
oversikt over fysisk utstyr ved å registrere det i navngitte «rom», hente
utstyr til en shoot fra et rom, og levere det tilbake til et rom (ikke
nødvendigvis det samme) når shooten er ferdig.

Suksesskriterium: for et gitt prosjekt i pre-prod kan man se nøyaktig hvilke
fysiske utstyrsenheter som er hentet ut til den shooten, og for et gitt rom
kan man se nøyaktig hva som ligger der nå.

## Omfang (v1)

- Rom (`equipment_rooms`) som kan opprettes fritt — ingen forhåndsdefinert
  liste.
- Individuelle fysiske utstyrsenheter (`equipment_units`), hver koblet til en
  type i `price_catalog` (kategori kamera/lys/lyd/utstyr/annet).
- Enheter har alltid nøyaktig én plassering: i et rom, eller ute til en shoot.
- Retur kan skje til et hvilket som helst rom, ikke bare opprinnelsesrommet.
- Klikk-basert flytte-grensesnitt (velg rader → «Flytt til …») — ikke ekte
  HTML5 drag-and-drop.
- Ingen dobbeltbookingsvarsel — kun statusvisning.
- Ingen bevegelseslogg/historikk — kun nåværende plassering lagres.
- Eksisterende fritekst-pakkeliste (`packing_list` i `pipeline_data`) beholdes
  uendret ved siden av, for småting som ikke er verdt å spore som enheter.

Utenfor scope i v1: dobbeltbookingsvarsel, bevegelseshistorikk/audit-logg,
strekkode/QR-skanning, vedlikeholds-/skadestatus per enhet, reservasjon frem i
tid (kun «ute nå» / «i rom nå»).

## Datamodell

Migrasjon `supabase/migrations/102_equipment_rooms.sql` (verifiser høyeste
eksisterende nummer før kjøring; 101 finnes i dag):

### `equipment_rooms`
| Kolonne | Type | Merknad |
|---|---|---|
| id | uuid PK | |
| name | text NOT NULL | |
| created_at / updated_at | timestamptz | |

### `equipment_units`
| Kolonne | Type | Merknad |
|---|---|---|
| id | uuid PK | |
| catalog_id | uuid FK → price_catalog | NOT NULL, `ON DELETE RESTRICT` (typen kan ikke slettes mens enheter finnes) |
| unit_label | text NOT NULL | auto `#1`, `#2` … ved opprettelse (fortløpende per `catalog_id`), fritt redigerbar senere |
| room_id | uuid FK → equipment_rooms | NULL når enheten er ute til en shoot |
| checked_out_project_id | uuid FK → projects | NULL når enheten ligger i et rom |
| checked_out_assignee_id | uuid FK → profiles | kun relevant når `checked_out_project_id` er satt; hvem som bærer utstyret for denne shooten |
| created_at / updated_at | timestamptz | |

Constraint: `CHECK ((room_id IS NULL) <> (checked_out_project_id IS NULL))` —
nøyaktig én av de to er alltid satt. `checked_out_assignee_id` nulles når
enheten leveres tilbake (satt av server action, ikke DB-trigger).

### RLS

Begge tabeller: samme mønster som `boards` (`098_boards.sql`) — full tilgang
for `authenticated`, ingen offentlige policies:

```sql
ALTER TABLE equipment_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_units ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "authenticated full access equipment_rooms" ... FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- CREATE POLICY "authenticated full access equipment_units" ... FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

### Migrering av eksisterende data

Ingen. `price_catalog` og `packing_list` (JSON) berøres ikke strukturelt —
`equipment_units` er en ny, tom tabell som fylles manuelt av teamet etter
hvert som fysisk utstyr registreres i rom.

## Ruter og komponenter

- `/admin/utstyr` — romoversikt (kort per rom + «Nytt rom»-knapp med
  navn-input). Admin-paletten (`#181920`/`#7C5CFC`), klientkomponent for
  interaksjon, server component for initiell data.
- `/admin/utstyr/[roomId]` — romdetalj:
  - Mål-shoot-velger øverst: nedtrekksliste over prosjekter med
    `pipeline_stage = 'pre_prod'`.
  - **«I dette rommet»**: liste over `equipment_units` med `room_id = roomId`,
    gruppert per kategori (som i dagens katalog-gruppering). Klikk rad(er) for
    å velge → footer-knapp «Flytt N til «prosjektnavn»»» (deaktivert til
    mål-shoot er valgt).
  - **«Ute til shoot»**: liste over alle `equipment_units` med
    `checked_out_project_id IS NOT NULL` (på tvers av rom), med
    prosjektnavn. Velg rad(er) → «Lever inn her»-knapp flytter dem til
    `roomId`.
  - **«+ Legg til utstyr»**: modal — velg type fra `price_catalog`
    (samme kategori-gruppering som pakkelisten bruker i dag) + antall →
    oppretter så mange `equipment_units` i rommet med auto-`unit_label`.
  - Slett rom: kun tillatt når rommet ikke inneholder enheter (knapp
    deaktivert/feilmelding ellers).
- `/admin/preprod/[id]` — pakkeliste-widgeten deles i to underseksjoner:
  1. **«Utstyr fra lager»**: read-only liste over `equipment_units` med
     `checked_out_project_id = project.id`, med en tildel-bærer-dropdown
     (samme profil-liste som brukes for crew i dag) som kaller
     `setUnitAssignee`. Lenke «Hent mer utstyr →» til `/admin/utstyr`.
  2. **«Annet utstyr»**: eksisterende fritekst-checklist, uendret oppførsel
     (legg til fritekst, huk av, tildel bærer via `PackingItem.assignee_*`).

  Fremdriftstelleren i widget-header (`done/total`) kombinerer «huket av» i
  del 2 med «hentet» (alltid telt som ferdig, siden det å hente = pakket) i
  del 1.

## Server actions

Ny fil `lib/actions/equipment.ts`:

- `getRooms(): Promise<{ id, name, unitCount }[]>`
- `getRoomDetail(roomId): Promise<{ room, unitsInRoom, unitsCheckedOut, catalog, preprodProjects }>`
- `createRoom(name): Promise<void>`
- `deleteRoom(roomId): Promise<{ error?: string }>` — feiler med melding hvis
  rommet har enheter
- `addEquipmentUnits(roomId, catalogId, count): Promise<void>` — oppretter
  `count` enheter, `unit_label` = `#{eksisterende antall for catalog_id + i}`
- `checkOutUnits(unitIds: string[], projectId): Promise<void>` — setter
  `room_id = NULL, checked_out_project_id = projectId`
- `returnUnits(unitIds: string[], roomId): Promise<void>` — setter
  `room_id = roomId, checked_out_project_id = NULL, checked_out_assignee_id = NULL`
- `setUnitAssignee(unitId, profileId | null): Promise<void>`
- `getProjectEquipment(projectId): Promise<EquipmentUnit[]>` — brukes av
  pre-prod-siden

Alle actions `revalidatePath` på berørte sider (`/admin/utstyr`,
`/admin/utstyr/[roomId]`, `/admin/preprod/[id]`).

## Navigasjon

Ny lenke «Utstyr» i admin-sidemenyen, plassert ved siden av «Preprod»
(samme ikon-mønster som eksisterende menypunkter).

## Feilhåndtering

- `addEquipmentUnits` med ugyldig `catalogId` eller `count <= 0`: valider
  server-side, returner feil til klient som toast.
- `checkOutUnits`/`returnUnits` på enhets-ID-er som allerede har endret
  plassering siden siden ble lastet (race mellom to admin-brukere): operasjonen
  bruker enhetens nåværende faktiske rad (siste skriving vinner), UI
  revalideres etterpå så visningen alltid reflekterer reell status.
- `deleteRoom` på rom med enheter: server action returnerer
  `{ error: 'Rommet inneholder utstyr' }`, UI viser feilmelding i stedet for
  å slette.

## Testing

Manuell ende-til-ende-verifisering (ingen write-operasjoner mot ekte
prosjektdata — bruk et engangs-testprosjekt):

1. Opprett to rom, legg til flere enheter av samme type i ett av dem
   (verifiser auto-nummerering `#1`, `#2`, …)
2. Hent utstyr fra rom A til et test-shoot-prosjekt → verifiser at enhetene
   forsvinner fra «I dette rommet» og dukker opp under «Ute til shoot» i
   både rom A og rom B
3. Lever tilbake til rom B (ikke opprinnelsesrommet) → verifiser at enhetene
   nå ligger i rom B
4. På pre-prod-siden: verifiser at «Utstyr fra lager» viser riktig utstyr,
   tildel en bærer, verifiser at fritekstlisten («Annet utstyr») fortsatt
   fungerer som før
5. Prøv å slette et rom med utstyr i seg → verifiser feilmelding
6. Prøv å slette et tomt rom → verifiser at det går gjennom

## Tillegg 2026-07-21 — reservasjon frem i tid + rom-eier

Magnus meldte tilbake: å tildele utstyr til et prosjekt i preprod gjorde det
umiddelbart utilgjengelig, selv uker før faktisk shoot. Linje 33–35 over
("reservasjon frem i tid" utenfor scope) reverseres derfor:

- Migrasjon `109_equipment_room_owner_and_planning.sql` fjerner
  `equipment_units_location_xor`-constrainten. En enhet kan nå ha både
  `room_id` (hjemme-rom) og `checked_out_project_id` (reservasjon) satt
  samtidig — `room_id` nulles ikke lenger ved tildeling.
- Status beregnes av `isPhysicallyOut()` i `lib/actions/equipment.ts`: en
  reservert enhet vises fortsatt under «I dette rommet» (med badge
  «reservert til X, ute fra {shoot_start}») frem til prosjektets
  `projects.shoot_start`. Mangler prosjektet shoot-dato, regnes enheten som
  ute med det samme (bevarer gammel oppførsel der vi ikke har nok info).
  Først når shoot har startet flyttes den til «Ute til shoot».
- Samme migrasjon legger til valgfritt `owner_id` på `equipment_rooms`. Utstyr
  som hentes ut fra et rom med eier (`checkOutUnits`) tildeles automatisk
  eieren som `checked_out_assignee_id` — dukker opp som pakke-ansvarlig i
  prosjektets pakkeliste. Uten rom-eier skjer ingen automatisk tildeling.
- Manuell retur (`returnUnits`) er uendret.
