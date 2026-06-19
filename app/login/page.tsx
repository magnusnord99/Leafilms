'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase-client'
import { Button, Input, Card, Heading, Text } from '@/components/ui'

function GoogleIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="shrink-0"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

function LoginContent() {
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [resendingEmail, setResendingEmail] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  // Tillat kun interne stier — hindrer open redirect via ?redirect=https://evil.com
  const rawRedirect = searchParams.get('redirect') || '/admin'
  const redirect = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/admin'
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

      // Use window.location.href for hard redirect
      window.location.href = `${window.location.origin}${redirect}`
    } catch (err) {
      // Check if error is about email confirmation
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('Email not confirmed') || msg.includes('email_not_confirmed')) {
        setError('Email-adressen din er ikke bekreftet. Sjekk inboxen din for bekreftelseslink, eller send en ny link.')
      } else {
        setError(err instanceof Error ? err.message : 'Noe gikk galt ved innlogging')
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke sende bekreftelseslink')
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Noe gikk galt ved Google-innlogging')
      setIsGoogleLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: `
          radial-gradient(ellipse 80% 60% at 50% 100%, rgba(196, 148, 52, 0.07) 0%, transparent 65%),
          radial-gradient(ellipse 60% 40% at 50% 0%, rgba(196, 148, 52, 0.04) 0%, transparent 60%),
          var(--color-background)
        `,
      }}
    >
      <Card className="w-full max-w-md p-8">
        {/* Accent-linje over logoen */}
        <div
          className="mx-auto mb-6"
          style={{
            width: '2.5rem',
            height: '1px',
            background: 'var(--color-accent)',
            opacity: 0.7,
          }}
        />

        <Heading as="h1" size="lg" className="text-center mb-1">
          LEAFILMS
        </Heading>
        <Text variant="body" className="text-center mb-8" style={{ color: 'var(--color-admin-text-muted)' }}>
          Logg inn
        </Text>

        {error && (
          <div
            className="mb-6 p-4 rounded-[3px]"
            style={{
              background: 'rgba(184, 64, 64, 0.1)',
              border: '1px solid rgba(184, 64, 64, 0.35)',
            }}
          >
            <Text variant="body" className="mb-2" style={{ color: '#CC7070' }}>
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
          <div
            className="mb-6 p-4 rounded-[3px]"
            style={{
              background: 'var(--color-success-bg)',
              border: '1px solid rgba(74, 154, 112, 0.35)',
            }}
          >
            <Text variant="body" style={{ color: 'var(--color-success-text)' }}>
              Bekreftelseslink er sendt! Sjekk inboxen din.
            </Text>
          </div>
        )}

        <form onSubmit={handleEmailLogin} className="space-y-4 mb-6">
          <Input
            type="email"
            name="email"
            id="email"
            label="E-post"
            placeholder="navn@leafilms.no"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading || isGoogleLoading}
            autoComplete="email"
          />

          <Input
            type="password"
            name="password"
            id="password"
            label="Passord"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading || isGoogleLoading}
            autoComplete="current-password"
          />

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
            <div className="w-full" style={{ borderTop: '1px solid var(--color-border)' }} />
          </div>
          <div className="relative flex justify-center text-sm">
            <Text
              variant="body"
              className="px-3"
              style={{
                background: 'var(--color-background-surface)',
                color: 'var(--color-admin-text-subtle)',
              }}
            >
              eller
            </Text>
          </div>
        </div>

        <Button
          type="button"
          variant="secondary"
          className="w-full gap-2.5"
          onClick={handleGoogleLogin}
          disabled={loading || isGoogleLoading}
        >
          {!isGoogleLoading && <GoogleIcon />}
          {isGoogleLoading ? 'Logger inn...' : 'Logg inn med Google'}
        </Button>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: 'var(--color-background)' }}
      >
        <Text variant="body" style={{ color: 'var(--color-admin-text-muted)' }}>Laster...</Text>
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
