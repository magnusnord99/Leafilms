import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-server'
import { getProjectForTransfer } from '@/lib/actions/transfers'
import TransferUploadClient from './TransferUploadClient'

const C = {
  bg: '#181920', surface: '#21212D',
  border: '#3C3C52', text: '#EEEEF2', text2: '#B4B4CC', text3: '#8484A0',
}

type Props = {
  searchParams: Promise<{ projectId?: string; type?: string }>
}

export default async function NewTransferPage({ searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { projectId, type } = await searchParams

  const project = projectId ? await getProjectForTransfer(projectId) : null
  const deliveryType = (type === 'photo' ? 'photo' : type === 'video' ? 'video' : null) as 'video' | 'photo' | null

  const pageTitle = project
    ? `Lever ${deliveryType === 'photo' ? 'bilder' : deliveryType === 'video' ? 'film' : 'filer'} — ${project.title}`
    : 'Ny leveranse'

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '32px 24px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24 }}>
          {project && (
            <>
              <Link href={`/admin/postprod/${project.id}`} style={{ textDecoration: 'none' }}>
                <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>
                  {project.title}
                </span>
              </Link>
              <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>/</span>
            </>
          )}
          <Link href="/admin/transfers" style={{ textDecoration: 'none' }}>
            <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>
              Leveranser
            </span>
          </Link>
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3 }}>/</span>
          <span style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text }}>
            {deliveryType === 'photo' ? 'Lever bilder' : deliveryType === 'video' ? 'Lever film' : 'Ny leveranse'}
          </span>
        </div>

        <h1 style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '1.2rem', fontWeight: 700, color: C.text, marginBottom: 4 }}>
          {pageTitle}
        </h1>
        {project?.customer && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, marginBottom: 32 }}>
            Til {project.customer.name}{project.customer.company ? ` — ${project.customer.company}` : ''}
            {project.customer.email ? ` · ${project.customer.email}` : ''}
          </p>
        )}
        {!project?.customer && (
          <p style={{ fontFamily: 'var(--font-dm-sans)', fontSize: '0.78rem', color: C.text3, marginBottom: 32 }}>
            Last opp filen og oppgi mottakerinformasjon — kunden får en nedlastingslenke
          </p>
        )}

        <TransferUploadClient
          initialProject={project}
          deliveryType={deliveryType}
        />
      </div>
    </div>
  )
}
