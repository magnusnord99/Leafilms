/**
 * Quote API Authentication Service
 * Håndterer autentisering mot Python API når brukeren er logget inn i Next.js
 */

const QUOTE_API_URL = process.env.QUOTE_API_URL
const QUOTE_API_TOKEN = process.env.QUOTE_API_TOKEN // API key for server-side autentisering

/**
 * Henter access token for Python API
 * Dette kan være:
 * 1. API key fra environment variable (QUOTE_API_TOKEN) - server-side, alltid tilgjengelig
 * 2. User token fra session (hvis brukeren har logget inn via Google OAuth) - kan implementeres senere
 */
export async function getQuoteApiToken(session?: any): Promise<string | null> {
  // Prioritet 1: API key fra environment variable (server-side, alltid tilgjengelig)
  if (QUOTE_API_TOKEN) {
    return QUOTE_API_TOKEN
  }

  // Prioritet 2: User token fra session (hvis brukeren har logget inn)
  // Kan implementeres senere hvis Python API støtter user tokens
  if (session?.quoteApiToken) {
    return session.quoteApiToken
  }

  // Ingen token tilgjengelig
  return null
}

/**
 * Autentiserer bruker mot Python API når de logger inn
 * Kalles fra innloggingsflyten
 */
export async function authenticateWithQuoteApi(userEmail: string): Promise<string | null> {
  if (!QUOTE_API_URL) {
    console.error('QUOTE_API_URL ikke satt')
    return null
  }

  try {
    // Hvis Python API bruker Google OAuth, kan vi:
    // 1. Sende brukerens email til Python API
    // 2. Få en token tilbake
    // 3. Lagre token i session
    
    // For nå, returnerer vi API token hvis tilgjengelig
    // Dette kan endres når innlogging er implementert
    return QUOTE_API_TOKEN || null
  } catch (error) {
    console.error('Error authenticating with Quote API:', error)
    return null
  }
}

/**
 * Refresh token hvis den er utløpt
 */
export async function refreshQuoteApiToken(refreshToken: string): Promise<string | null> {
  if (!QUOTE_API_URL) {
    return null
  }

  try {
    const response = await fetch(`${QUOTE_API_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refresh_token: refreshToken })
    })

    if (!response.ok) {
      return null
    }

    const data = await response.json()
    return data.access_token || null
  } catch (error) {
    console.error('Error refreshing Quote API token:', error)
    return null
  }
}

