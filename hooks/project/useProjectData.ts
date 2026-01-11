import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Project, Section, CaseStudy, TeamMember, Image, SectionImage } from '@/lib/types'

export function useProjectData(projectId: string) {
  const [loading, setLoading] = useState(true)
  const [project, setProject] = useState<Project | null>(null)
  const [sections, setSections] = useState<Section[]>([])
  const [shareLink, setShareLink] = useState<string | null>(null)
  const [allCases, setAllCases] = useState<CaseStudy[]>([])
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([])
  const [selectedCases, setSelectedCases] = useState<CaseStudy[]>([])
  const [allTeamMembers, setAllTeamMembers] = useState<TeamMember[]>([])
  const [selectedTeamMemberIds, setSelectedTeamMemberIds] = useState<string[]>([])
  const [sectionImages, setSectionImages] = useState<Record<string, Image[]>>({})
  const [sectionImageData, setSectionImageData] = useState<Record<string, SectionImage[]>>({})

  async function fetchData() {
    try {
        // Hent prosjekt
        const { data: projectData, error: projectError } = await supabase
          .from('projects')
          .select('*')
          .eq('id', projectId)
          .single()

        if (projectError) throw projectError
        setProject(projectData)

        // Hent seksjoner
        const { data: sectionsData, error: sectionsError } = await supabase
          .from('sections')
          .select('*')
          .eq('project_id', projectId)
          .order('order_index', { ascending: true })

        if (sectionsError) throw sectionsError
        
        // Fikse rekkefølge: Deliverables skal komme rett etter Goal
        const sectionsList = (sectionsData || []) as Section[]
        const goalSection = sectionsList.find(s => s.type === 'goal')
        const deliverablesSection = sectionsList.find(s => s.type === 'deliverables')
        
        if (goalSection && deliverablesSection && deliverablesSection.order_index !== goalSection.order_index + 1) {
          // Oppdater order_index: Deliverables skal komme rett etter Goal
          await supabase
            .from('sections')
            .update({ order_index: goalSection.order_index + 1, updated_at: new Date().toISOString() })
            .eq('id', deliverablesSection.id)
          
          // Flytt alle andre seksjoner som kom etter goal én plass ned
          for (const section of sectionsList) {
            if (section.type !== 'deliverables' && section.order_index > goalSection.order_index) {
              await supabase
                .from('sections')
                .update({ order_index: section.order_index + 1, updated_at: new Date().toISOString() })
                .eq('id', section.id)
            }
          }
          
          // Hent oppdaterte seksjoner på nytt
          const { data: updatedSectionsData } = await supabase
            .from('sections')
            .select('*')
            .eq('project_id', projectId)
            .order('order_index', { ascending: true })
          
          setSections(updatedSectionsData || [])
        } else {
          setSections(sectionsList)
        }

        // Sjekk om prosjekt allerede er publisert
        const { data: shareData } = await supabase
          .from('project_shares')
          .select('token')
          .eq('project_id', projectId)
          .single()

        if (shareData) {
          setShareLink(`${window.location.origin}/p/${shareData.token}`)
        }

        // Hent alle case studies
        const { data: casesData } = await supabase
          .from('case_studies')
          .select('*')
          .order('order_index', { ascending: true })

        setAllCases((casesData || []) as CaseStudy[])

        // Hent valgte cases for "Tidligere arbeid"-seksjon
        const casesSection = sectionsData?.find(s => s.type === 'cases')
        if (casesSection) {
          const { data: selectedData } = await supabase
            .from('section_case_studies')
            .select('case_study_id')
            .eq('section_id', casesSection.id)
            .order('order_index', { ascending: true })

          if (selectedData) {
            setSelectedCaseIds(selectedData.map(s => s.case_study_id))
          }
        }

        // Hent alle team-medlemmer
        const { data: teamData } = await supabase
          .from('team_members')
          .select('*')
          .order('order_index', { ascending: true })

        setAllTeamMembers((teamData || []) as TeamMember[])

        // Hent valgte team-medlemmer for "Team"-seksjon
        const teamSection = sectionsData?.find(s => s.type === 'team')
        if (teamSection) {
          const { data: selectedTeamData } = await supabase
            .from('section_team_members')
            .select('team_member_id')
            .eq('section_id', teamSection.id)
            .order('order_index', { ascending: true })

          if (selectedTeamData) {
            setSelectedTeamMemberIds(selectedTeamData.map(s => s.team_member_id))
          }
        }

        // Hent bilder for alle seksjoner
        const imagesMap: Record<string, Image[]> = {}
        const sectionImageDataMap: Record<string, SectionImage[]> = {}
        for (const section of sectionsData || []) {
          const { data: sectionImagesData, error: sectionImagesError } = await supabase
            .from('section_images')
            .select('*')
            .eq('section_id', section.id)
          
          // Sorter manuelt i stedet for .order() (kan gi 400 feil)
          const sortedSectionImagesData = sectionImagesData?.sort((a, b) => (a.order_index || 0) - (b.order_index || 0))

          if (sectionImagesError) {
            console.error(`Error fetching section images for section ${section.id}:`, sectionImagesError)
            continue
          }

          if (sortedSectionImagesData && sortedSectionImagesData.length > 0) {
            console.log(`Found ${sortedSectionImagesData.length} section images for section ${section.id}:`, sortedSectionImagesData)
            sectionImageDataMap[section.id] = sortedSectionImagesData as SectionImage[]
            
            const imageIds = sortedSectionImagesData.map(si => si.image_id)
            const { data: imagesData, error: imagesError } = await supabase
              .from('images')
              .select('*')
              .in('id', imageIds)

            if (imagesError) {
              console.error(`Error fetching images for section ${section.id}:`, imagesError)
              continue
            }

            if (imagesData) {
              // Sorter bildene i samme rekkefølge som section_images
              const sortedImages = imageIds
                .map(id => imagesData.find(img => img.id === id))
                .filter(Boolean) as Image[]
              imagesMap[section.id] = sortedImages
              console.log(`Loaded ${sortedImages.length} images for section ${section.id} (${section.type}):`, sortedImages.map((img, idx) => ({ 
                index: idx, 
                id: img.id, 
                title: img.title, 
                file_path: img.file_path?.substring(0, 50) + '...',
                order_index: sortedSectionImagesData[idx]?.order_index 
              })))
              console.log(`[Edit] Image IDs for section ${section.id} (${section.type}):`, sortedImages.map(img => img.id).join(', '))
            } else {
              console.warn(`No images found for section ${section.id} despite having section_images`)
            }
          } else {
            console.log(`No section images found for section ${section.id}`)
          }
        }
        console.log('Final imagesMap:', imagesMap)
        console.log('Final sectionImageDataMap:', sectionImageDataMap)
        setSectionImages(imagesMap)
        setSectionImageData(sectionImageDataMap)
      } catch (error) {
        console.error('Error fetching data:', error)
        alert('Kunne ikke hente prosjektet')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [projectId])

  // Oppdater selectedCases når selectedCaseIds endres
  useEffect(() => {
    const cases = allCases.filter(c => selectedCaseIds.includes(c.id))
    setSelectedCases(cases)
  }, [selectedCaseIds, allCases])

  return {
    loading,
    project,
    setProject,
    sections,
    setSections,
    shareLink,
    setShareLink,
    allCases,
    selectedCaseIds,
    setSelectedCaseIds,
    selectedCases,
    allTeamMembers,
    selectedTeamMemberIds,
    setSelectedTeamMemberIds,
    sectionImages,
    setSectionImages,
    sectionImageData,
    setSectionImageData,
    refreshData: fetchData
  }
}

