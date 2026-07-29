import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { getAllGalleriesOverview, getStandaloneGalleries } from '@/lib/actions/selection-albums'
import CreateStandaloneGalleryButton from './CreateStandaloneGalleryButton'

export default async function SelectionsOverviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [projects, standaloneGalleries] = await Promise.all([
    getAllGalleriesOverview(),
    getStandaloneGalleries(),
  ])

  const C = {
    bg: '#181920', surface: '#21212D', surface2: '#2A2A38',
    border: '#3C3C52', text: '#EEEEF2', text2: '#B4B4CC', text3: '#8484A0',
    accent: '#7C5CFC', accentBg: 'rgba(124,92,252,0.10)',
  }

  const galleryStatusMap: Record<string, { label: string; color: string }> = {
    open:      { label: 'Åpen',     color: '#4CAF7D' },
    submitted: { label: 'Innsendt', color: '#C49434' },
    purged:    { label: 'Slettet',  color: '#8484A0' },
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '32px 24px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
          <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.2rem', fontWeight: 700, color: C.text }}>
            Gallerier
          </h1>
          <CreateStandaloneGalleryButton />
        </div>
        <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, marginBottom: 28 }}>
          Prosjekter i post-prod med aktiv seleksjonsfase
        </p>

        {projects.length === 0 ? (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '40px 24px', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text3 }}>
              Ingen prosjekter i seleksjonsfasen akkurat nå.
            </p>
          </div>
        ) : (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Prosjekt', 'Galleri', 'Album', 'Valgt', 'Innsendt'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: C.text3, fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projects.map((p, i) => {
                  const st = p.galleryStatus ? (galleryStatusMap[p.galleryStatus] ?? galleryStatusMap.open) : null
                  return (
                    <tr
                      key={p.projectId}
                      style={{ borderBottom: i < projects.length - 1 ? `1px solid ${C.border}` : 'none' }}
                    >
                      <td style={{ padding: '13px 16px' }}>
                        <Link
                          href={`/admin/projects/${p.projectId}/selection?from=/admin/selections`}
                          style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.text, textDecoration: 'none' }}
                        >
                          {p.projectName}
                        </Link>
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        {st ? (
                          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, color: st.color }}>{st.label}</span>
                        ) : (
                          <Link
                            href={`/admin/projects/${p.projectId}/selection?from=/admin/selections`}
                            style={{
                              fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600,
                              color: C.accent, textDecoration: 'none',
                              padding: '3px 10px', border: `1px solid ${C.accent}`,
                              borderRadius: 6, background: C.accentBg,
                            }}
                          >
                            + Opprett galleri
                          </Link>
                        )}
                      </td>
                      <td style={{ padding: '13px 16px', fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: p.galleryId ? C.text2 : C.text3 }}>
                        {p.galleryId ? p.albumCount : '—'}
                      </td>
                      <td style={{ padding: '13px 16px', fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: p.galleryId ? C.text2 : C.text3 }}>
                        {p.galleryId ? `${p.totalSelected}${p.targetCount ? ` / ${p.targetCount}` : ''}` : '—'}
                      </td>
                      <td style={{ padding: '13px 16px', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>
                        {p.submittedAt ? new Date(p.submittedAt).toLocaleDateString('nb-NO') : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {standaloneGalleries.length > 0 && (
          <>
            <h2 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.95rem', fontWeight: 700, color: C.text, marginTop: 36, marginBottom: 6 }}>
              Frittstående gallerier
            </h2>
            <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, marginBottom: 14 }}>
              Ikke knyttet til noe prosjekt
            </p>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {['Galleri', 'Status', 'Album', 'Valgt', 'Opprettet'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontFamily: 'var(--font-dm-sans)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: C.text3, fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {standaloneGalleries.map((g, i) => {
                    const st = galleryStatusMap[g.status] ?? galleryStatusMap.open
                    return (
                      <tr key={g.galleryId} style={{ borderBottom: i < standaloneGalleries.length - 1 ? `1px solid ${C.border}` : 'none' }}>
                        <td style={{ padding: '13px 16px' }}>
                          <Link
                            href={`/admin/selections/${g.galleryId}`}
                            style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.85rem', fontWeight: 600, color: C.text, textDecoration: 'none' }}
                          >
                            Galleri {g.galleryId.slice(0, 8)}
                          </Link>
                        </td>
                        <td style={{ padding: '13px 16px' }}>
                          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.72rem', fontWeight: 600, color: st.color }}>{st.label}</span>
                        </td>
                        <td style={{ padding: '13px 16px', fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text2 }}>{g.albumCount}</td>
                        <td style={{ padding: '13px 16px', fontFamily: 'var(--font-dm-sans)', fontSize: '0.82rem', color: C.text2 }}>
                          {g.totalSelected}{g.targetCount ? ` / ${g.targetCount}` : ''}
                        </td>
                        <td style={{ padding: '13px 16px', fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>
                          {new Date(g.createdAt).toLocaleDateString('nb-NO')}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
