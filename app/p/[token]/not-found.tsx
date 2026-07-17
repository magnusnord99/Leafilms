import Link from 'next/link'

export default function NotFound() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-8"
      style={{ background: '#0C0B09' }}
    >
      {/* Film grain overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.04\'/%3E%3C/svg%3E")',
          opacity: 0.35,
        }}
      />

      <div className="relative z-[1] text-center max-w-md">
        {/* Section label */}
        <div className="flex items-center justify-center gap-4 mb-10">
          <div style={{ width: 32, height: 1, background: '#C49434' }} />
          <span style={{
            fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
            fontSize: '0.72rem',
            letterSpacing: '0.2em',
            color: '#C49434',
            textTransform: 'uppercase',
            fontWeight: 500,
          }}>
            Leafilms
          </span>
          <div style={{ width: 32, height: 1, background: '#C49434' }} />
        </div>

        {/* Large 404 */}
        <h1 style={{
          fontFamily: 'var(--font-cormorant), Georgia, serif',
          fontSize: 'clamp(6rem, 20vw, 10rem)',
          fontWeight: 300,
          fontStyle: 'italic',
          lineHeight: 0.9,
          color: '#E8E1D5',
          marginBottom: '1.5rem',
        }}>
          404
        </h1>

        {/* Message */}
        <p style={{
          fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
          fontSize: '0.9rem',
          color: '#62594E',
          letterSpacing: '0.06em',
          lineHeight: 1.7,
          marginBottom: '2.5rem',
        }}>
          Prosjektet finnes ikke<br />eller lenken er utløpt.
          <br />
          <span lang="en" style={{ color: '#4A4238' }}>
            The project does not exist or the link has expired.
          </span>
        </p>

        {/* Divider */}
        <div style={{ width: 1, height: 40, background: 'linear-gradient(to bottom, #38332A, transparent)', margin: '0 auto 2.5rem' }} />

        {/* CTA link */}
        <Link
          href="/"
          className="hover:text-[#C49434] hover:border-[#C49434]"
          style={{
            fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
            fontSize: '0.72rem',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#9E9287',
            textDecoration: 'none',
            borderBottom: '1px solid #38332A',
            paddingBottom: '2px',
            transition: 'color 0.2s, border-color 0.2s',
          }}
        >
          Tilbake til forsiden · Back to home
        </Link>
      </div>
    </div>
  )
}

