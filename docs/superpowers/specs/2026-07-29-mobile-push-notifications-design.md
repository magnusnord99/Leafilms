# Mobilvarslinger (Web Push via PWA) — Design spec

**Dato:** 2026-07-29
**Status:** Godkjent av Magnus (retning), venter på gjennomlesning av dette dokumentet

## Bakgrunn

Leafilms-teamet har allerede et modent varslingssystem: Postgres-triggere skriver rader til `notifications`-tabellen på nesten alle relevante hendelser (nye meldinger, @mentions, tildelinger, kontrakt signert, møteinvitasjoner, board-kommentarer, review-forespørsler m.fl. — se migrasjonene `056`, `061`, `081`–`083`, `088`, `090`, `093`–`094`, `099`, `118`, `121`, `127`, `129`). `NotificationBell`/`MeldingerBadge` abonnerer på disse via Supabase Realtime og spiller av en lyd i nettleseren.

Svakheten: dette virker **kun når appen faktisk er åpen i en fane** med en aktiv websocket-tilkobling. Ansatte som er ute på jobb/opptak og ikke har telefonen liggende inne på `/admin`, går glipp av varsler helt til de åpner appen igjen. Målet med denne featuren er å levere de samme hendelsene som ekte push-varsler på mobilen, uavhengig av om appen er åpen.

Appen har i dag ingen PWA-infrastruktur (ingen manifest, ingen service worker), ingen Web Push, og ingen SMS-integrasjon. E-post (Resend, `app/api/send-email/route.ts`) finnes, men er i dag kun brukt til manuell kunde-e-post — ikke koblet til `notifications`.

## Mål

- Ansatte kan skru på push-varsler på mobilen sin (og evt. laptop) fra appen.
- Alle hendelsestyper som i dag skriver til `notifications` skal også trigge et push-varsel — ingen filtrering per type i v1.
- Klikk på et push-varsel åpner riktig sted i appen (samme destinasjon som varselet ville hatt i `/admin/varsler`).
- Fungerer på Android/Chrome uten friksjon. Fungerer på iPhone forutsatt at brukeren har lagt appen til på hjemskjermen (iOS-begrensning, se under).

## Scope

- **Kun i-app-hendelser som allerede finnes** i `notifications`-tabellen — ingen nye varslingstyper oppfinnes i denne omgangen.
- **Ingen granulær kontroll per type.** Én bryter: "varsler på/av for denne enheten". Kan bygges ut senere hvis det blir for mye støy.
- **Ingen SMS.** Vurderes kun hvis push viser seg utilstrekkelig.
- **Flere enheter per bruker støttes** (telefon + laptop kan begge stå påslått samtidig).
- Selve i-app-varslingen (`NotificationBell`, `/admin/varsler`) endres ikke — push kommer **i tillegg**.

## Viktig plattformbegrensning (iOS)

Safari på iPhone støtter Web Push kun når nettsiden er lagt til på hjemskjermen som PWA (iOS 16.4+) — en vanlig åpen Safari-fane kan ikke motta push. Konsekvens for UX:
- Vi bygger en ordentlig installerbar PWA (manifest + ikoner + service worker), ikke bare et push-abonnement.
- Når en iOS-bruker som ikke har installert appen prøver å skru på varsler, viser vi en kort instruksjon ("Del-ikon → Legg til på Hjemskjerm → åpne appen derfra → skru på varsler"), i stedet for å late som om det bare virker.
- Android/Chrome kan abonnere på push selv uten installasjon, men vi oppfordrer til installasjon uansett siden det gir best opplevelse (ikon på hjemskjerm, fullskjerm).

## Arkitektur / dataflyt

```
Postgres-trigger (uendret) → INSERT i notifications
        │
        ▼
Supabase Database Webhook (ny, konfigurert i Supabase-dashboard/migrasjon)
        │  POST med rad-data + delt hemmelighet i header
        ▼
app/api/push/dispatch/route.ts (ny)
        │  1. Verifiser hemmelighet
        │  2. Slå opp push_subscriptions for notification.user_id
        │  3. Bygg tittel/tekst/URL fra notification.type (gjenbruk logikk fra VarslerClient)
        │  4. Send via web-push-biblioteket (VAPID-nøkler) til hvert abonnement
        │  5. Slett abonnement hvis send feiler med 404/410 (utløpt)
        ▼
Service worker (public/sw.js) på hver enhet
        │  'push'-event → self.registration.showNotification(...)
        │  'notificationclick'-event → åpne/fokuser riktig URL
        ▼
OS-nivå push-varsel på telefonen
```

## Datamodell

