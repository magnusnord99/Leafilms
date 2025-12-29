'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import { Button, Input, Card, Heading, Text } from '@/components/ui'

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [resendingEmail, setResendingEmail] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const redirect = searchParams.get('redirect') || '/admin'
  const errorParam = searchParams.get('error')

  useEffect(() => {
    if (errorParam === 'unauthorized') {
      setError('Du har ikke tilgang til denne siden. Kun admin-brukere kan logge inn.')
    }
  }, [errorParam])

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (!email || !password) {
        throw new Error('Email og passord er påkrevd')
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      
      if (error) {
        throw error
      }

      // Check if user is admin
      if (data.user) {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .single()

        if (profileError) {
          throw new Error('Kunne ikke hente brukerprofil')
        }

        if (!profile || profile.role !== 'admin') {
          await supabase.auth.signOut()
          setError('Du har ikke tilgang. Kun admin-brukere kan logge inn.')
          setLoading(false)
          return
        }
      }

      // Wait a moment for cookies to be properly set
      await new Promise(resolve => setTimeout(resolve, 300))
      
      // Verify session is available
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        setError('Kunne ikke bekrefte innlogging. Prøv igjen.')
        setLoading(false)
        return
      }

      const redirectUrl = redirect.startsWith('http') 
        ? redirect 
        : `${window.location.origin}${redirect}`
      
      // Use window.location.href for hard redirect
      window.location.href = redirectUrl
    } catch (err: any) {
      // Check if error is about email confirmation
      if (err.message?.includes('Email not confirmed') || err.message?.includes('email_not_confirmed')) {
        setError('Email-adressen din er ikke bekreftet. Sjekk inboxen din for bekreftelseslink, eller send en ny link.')
      } else {
        setError(err.message || 'Noe gikk galt ved innlogging')
      }
      setLoading(false)
    }
  }

  async function handleResendConfirmation() {
    if (!email) {
      setError('Vennligst skriv inn email-adressen din først')
      return
    }

    setResendingEmail(true)
    setError(null)
    setEmailSent(false)

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
      })

      if (error) throw error

      setEmailSent(true)
    } catch (err: any) {
      setError(err.message || 'Kunne ikke sende bekreftelseslink')
      setResendingEmail(false)
    }
  }

  async function handleGoogleLogin() {
    setIsGoogleLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
        },
      })

      if (error) throw error
    } catch (err: any) {
      setError(err.message || 'Noe gikk galt ved Google-innlogging')
      setIsGoogleLoading(false)
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
            Admin Login
          </Text>

          {error && (
            <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 rounded-lg">
              <Text variant="body" className="text-red-400 mb-2">
                {error}
              </Text>
              {error.includes('bekreftet') && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleResendConfirmation}
                  disabled={resendingEmail || emailSent}
                  className="mt-2 w-full"
                >
                  {resendingEmail
                    ? 'Sender...'
                    : emailSent
                    ? 'Link sendt! Sjekk email'
                    : 'Send ny bekreftelseslink'}
                </Button>
              )}
            </div>
          )}

          {emailSent && !error && (
            <div className="mb-6 p-4 bg-green-900/20 border border-green-500/50 rounded-lg">
              <Text variant="body" className="text-green-400">
                Bekreftelseslink er sendt! Sjekk inboxen din.
              </Text>
            </div>
          )}

          <form onSubmit={handleEmailLogin} className="space-y-4 mb-6">
            <div>
              <Input
                type="email"
                name="email"
                id="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading || isGoogleLoading}
                autoComplete="email"
              />
            </div>

            <div>
              <Input
                type="password"
                name="password"
                id="password"
                placeholder="Passord"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading || isGoogleLoading}
                autoComplete="current-password"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={loading || isGoogleLoading}
            >
              {loading ? 'Logger inn...' : 'Logg inn'}
            </Button>
          </form>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-700"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <Text variant="body" className="px-2 bg-black text-gray-400">
                eller
              </Text>
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={handleGoogleLogin}
            disabled={loading || isGoogleLoading}
          >
            {isGoogleLoading ? 'Logger inn...' : 'Logg inn med Google'}
          </Button>
        </div>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <Text variant="body">Laster...</Text>
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}

