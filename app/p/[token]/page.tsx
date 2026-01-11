import { notFound } from 'next/navigation'
import { createPublicClient } from '@/lib/supabase-server'
import { Project, Section, CaseStudy, TeamMember, Image, SectionImage, CollagePreset } from '@/lib/types'
import { PublicProjectClient } from './PublicProjectClient'
import { CollageImages } from '@/components/sections'

// Disable caching for this page to ensure fresh data
export const dynamic = 'force-dynamic'
export const revalidate = 0

type Props = {
  params: Promise<{ token: string }>
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

  // Debug: Log sections count
  console.log('[PublicProjectView] Fetched sections:', {
    count: sections?.length || 0,
    project_id: share.project_id,
    error: sectionsError?.message
  })

  // Hent ALLE seksjoner (inkludert usynlige) for debugging
  const { data: allSections } = await supabase
    .from('sections')
    .select('*')
    .eq('project_id', share.project_id)
    .order('order_index', { ascending: true })

  console.log('[PublicProjectView] All sections (including invisible):', {
    count: allSections?.length || 0,
    sections: allSections?.map(s => ({ id: s.id, type: s.type, visible: s.visible }))
  })

  const sectionsList = (sections || []) as Section[]

  // Hvis ingen seksjoner, log dette som en advarsel (ikke feil, kan være normalt)
  if (sectionsList.length === 0) {
    console.warn('[PublicProjectView] No visible sections found for project:', {
      project_id: share.project_id,
      project_title: project.title,
      all_sections_count: allSections?.length || 0
    })
  }

  // Hent alle seksjonsbilder - samme metode som i edit-siden
  const sectionImages: Record<string, Image[]> = {}
  const sectionImageData: Record<string, SectionImage[]> = {}
  
  for (const section of sectionsList) {
    const { data: sectionImagesData, error: sectionImagesError } = await supabase
      .from('section_images')
      .select('*')
      .eq('section_id', section.id)
    
    // Sorter manuelt i stedet for .order() (kan gi 400 feil)
    const sortedSectionImagesData = sectionImagesData?.sort((a, b) => (a.order_index || 0) - (b.order_index || 0))

    if (sectionImagesError) {
      console.error(`[Public] Error fetching section images for section ${section.id} (${section.type}):`, sectionImagesError)
      continue
    }

    if (sortedSectionImagesData && sortedSectionImagesData.length > 0) {
      console.log(`[Public] Found ${sortedSectionImagesData.length} section images for section ${section.id} (${section.type}):`, sortedSectionImagesData.map(si => ({ id: si.id, image_id: si.image_id, order_index: si.order_index })))
      sectionImageData[section.id] = sortedSectionImagesData as SectionImage[]
      
      const imageIds = sortedSectionImagesData.map(si => si.image_id)
      console.log(`[Public] Fetching images for section ${section.id} (${section.type}):`, imageIds)
      const { data: imagesData, error: imagesError } = await supabase
        .from('images')
        .select('*')
        .in('id', imageIds)

      if (imagesError) {
        console.error(`[Public] Error fetching images for section ${section.id} (${section.type}):`, imagesError)
        continue
      }

      console.log(`[Public] Raw imagesData for section ${section.id} (${section.type}):`, imagesData?.length || 0, 'images found')

      if (imagesData && imagesData.length > 0) {
        // Sorter bildene i samme rekkefølge som section_images
        const sortedImages = imageIds
          .map(id => imagesData.find(img => img.id === id))
          .filter(Boolean) as Image[]
        
        console.log(`[Public] Sorted ${sortedImages.length} images for section ${section.id} (${section.type})`)
        
        if (sortedImages.length !== imageIds.length) {
          console.warn(`[Public] WARNING: Expected ${imageIds.length} images but got ${sortedImages.length} for section ${section.id} (${section.type})`)
          const missingIds = imageIds.filter(id => !sortedImages.find(img => img.id === id))
          console.warn(`[Public] Missing image IDs:`, missingIds)
        }
        
        sectionImages[section.id] = sortedImages
        console.log(`[Public] Loaded ${sortedImages.length} images for section ${section.id} (${section.type}):`, sortedImages.map((img, idx) => ({ 
          index: idx, 
          id: img.id, 
          title: img.title, 
          file_path: img.file_path?.substring(0, 50) + '...',
          order_index: sortedSectionImagesData[idx]?.order_index 
        })))
        console.log(`[Public] Image IDs for section ${section.id} (${section.type}):`, sortedImages.map(img => img.id).join(', '))
      } else {
        console.warn(`[Public] No images found for section ${section.id} (${section.type}) despite having ${imageIds.length} section_images`)
        console.warn(`[Public] Image IDs that were requested:`, imageIds)
      }
    } else {
      console.log(`[Public] No section images found for section ${section.id} (${section.type})`)
    }
  }
  
  console.log('[Public] Final sectionImages:', Object.keys(sectionImages).reduce((acc, key) => {
    const section = sectionsList.find(s => s.id === key)
    acc[`${section?.type || key}`] = sectionImages[key].map((img, idx) => ({ 
      index: idx, 
      id: img.id, 
      title: img.title,
      file_path: img.file_path?.substring(0, 50) + '...'
    }))
    return acc
  }, {} as Record<string, any[]>))

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
      teamMembers={teamMembers}
      caseStudies={caseStudies}
      collageImages={collageImages}
      selectedPreset={selectedPreset}
      shareToken={token}
    />
  )
}