### Migrasjon `130_push_subscriptions.sql`

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Bruker kan opprette/lese/slette sine egne abonnement (samme "authenticated full access
-- på egne rader"-mønster som resten av appen)
CREATE POLICY push_subscriptions_own_rows ON push_subscriptions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

`/api/push/dispatch` leser tabellen med service-role-klienten (samme mønster som `send-email`-ruten), siden webhooken ikke har en innlogget brukerkontekst.

### Supabase Database Webhook

Konfigureres via SQL-migrasjon (`supabase_functions.http_request`-trigger, samme mekanisme Supabase bruker under panseret for webhooks) eller via Dashboard → Database → Webhooks: `INSERT` på `notifications` → `POST https://<cloud-run-url>/api/push/dispatch`, med en fast header `x-push-secret: $PUSH_WEBHOOK_SECRET`.

## Nye miljøvariabler

- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — genereres én gang (`web-push generate-vapid-keys`), det offentlige brukes også client-side (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`).
- `VAPID_SUBJECT` — `mailto:post@leafilms.no`.
- `PUSH_WEBHOOK_SECRET` — delt hemmelighet mellom Supabase-webhooken og `/api/push/dispatch`.

**NB:** `deploy.sh` setter kun env-vars ved *førstegangs* opprettelse av Cloud Run-tjenesten — for en tjeneste som allerede finnes (som i dag) må disse legges til manuelt via `gcloud run services update leafilms-pitch --update-env-vars=...` eller i Cloud Run-konsollet, siden dette er akkurat samme fallgruve som gjorde at `ANTHROPIC_API_KEY` manglet tidligere (se [[project_leafilms]]).

## Nye/endrede komponenter

| Fil | Ansvar |
|---|---|
| `app/manifest.ts` | Next.js native manifest route — navn, ikoner, `display: standalone`, theme-farge fra `lib/admin-theme.ts` |
| `public/icons/*.png` | App-ikoner (192px, 512px, maskable) |
| `public/sw.js` | Service worker: `push`-event viser varsel, `notificationclick` åpner/fokuserer riktig URL |
| `components/admin/PushNotificationToggle.tsx` | Client component: registrerer service worker, sjekker tillatelse/abonnement-status, av/på-bryter. Viser iOS-instruksjon når relevant |
| `lib/actions/push-subscriptions.ts` | `subscribeToPush(subscription)`, `unsubscribeFromPush(endpoint)` — server actions mot `push_subscriptions` |
| `lib/push-notification-content.ts` | Delt `type` → `{ title, body, url }`-mapping, gjenbrukt av både `/admin/varsler`-visningen (om ønskelig, refaktorering er valgfri) og dispatch-ruten |
| `app/api/push/dispatch/route.ts` | Webhook-mottaker: verifiser hemmelighet, slå opp abonnement, send via `web-push` |
| `supabase/migrations/130_push_subscriptions.sql` | Ny tabell + RLS |

Nytt npm-avhengighet: `web-push`.

## Plassering av "skru på varsler"-bryteren

`PushNotificationToggle` plasseres i `NotificationBell`-dropdownen (der man uansett allerede er når man tenker på varsler) — enkelt tilgjengelig, ingen ny sidenavigasjon nødvendig.

## Feilhåndtering / edge-cases

- Utløpt/tilbakekalt abonnement (push-tjenesten svarer 404/410) → raden slettes fra `push_subscriptions` ved neste dispatch-forsøk.
- Bruker med flere enheter → alle rader for `user_id` får push, uavhengig av hverandre.
- Nettleser uten Push API-støtte (sjelden i 2026, men eldre Safari-versjoner) → bryteren skjules/deaktiveres med forklarende tekst i stedet for å feile stille.
- Dispatch-ruten avviser forespørsler uten korrekt `x-push-secret` (401) — webhooken er en offentlig URL, så dette er eneste beskyttelse mot at noen utenfra spammer push til ansatte.
- Push skal kun trigges på `INSERT`, ikke på `UPDATE` (f.eks. når `read` settes til `true`) — webhooken filtreres til `INSERT` i konfigurasjonen.

## Testing

Ingen automatisert test-konvensjon finnes for denne typen infrastruktur i prosjektet i dag — verifiseres manuelt:
1. Android/Chrome først (minst friksjon): installer PWA, skru på varsler, trigger en reell hendelse (f.eks. tildel deg selv en oppgave), bekreft at push kommer med riktig tekst og at klikk åpner riktig side.
2. iPhone (iOS 16.4+): legg til på hjemskjerm, åpne derfra, gjenta samme test.
3. Bekreft at utløpt abonnement (f.eks. etter avinstallering) rydder seg selv opp neste gang en push dispatch-es til den brukeren, uten at det kaster feil for andre abonnement i samme batch.
