import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase-server'
import { Project, Section, Image, SectionImage, VideoLibrary, SectionVideo, OurSignature } from '@/lib/types'
import SigningProjectClient from './SigningProjectClientNoSSR'

// Disable caching for this page to ensure fresh data
export const dynamic = 'force-dynamic'
export const revalidate = 0

type Props = {
  params: Promise<{ token: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params

  if (!token || typeof token !== 'string' || token.trim() === '') {
    return { title: 'Leafilms' }
  }

  // Service-klient — token-sjekket under er den faktiske autorisasjonsgrensen for denne siden;
  // anon-nøkkelen skal ikke ha direkte RLS-tilgang til project_shares/contracts/quotes lenger.
  const supabase = createServiceClient()

  const { data: share } = await supabase
    .from('project_shares')
    .select('project_id')
    .eq('token', token.trim())
    .single()

  if (!share?.project_id) return { title: 'Leafilms' }

  const { data: project } = await supabase
    .from('projects')
    .select('title, status, language')
    .eq('id', share.project_id)
    .single()

  if (!project || project.status !== 'published') return { title: 'Leafilms' }

  const isEnglish = project.language === 'en'

  const title = project.title
    ? `${project.title} — Leafilms`
    : isEnglish
      ? 'Agreement — Leafilms'
      : 'Avtale — Leafilms'

  return {
    title,
    robots: {
      index: false,
      follow: false,
    },
  }
}

export default async function SigningProjectView({ params }: Props) {
  const { token } = await params

  if (!token || typeof token !== 'string' || token.trim() === '') {
    console.error('[SigningProjectView] Invalid or missing token')
    notFound()
  }

  // Service-klient — token-sjekket under er den faktiske autorisasjonsgrensen for denne siden;
  // anon-nøkkelen skal ikke ha direkte RLS-tilgang til project_shares/contracts/quotes lenger.
  const supabase = createServiceClient()

  const { data: share, error: shareError } = await supabase
    .from('project_shares')
    .select('project_id')
    .eq('token', token.trim())
    .single()

  if (shareError || !share?.project_id) {
    console.error('[SigningProjectView] No share found for token:', token.substring(0, 10) + '...')
    notFound()
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', share.project_id)
    .single()

  if (projectError || !project) {
    console.error('[SigningProjectView] Error fetching project:', projectError)
    notFound()
  }

  if (project.status !== 'published') {
    console.error('[SigningProjectView] Project is not published:', project.id)
    notFound()
  }

  // Hent kun hero-, quote- og kontakt-seksjonene — dette er den slanke signeringsvisningen
  const { data: sections, error: sectionsError } = await supabase
    .from('sections')
    .select('*')
    .eq('project_id', share.project_id)
    .eq('visible', true)
    .in('type', ['hero', 'quote', 'contact'])
    .order('order_index', { ascending: true })

  if (sectionsError) {
    console.error('[SigningProjectView] Error fetching sections:', sectionsError)
  }

  const sectionsList = (sections || []) as Section[]
  const heroSection = sectionsList.find(s => s.type === 'hero')

  // Hent bilder/videoer kun for hero-seksjonen (header)
  const sectionImages: Record<string, Image[]> = {}
  const sectionImageData: Record<string, SectionImage[]> = {}
  const sectionVideos: Record<string, VideoLibrary[]> = {}
  const sectionVideoData: Record<string, SectionVideo[]> = {}

  if (heroSection) {
    const [
      { data: heroImageRows },
      { data: heroVideoRows }
    ] = await Promise.all([
      supabase.from('section_images').select('*').eq('section_id', heroSection.id).order('order_index', { ascending: true }),
      supabase.from('section_video_library').select('*').eq('section_id', heroSection.id).order('order_index', { ascending: true })
    ])

    if (heroImageRows && heroImageRows.length > 0) {
      sectionImageData[heroSection.id] = heroImageRows as SectionImage[]
      const imageIds = heroImageRows.map(r => r.image_id)
      const { data: imagesData } = await supabase.from('images').select('*').in('id', imageIds)
      if (imagesData) {
        const imageMap = new Map(imagesData.map(img => [img.id, img]))
        const sorted = heroImageRows.map(r => imageMap.get(r.image_id)).filter(Boolean) as Image[]
        if (sorted.length > 0) sectionImages[heroSection.id] = sorted
      }
    }

    if (heroVideoRows && heroVideoRows.length > 0) {
      sectionVideoData[heroSection.id] = heroVideoRows as SectionVideo[]
      const videoIds = heroVideoRows.map(r => r.video_id)
      const { data: videosData } = await supabase.from('video_library').select('*').in('id', videoIds)
      if (videosData) {
        const videoMap = new Map(videosData.map(v => [v.id, v]))
        const sorted = heroVideoRows.map(r => videoMap.get(r.video_id)).filter(Boolean) as VideoLibrary[]
        if (sorted.length > 0) sectionVideos[heroSection.id] = sorted
      }
    }
  }

  // Hent publisert kontrakt (gjeldende versjon)
  const { data: contractData } = await supabase
    .from('contracts')
    .select('contract_text, published_at, status, signed_at, signed_by, our_signature, pdf_url')
    .eq('project_id', share.project_id)
    .eq('is_current', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const contractHiddenFromPitch = !!(project.pipeline_data as { contract_hidden_from_pitch?: boolean } | null)?.contract_hidden_from_pitch

  const publishedContract = contractData?.published_at && !contractHiddenFromPitch ? {
    contractText: contractData.contract_text ?? '',
    isSigned: contractData.status === 'signed',
    signedBy: contractData.signed_by ?? null,
    ourSignature: (contractData.our_signature as OurSignature | null) ?? null,
    pdfUrl: contractData.pdf_url ?? null,
  } : null

  return (
    <SigningProjectClient
      project={project as Project}
      sections={sectionsList}
      sectionImages={sectionImages}
      sectionImageData={sectionImageData}
      sectionVideos={sectionVideos}
      sectionVideoData={sectionVideoData}
      shareToken={token}
      publishedContract={publishedContract}
      projectId={share.project_id}
    />
  )
}
