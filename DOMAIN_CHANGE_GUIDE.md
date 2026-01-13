# Guide for å bytte domene på Leafilms Pitch

Denne guiden forklarer hvordan du bytter domenet på applikasjonen din.

## Oversikt

Applikasjonen din kjører på Google Cloud Run og bruker følgende komponenter:
- **Hosting**: Google Cloud Run
- **Backend**: Supabase
- **Auth**: Supabase Authentication (med redirect URLs)

## Steg-for-steg guide

### 1. Sett opp custom domain i Google Cloud Run

1. Gå til [Google Cloud Console](https://console.cloud.google.com)
2. Naviger til **Cloud Run** → **Services** → `leafilms-pitch`
3. Klikk på **"MANAGE CUSTOM DOMAINS"** (eller **"Domain mappings"**)
4. Klikk **"ADD MAPPING"**
5. Skriv inn ditt nye domene (f.eks. `app.leafilms.no`)
6. Følg instruksjonene for å verifisere domenet og sette opp DNS records

**DNS Records du må sette opp:**
- En A-record eller CNAME som peker til Cloud Run
- Google vil gi deg eksakte verdier når du setter opp domain mapping

### 2. Oppdater Environment Variables

Du må legge til/oppdatere `NEXT_PUBLIC_SITE_URL` environment variable i Cloud Run:

```bash
# Sett ditt nye domene
export NEW_DOMAIN="https://app.leafilms.no"

# Oppdater environment variable i Cloud Run
gcloud run services update leafilms-pitch \
  --region europe-north1 \
  --update-env-vars NEXT_PUBLIC_SITE_URL=$NEW_DOMAIN
```

Eller hvis du allerede har andre environment variables, legg til den nye:

```bash
gcloud run services update leafilms-pitch \
  --region europe-north1 \
  --update-env-vars NEXT_PUBLIC_SITE_URL=$NEW_DOMAIN,NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY,OPENAI_API_KEY=$OPENAI_API_KEY,QUOTE_API_URL=$QUOTE_API_URL,QUOTE_API_TOKEN=$QUOTE_API_TOKEN,SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
```

### 3. Oppdater Supabase Redirect URLs

Supabase Authentication krever at redirect URLs er whitelisted. Du må legge til ditt nye domene:

1. Gå til [Supabase Dashboard](https://supabase.com/dashboard)
2. Velg ditt prosjekt
3. Gå til **Authentication** → **URL Configuration**
4. Under **"Redirect URLs"**, legg til:
   - `https://ditt-nye-domene.no/auth/callback`
   - `https://ditt-nye-domene.no/auth/accept-invitation`
   - `https://ditt-nye-domene.no/login`
5. Under **"Site URL"**, oppdater til ditt nye domene: `https://ditt-nye-domene.no`

### 4. Verifiser at alt fungerer

Etter at DNS har propagert (kan ta opptil 24 timer, men ofte raskere):

1. **Test hovedside**: Gå til `https://ditt-nye-domene.no` - skal redirecte til `/admin`
2. **Test login**: Gå til `https://ditt-nye-domene.no/login` - skal fungere
3. **Test invitasjon**: Send en test-invitasjon og sjekk at redirect URL fungerer
4. **Test public project**: Åpne et publisert prosjekt og sjekk at lenker fungerer

### 5. (Valgfritt) Oppdater deploy.sh

Hvis du vil at `deploy.sh` skal bruke det nye domenet automatisk, kan du legge til:

```bash
# I deploy.sh, legg til etter linje 11:
export NEXT_PUBLIC_SITE_URL="https://ditt-nye-domene.no"
```

## Hvor brukes NEXT_PUBLIC_SITE_URL?

Denne variabelen brukes i:
- **`app/api/auth/invite/route.ts`**: For å generere redirect URLs for invitasjoner
- Fallback til `request.headers.get('origin')` hvis ikke satt

## Viktige notater

1. **DNS Propagation**: Det kan ta opptil 24 timer før DNS endringer propagerer, men ofte skjer det raskere (1-4 timer)

2. **HTTPS**: Google Cloud Run gir automatisk HTTPS via Let's Encrypt når du setter opp custom domain

3. **Gammelt domene**: Hvis du vil beholde det gamle domenet som fallback, kan du la det stå i Supabase redirect URLs

4. **Testing**: Test alltid i inkognito/private browsing for å unngå cache-problemer

## Troubleshooting

### Problem: "Redirect URI mismatch" i Supabase
**Løsning**: Sjekk at du har lagt til alle nødvendige redirect URLs i Supabase Dashboard

### Problem: "Invalid redirect URL" ved login
**Løsning**: Sjekk at `NEXT_PUBLIC_SITE_URL` er satt korrekt i Cloud Run environment variables

### Problem: DNS resolver ikke funnet
**Løsning**: Vent på DNS propagation, eller sjekk at DNS records er satt opp riktig

## Eksempel: Komplett kommando for å oppdatere alt

```bash
# 1. Sett variabler
export NEW_DOMAIN="https://app.leafilms.no"
export NEXT_PUBLIC_SUPABASE_URL="https://fmwcrgfxmlgfnsinnuyy.supabase.co"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="din-key-her"
export OPENAI_API_KEY="din-key-her"
export QUOTE_API_URL="din-url-her"
export QUOTE_API_TOKEN="din-token-her"
export SUPABASE_SERVICE_ROLE_KEY="din-key-her"

# 2. Oppdater Cloud Run med nytt domene
gcloud run services update leafilms-pitch \
  --region europe-north1 \
  --update-env-vars NEXT_PUBLIC_SITE_URL=$NEW_DOMAIN,NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY,OPENAI_API_KEY=$OPENAI_API_KEY,QUOTE_API_URL=$QUOTE_API_URL,QUOTE_API_TOKEN=$QUOTE_API_TOKEN,SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY

# 3. Manuelt: Gå til Supabase Dashboard og oppdater redirect URLs
# 4. Manuelt: Sett opp DNS records i ditt domene-register
```
