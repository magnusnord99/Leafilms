import { NextRequest } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase-server'

/**
 * POST /api/projects/[id]/duplicate
 * Kopierer et prosjekt til en ny versjon (V2, V3, osv.)
 * Kopierer: sections, section_images, section_team_members, section_case_studies,
 * section_video_library, project_collage_images
 * Kopierer IKKE: quotes, contracts, project_shares (ny versjon starter som draft)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params
    if (!projectId) {
      return Response.json({ error: 'Mangler prosjekt-ID' }, { status: 400 })
    }

    const authClient = await createClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await authClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }

    const supabase = createServiceClient()

    // 1. Hent kilde-prosjekt
    const { data: sourceProject, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (projectError || !sourceProject) {
      return Response.json({ error: 'Prosjekt ikke funnet' }, { status: 404 })
    }

    // 2. Finn neste versjonsnummer
    const rootId = sourceProject.parent_project_id ?? sourceProject.id
    const { data: siblings } = await supabase
      .from('projects')
      .select('*')
      .or(`id.eq.${rootId},parent_project_id.eq.${rootId}`)

    const maxVersion = siblings?.reduce(
      (max, p) => Math.max(max, (p as { version_number?: number }).version_number ?? 1),
      0
    )
    const nextVersion = maxVersion + 1

    // 3. Generer ny tittel og slug
    const baseTitle = sourceProject.title.replace(/\s+V\d+$/, '')
    const newTitle = `${baseTitle} V${nextVersion}`
    const baseSlug = newTitle
      .toLowerCase()
      .replace(/æ/g, 'ae')
      .replace(/ø/g, 'o')
      .replace(/å/g, 'aa')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
    const uniqueSuffix = Date.now().toString(36).slice(-6)
    const newSlug = `${baseSlug}-${uniqueSuffix}`

    // 4. Opprett nytt prosjekt (draft, ingen project_shares)
    // V2+ har alltid parent_project_id = root (V1)
    const { data: newProject, error: insertError } = await supabase
      .from('projects')
      .insert({
        title: newTitle,
        slug: newSlug,
        client_name: sourceProject.client_name,
        customer_id: sourceProject.customer_id,
        status: 'draft',
        parent_project_id: nextVersion > 1 ? rootId : null,
        version_number: nextVersion,
        metadata: sourceProject.metadata ?? {},
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error creating project:', insertError)
      return Response.json(
        { error: 'Kunne ikke opprette ny versjon', details: insertError.message },
        { status: 500 }
      )
    }

    const newProjectId = newProject.id

    // 5. Hent og kopier sections
    const { data: sections, error: sectionsError } = await supabase
      .from('sections')
      .select('*')
      .eq('project_id', projectId)
      .order('order_index')

    if (sectionsError) {
      console.error('Error fetching sections:', sectionsError)
      return Response.json(
        { error: 'Kunne ikke hente seksjoner', details: sectionsError.message },
        { status: 500 }
      )
    }

    const sectionIdMap: Record<string, string> = {}

    for (const section of sections || []) {
      const { id, created_at, updated_at, ...sectionData } = section
      const { data: newSection, error: sectionInsertError } = await supabase
        .from('sections')
        .insert({
          ...sectionData,
          project_id: newProjectId,
        })
        .select('id')
        .single()

      if (sectionInsertError) {
        console.error('Error copying section:', sectionInsertError)
        continue
      }
      sectionIdMap[section.id] = newSection.id
    }

    // 6. Kopier section_images
    for (const [oldSectionId, newSectionId] of Object.entries(sectionIdMap)) {
      const { data: sectionImages } = await supabase
        .from('section_images')
        .select('*')
        .eq('section_id', oldSectionId)

      if (sectionImages?.length) {
        const inserts = sectionImages.map(({ id, created_at, updated_at, ...img }) => ({
          ...img,
          section_id: newSectionId,
        }))
        await supabase.from('section_images').insert(inserts)
      }
    }

    // 7. Kopier section_team_members
    for (const [oldSectionId, newSectionId] of Object.entries(sectionIdMap)) {
      const { data: teamMembers } = await supabase
        .from('section_team_members')
        .select('team_member_id, order_index')
        .eq('section_id', oldSectionId)

      if (teamMembers?.length) {
        const inserts = teamMembers.map((tm) => ({
          section_id: newSectionId,
          team_member_id: tm.team_member_id,
          order_index: tm.order_index,
        }))
        await supabase.from('section_team_members').insert(inserts)
      }
    }

    // 8. Kopier section_case_studies
    for (const [oldSectionId, newSectionId] of Object.entries(sectionIdMap)) {
      const { data: caseStudies } = await supabase
        .from('section_case_studies')
        .select('case_study_id, order_index')
        .eq('section_id', oldSectionId)

      if (caseStudies?.length) {
        const inserts = caseStudies.map((cs) => ({
          section_id: newSectionId,
          case_study_id: cs.case_study_id,
          order_index: cs.order_index,
        }))
        await supabase.from('section_case_studies').insert(inserts)
      }
    }

    // 9. Kopier section_video_library
    for (const [oldSectionId, newSectionId] of Object.entries(sectionIdMap)) {
      const { data: videos } = await supabase
        .from('section_video_library')
        .select('video_id, order_index, position, autoplay, loop, muted')
        .eq('section_id', oldSectionId)

      if (videos?.length) {
        const inserts = videos.map((v) => ({
          section_id: newSectionId,
          video_id: v.video_id,
          order_index: v.order_index,
          position: v.position,
          autoplay: v.autoplay,
          loop: v.loop,
          muted: v.muted,
        }))
        await supabase.from('section_video_library').insert(inserts)
      }
    }

    // 10. Kopier project_collage_images
    const { data: collageImages } = await supabase
      .from('project_collage_images')
      .select('*')
      .eq('project_id', projectId)

    if (collageImages?.length) {
      const inserts = collageImages
        .filter((ci) => sectionIdMap[ci.section_id])
        .map(({ id, created_at, updated_at, ...ci }) => ({
          ...ci,
          project_id: newProjectId,
          section_id: sectionIdMap[ci.section_id],
        }))
      if (inserts.length) {
        await supabase.from('project_collage_images').insert(inserts)
      }
    }

    return Response.json({
      success: true,
      project: newProject,
      message: `Ny versjon V${nextVersion} opprettet`,
    })
  } catch (error: unknown) {
    console.error('Error duplicating project:', error)
    return Response.json(
      {
        error: 'Kunne ikke kopiere prosjekt',
        details: error instanceof Error ? error.message : 'Ukjent feil',
      },
      { status: 500 }
    )
  }
}
