import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase-server'
import { Project, Section, CaseStudy, TeamMember, Image, SectionImage, VideoLibrary, SectionVideo, CollagePreset } from '@/lib/types'
import { CollageImages } from '@/components/sections'
import PublicProjectClient from './PublicProjectClientNoSSR'

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

  const supabase = createPublicClient()

  const { data: share } = await supabase
    .from('project_shares')
    .select('project_id')
    .eq('token', token.trim())
    .single()

  if (!share?.project_id) return { title: 'Leafilms' }

  const { data: project } = await supabase
    .from('projects')
    .select('name, description, status')
    .eq('id', share.project_id)
    .single()

  if (!project || project.status !== 'published') return { title: 'Leafilms' }

  const title = project.name
    ? `${project.name} — Leafilms`
    : 'Prosjektbeskrivelse — Leafilms'

  const description = project.description
    || 'Cinematisk innholdsproduksjon av høy kvalitet. Se vår prosjektbeskrivelse og pristilbud.'

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://leafilms.no'
  const pageUrl = `${siteUrl}/p/${token}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: 'Leafilms',
      type: 'website',
      images: [
        {
          url: `${siteUrl}/og-default.jpg`,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${siteUrl}/og-default.jpg`],
    },
    robots: {
      index: false,
      follow: false,
    },
  }
}

