'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import { Button, Input, Card, Heading, Text } from '@/components/ui'

function AcceptInvitationContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    // Log all URL information for debugging (always log for troubleshooting)
    console.log('AcceptInvitation - Full URL:', window.location.href)
    console.log('AcceptInvitation - Search params:', Object.fromEntries(searchParams.entries()))
    console.log('AcceptInvitation - Hash:', window.location.hash)

    // Sjekk om vi har en feilmelding fra callback eller hash
    const errorParam = searchParams.get('error')
    const hash = window.location.hash
    
    // Sjekk hash for feilmeldinger (Supabase sender feil i hash-fragmentet)
    if (hash) {
      const hashParams = new URLSearchParams(hash.substring(1))
      const hashError = hashParams.get('error')
      const hashErrorCode = hashParams.get('error_code')
      const hashErrorDescription = hashParams.get('error_description')
      
      if (hashError) {
        if (process.env.NODE_ENV === 'development') {
          console.error('AcceptInvitation - Error in hash:', { hashError, hashErrorCode, hashErrorDescription })
        }
        
        if (hashErrorCode === 'otp_expired' || hashError === 'access_denied') {
          setError('Invitasjonslinken er utløpt eller ugyldig. Be admin om å sende en ny invitasjon.')
        } else {
          setError(hashErrorDescription || hashError || 'En feil oppstod ved behandling av invitasjonen.')
        }
        return
      }
    }
    
    if (errorParam) {
      if (errorParam === 'code_exchange_failed') {
        setError('Kunne ikke verifisere invitasjonen. Linken kan være utløpt eller ugyldig.')
      } else {
        setError('En feil oppstod ved behandling av invitasjonen.')
      }
      return
    }

    // Sjekk om vi har en session (code exchange er allerede gjort i callback)
    async function checkSessionAndHash() {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (process.env.NODE_ENV === 'development') {
        console.log('AcceptInvitation - Session check:', session ? 'Session exists' : 'No session')
      }

      if (session && session.user) {
        setEmail(session.user.email || null)
        // Vi har en session, så vi kan sette passordet
        setToken('session_exists') // Marker at vi har en session
        return
      }

      // Ingen session - sjekk om vi har token/code i URL eller hash
      const tokenParam = searchParams.get('token')
      const codeParam = searchParams.get('code')
      const typeParam = searchParams.get('type')
      
      // Sjekk også hash fragment (Supabase kan sende data der, spesielt for PKCE flow)
      const hash = window.location.hash
      let hashToken = null
      let hashCode = null
      let hashAccessToken = null
      let hashRefreshToken = null
      let hashType = null
      
      if (hash) {
        const hashParams = new URLSearchParams(hash.substring(1))
        
        // Sjekk først om det er en feil i hash
        const hashError = hashParams.get('error')
        if (hashError) {
          const hashErrorCode = hashParams.get('error_code')
          const hashErrorDescription = hashParams.get('error_description')
          if (process.env.NODE_ENV === 'development') {
            console.error('AcceptInvitation - Error in hash:', { hashError, hashErrorCode, hashErrorDescription })
          }
          
          if (hashErrorCode === 'otp_expired' || hashError === 'access_denied') {
            setError('Invitasjonslinken er utløpt eller ugyldig. Be admin om å sende en ny invitasjon.')
          } else {
            setError(hashErrorDescription || hashError || 'En feil oppstod ved behandling av invitasjonen.')
          }
          return
        }
        
        hashAccessToken = hashParams.get('access_token')
        hashRefreshToken = hashParams.get('refresh_token')
        hashToken = hashParams.get('token')
        hashCode = hashParams.get('code')
        hashType = hashParams.get('type')
        if (process.env.NODE_ENV === 'development') {
          console.log('AcceptInvitation - Hash params:', { 
            hashAccessToken: hashAccessToken ? 'present' : 'missing', 
            hashRefreshToken: hashRefreshToken ? 'present' : 'missing', 
            hashToken, 
            hashCode, 
            hashType 
          })
        }
      }
      
      // Hvis vi har access_token i hash (Supabase har allerede autentisert brukeren)
      if (hashAccessToken && hashRefreshToken) {
        // Set session direkte fra access_token og refresh_token
        const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
          access_token: hashAccessToken,
          refresh_token: hashRefreshToken,
        })
        
        if (sessionError) {
          console.error('Error setting session:', sessionError)
          setError(`Kunne ikke sette session: ${sessionError.message}`)
          return
        }
        
        if (sessionData?.user) {
          setEmail(sessionData.user.email || null)
          setToken('session_exists')
          // Clear hash from URL
          window.history.replaceState(null, '', window.location.pathname + window.location.search)
          return
        }
      }
      
      // Hvis vi har en code (PKCE flow), exchange den umiddelbart
      if (codeParam || hashCode) {
        const codeToExchange = codeParam || hashCode
        if (codeToExchange) {
          // Exchange code for session
          supabase.auth.exchangeCodeForSession(codeToExchange)
            .then(({ data, error }) => {
              if (error) {
                console.error('Code exchange error:', error)
                setError(`Kunne ikke verifisere invitasjon: ${error.message}`)
              } else if (data?.user) {
                setEmail(data.user.email || null)
                setToken('session_exists')
                // Clear hash from URL
                if (hash) {
                  window.history.replaceState(null, '', window.location.pathname + window.location.search)
                }
              }
            })
            .catch((err) => {
              console.error('Unexpected error in code exchange:', err)
              setError('Kunne ikke verifisere invitasjon')
            })
          return // Don't set error yet, wait for exchange result
        }
      }
      
      if (tokenParam || hashToken) {
        setToken(tokenParam || hashToken || '')
      } else if (!codeParam && !hashCode && !hashAccessToken) {
        // Log detailed error for debugging
        if (process.env.NODE_ENV === 'development') {
          console.error('AcceptInvitation - No token/code found:', {
            tokenParam,
            codeParam,
            typeParam,
            hash,
            fullUrl: window.location.href,
            search: window.location.search
          })
        }
        setError('Ingen invitasjonstoken eller kode funnet. Sjekk at du bruker hele linken fra emailen.')
      }
    }
    
    checkSessionAndHash()
  }, [searchParams])

  async function handleAcceptInvitation(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (!password || !confirmPassword) {
        throw new Error('Passord er påkrevd')
      }

      if (password.length < 6) {
        throw new Error('Passord må være minst 6 tegn')
      }

      if (password !== confirmPassword) {
        throw new Error('Passordene matcher ikke')
      }

      // Sjekk om vi har en session (code exchange er allerede gjort i callback)
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      
      if (!currentSession || !currentUser) {
        // Ingen session - prøv å hente token/code fra URL og exchange
        const searchParams = new URLSearchParams(window.location.search)
        const codeParam = searchParams.get('code')
        const tokenParam = searchParams.get('token')
        
        if (codeParam) {
          // Exchange code for session
          const { data: codeData, error: codeError } = await supabase.auth.exchangeCodeForSession(codeParam)
          if (codeError) {
            throw new Error(`Kunne ikke verifisere invitasjon: ${codeError.message}`)
          }
          if (!codeData?.user) {
            throw new Error('Kunne ikke hente brukerinformasjon fra invitasjonstoken')
          }
        } else if (tokenParam) {
          // Prøv med verifyOtp
          const { data: otpData, error: otpError } = await supabase.auth.verifyOtp({
            token_hash: tokenParam,
            type: 'invite',
          })
          if (otpError) {
            throw new Error(`Kunne ikke verifisere invitasjon: ${otpError.message}`)
          }
          if (!otpData.user) {
            throw new Error('Kunne ikke hente brukerinformasjon fra invitasjonstoken')
          }
        } else {
          throw new Error('Ingen gyldig invitasjonstoken eller kode funnet. Sjekk at du bruker hele linken fra emailen.')
        }
      }

      // Hent brukeren fra session
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('Kunne ikke hente brukerinformasjon')
      }

      // Oppdater passordet - dette krever at vi er autentisert
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      })

      if (updateError) {
        console.error('Password update error:', updateError)
        throw new Error(`Kunne ikke sette passord: ${updateError.message}`)
      }

        // Sjekk at brukeren er admin
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (profileError) {
          throw new Error('Kunne ikke hente brukerprofil')
        }

        if (!profile || profile.role !== 'admin') {
          await supabase.auth.signOut()
          setError('Du har ikke tilgang. Kun inviterte admin-brukere kan registrere seg.')
          setLoading(false)
          return
        }

        // Hent email for visning
        setEmail(user.email || null)

        // Vent litt for at cookies skal synkroniseres
        await new Promise(resolve => setTimeout(resolve, 300))

        // Redirect til admin
        window.location.href = '/admin'
    } catch (err: any) {
      // Hvis verifyOtp feiler, kan det være at token må brukes annerledes
      // Prøv alternativ metode: bruk token direkte i URL
      if (err.message?.includes('token') || err.message?.includes('invalid')) {
        setError('Invitasjonslinken er ugyldig eller utløpt. Be admin om å sende en ny invitasjon.')
      } else {
        setError(err.message || 'Noe gikk galt ved aksept av invitasjon')
      }
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <div className="p-8">
          <Heading as="h1" size="2xl" className="text-center mb-2">
            LEAFILMS
          </Heading>
          <Text variant="body" className="text-center text-gray-400 mb-8">
            {email ? `Aksepter invitasjon for ${email}` : 'Aksepter invitasjon'}
          </Text>

          {error && (
            <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 rounded-lg">
              <Text variant="body" className="text-red-400 mb-2">
                {error}
              </Text>
              {error.includes('utløpt') || error.includes('ugyldig') ? (
                <Text variant="body" className="text-red-300 text-sm mt-2">
                  Dette kan skje hvis linken har stått for lenge, allerede er brukt, eller hvis email-klienten din har forhåndshentet linken. 
                  Be admin om å sende en ny invitasjon.
                </Text>
              ) : null}
            </div>
          )}

          {!token ? (
            <div className="text-center">
              <Text variant="body" className="text-gray-400">
                Laster invitasjon...
              </Text>
            </div>
          ) : (
            <form onSubmit={handleAcceptInvitation} className="space-y-4">
              <div>
                <Input
                  type="password"
                  name="password"
                  id="password"
                  placeholder="Nytt passord"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="new-password"
                  minLength={6}
                />
              </div>

              <div>
                <Input
                  type="password"
                  name="confirmPassword"
                  id="confirmPassword"
                  placeholder="Bekreft passord"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="new-password"
                  minLength={6}
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full"
                disabled={loading}
              >
                {loading ? 'Aksepterer invitasjon...' : 'Aksepter invitasjon og sett passord'}
              </Button>
            </form>
          )}
        </div>
      </Card>
    </div>
  )
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Text variant="body">Laster...</Text>
      </div>
    }>
      <AcceptInvitationContent />
    </Suspense>
  )
}

