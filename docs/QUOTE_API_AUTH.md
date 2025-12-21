# Quote API Autentisering - Enhetlig Innlogging

## Oversikt

Når brukeren logger inn i Next.js-appen, skal de automatisk få tilgang til Python API-et uten å måtte logge inn separat.

## Flyt

### 1. Når brukeren logger inn i Next.js

```
Bruker logger inn → Next.js autentiserer → Autentiser også mot Python API → Lagre token i session
```

### 2. Når brukeren bruker Quote-funksjoner

```
Bruker klikker "Hent tilbud" → Next.js API route → Hent token fra session → Kall Python API med token
```

## Implementering

### Steg 1: API Token (Nå - Midlertidig)

For å få det til å fungere nå, legg til i `.env.local`:

```env
QUOTE_API_TOKEN=din-api-key-her
```

Dette er en server-side API key som alltid fungerer, uavhengig av bruker.

**Hvordan få API key:**
1. Generer en API key: `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`
2. Sett den i Google Cloud Run som miljøvariabel `API_KEY`
3. Sett samme key i Next.js `.env.local` som `QUOTE_API_TOKEN`

### Steg 2: User Session Token (Når innlogging er på plass)

Når du implementerer innlogging:

1. **Når brukeren logger inn:**
   ```typescript
   // I innloggingsflyten
   const quoteApiToken = await authenticateWithQuoteApi(user.email)
   
   // Lagre i session
   session.quoteApiToken = quoteApiToken
   ```

2. **I API routes:**
   ```typescript
   // Token hentes automatisk fra session
   const token = await getQuoteApiToken(session)
   ```

## Alternativer

### Alternativ 1: Service Account (Enklest)
- En token for hele systemet
- Fungerer for alle brukere
- Best for interne systemer

### Alternativ 2: User Tokens (Mer sikker)
- Hver bruker får sin egen token
- Token lagres i session
- Best for multi-user systemer

### Alternativ 3: Hybrid (Anbefalt)
- Service account som fallback
- User tokens hvis tilgjengelig
- Beste av begge verdener

## Neste Steg

1. **Nå:** Bruk `QUOTE_API_SERVICE_TOKEN` i `.env.local`
2. **Senere:** Når innlogging er på plass, legg til user token i session
3. **Automatisk:** Token hentes automatisk i alle API routes

## Eksempel

```typescript
// I innloggingsflyten (når den er implementert)
import { authenticateWithQuoteApi } from '@/lib/auth/quote-api-auth'

async function handleLogin(userEmail: string) {
  // Autentiser mot Python API
  const quoteApiToken = await authenticateWithQuoteApi(userEmail)
  
  // Lagre i session
  await saveSession({
    userEmail,
    quoteApiToken
  })
}

// I API routes (fungerer allerede)
import { getQuoteApiToken } from '@/lib/auth/quote-api-auth'

const token = await getQuoteApiToken(session) // Henter automatisk fra session eller service token
```