export default async function PublicProjectView({ params }: Props) {
  const { token } = await params
  
  // Validate token
  if (!token || typeof token !== 'string' || token.trim() === '') {
    console.error('[PublicProjectView] Invalid or missing token')
    notFound()
  }

  const supabase = createPublicClient()

  // Finn prosjekt fra token
  const { data: share, error: shareError } = await supabase
    .from('project_shares')
    .select('project_id')
    .eq('token', token.trim())
    .single()

  if (shareError) {
    console.error('[PublicProjectView] Error fetching share:', {
      error: shareError,
      message: shareError.message,
      code: shareError.code,
      details: shareError.details,
      hint: shareError.hint,
      token: token.substring(0, 10) + '...' // Log first 10 chars only
    })
    notFound()
  }

  if (!share || !share.project_id) {
    console.error('[PublicProjectView] No share found for token:', token.substring(0, 10) + '...')
    notFound()
  }

  // Hent prosjekt
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', share.project_id)
    .single()

  if (projectError) {
    console.error('[PublicProjectView] Error fetching project:', projectError)
    notFound()
  }

  if (!project) {
    console.error('[PublicProjectView] No project found for id:', share.project_id)
    notFound()
  }

  // Check if project is published
  if (project.status !== 'published') {
    console.error('[PublicProjectView] Project is not published:', {
      project_id: project.id,
      status: project.status
    })
    notFound()
  }

  // Hent synlige seksjoner
  const { data: sections, error: sectionsError } = await supabase
    .from('sections')
    .select('*')
    .eq('project_id', share.project_id)
    .eq('visible', true)
    .order('order_index', { ascending: true })

  if (sectionsError) {
    console.error('[PublicProjectView] Error fetching sections:', sectionsError)
  }

  const sectionsList = (sections || []) as Section[]

  // Hent alle seksjonsbilder og videoer - batch-spørringer i stedet for N+1 loop
  const sectionImages: Record<string, Image[]> = {}
  const sectionImageData: Record<string, SectionImage[]> = {}
  const sectionVideos: Record<string, VideoLibrary[]> = {}
  const sectionVideoData: Record<string, SectionVideo[]> = {}

  if (sectionsList.length > 0) {
    const sectionIds = sectionsList.map(s => s.id)

    // Hent alle section_images og section_video_library for alle seksjoner i én spørring
    const [
      { data: allSectionImagesData },
      { data: allSectionVideosData }
    ] = await Promise.all([
      supabase.from('section_images').select('*').in('section_id', sectionIds),
      supabase.from('section_video_library').select('*').in('section_id', sectionIds)
    ])

    // Bygg sectionImageData - gruppert per seksjon, sortert på order_index
    if (allSectionImagesData) {
      for (const row of allSectionImagesData) {
        if (!sectionImageData[row.section_id]) sectionImageData[row.section_id] = []
        sectionImageData[row.section_id].push(row as SectionImage)
      }
      for (const sid of Object.keys(sectionImageData)) {
        sectionImageData[sid].sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
      }
    }
    // Hent alle unike bilde-IDer og last dem i én spørring
    const allImageIds = [...new Set(
      Object.values(sectionImageData).flatMap(rows => rows.map(r => r.image_id))
    )]
    if (allImageIds.length > 0) {
      const { data: allImagesData } = await supabase
        .from('images')
        .select('*')
        .in('id', allImageIds)

      if (allImagesData) {
        const imageMap = new Map(allImagesData.map(img => [img.id, img]))
        for (const [sid, rows] of Object.entries(sectionImageData)) {
          const sorted = rows
            .map(r => imageMap.get(r.image_id))
            .filter(Boolean) as Image[]
          if (sorted.length > 0) sectionImages[sid] = sorted
        }
      }
    }

    // Bygg sectionVideoData - gruppert per seksjon, sortert på order_index
    if (allSectionVideosData) {
      for (const row of allSectionVideosData) {
        if (!sectionVideoData[row.section_id]) sectionVideoData[row.section_id] = []
        sectionVideoData[row.section_id].push(row as SectionVideo)
      }
      for (const sid of Object.keys(sectionVideoData)) {
        sectionVideoData[sid].sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
      }
    }

    // Hent alle unike video-IDer og last dem i én spørring
    const allVideoIds = [...new Set(
      Object.values(sectionVideoData).flatMap(rows => rows.map(r => r.video_id))
    )]
    if (allVideoIds.length > 0) {
      const { data: allVideosData } = await supabase
        .from('video_library')
        .select('*')
        .in('id', allVideoIds)

      if (allVideosData) {
        const videoMap = new Map(allVideosData.map(v => [v.id, v]))
        for (const [sid, rows] of Object.entries(sectionVideoData)) {
          const sorted = rows
            .map(r => videoMap.get(r.video_id))
            .filter(Boolean) as VideoLibrary[]
          if (sorted.length > 0) sectionVideos[sid] = sorted
        }
      }
    }
  }

  // Hent team members
  const { data: teamMembersData } = await supabase
    .from('team_members')
    .select('*')
    .order('order_index')

  const allTeamMembers = (teamMembersData || []) as TeamMember[]

  // Hent valgte team-medlemmer for team-seksjonen
  const teamSection = sectionsList.find(s => s.type === 'team')
  let selectedTeamMemberIds: string[] = []
  
  if (teamSection) {
    const { data: teamLinks } = await supabase
      .from('section_team_members')
      .select('team_member_id')
      .eq('section_id', teamSection.id)
      .order('order_index', { ascending: true })

    if (teamLinks) {
      selectedTeamMemberIds = teamLinks.map((link: any) => link.team_member_id)
    }
  }

  // Filtrer team members basert på valgte IDs
  const teamMembers = allTeamMembers.filter(m => selectedTeamMemberIds.includes(m.id))

  // Hent case studies
  const casesSection = sectionsList.find(s => s.type === 'cases')
  let caseStudies: CaseStudy[] = []
  
  if (casesSection) {
    const { data: caseLinks } = await supabase
      .from('section_case_studies')
      .select(`
        case_study_id,
        case_studies (*)
      `)
      .eq('section_id', casesSection.id)
      .order('order_index', { ascending: true })

    if (caseLinks) {
      caseStudies = caseLinks
        .map((link: any) => link.case_studies)
        .filter(Boolean) as CaseStudy[]
    }
  }

  // Hent collage bilder for example_work fra section_images (samme som edit-siden)
  const exampleWorkSection = sectionsList.find(s => s.type === 'example_work')
  const collageImages: CollageImages = {
    pos1: null,
    pos2: null,
    pos3: null,
    pos4: null,
    pos5: null
  }
  
  if (exampleWorkSection) {
    // Hent bildene fra section_images (samme metode som edit-siden)
    const sectionImagesForExampleWork = sectionImages[exampleWorkSection.id] || []
    
    // Map bildene til posisjoner basert på order_index (0 = pos1, 1 = pos2, osv.)
    collageImages.pos1 = sectionImagesForExampleWork[0] || null
    collageImages.pos2 = sectionImagesForExampleWork[1] || null
    collageImages.pos3 = sectionImagesForExampleWork[2] || null
    collageImages.pos4 = sectionImagesForExampleWork[3] || null
    collageImages.pos5 = sectionImagesForExampleWork[4] || null
  }

  // Hent selected preset (optional)
  let selectedPreset: CollagePreset | null = null
  
  if (exampleWorkSection?.content?.presetId) {
    const { data: preset } = await supabase
      .from('collage_presets')
      .select('*')
      .eq('id', exampleWorkSection.content.presetId)
      .single()
    
    selectedPreset = preset as CollagePreset | null
  }

  // Oppdater view count
  const { data: currentShare } = await supabase
    .from('project_shares')
    .select('view_count')
    .eq('token', token)
    .single()

  if (currentShare) {
    await supabase
      .from('project_shares')
      .update({
        view_count: (currentShare.view_count || 0) + 1,
        last_viewed_at: new Date().toISOString()
      })
      .eq('token', token)
  }

  return (
    <PublicProjectClient
      project={project as Project}
      sections={sectionsList}
      sectionImages={sectionImages}
      sectionImageData={sectionImageData}
      sectionVideos={sectionVideos}
      sectionVideoData={sectionVideoData}
      teamMembers={teamMembers}
      caseStudies={caseStudies}
      collageImages={collageImages}
      selectedPreset={selectedPreset}
      shareToken={token}
    />
  )
}
