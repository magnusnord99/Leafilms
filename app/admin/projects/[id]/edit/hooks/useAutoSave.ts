import { useRef, useCallback } from 'react'
import { Section } from '@/lib/types'
import { supabase } from '@/lib/supabase'

export function useAutoSave(
  sections: Section[],
  editMode: boolean,
  projectId: string,
  casesSectionId: string | undefined,
  selectedCaseIds: string[],
  teamSectionId: string | undefined,
  selectedTeamMemberIds: string[]
) {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const sectionsRef = useRef<Section[]>(sections)
  const casesSectionIdRef = useRef<string | undefined>(casesSectionId)
  const selectedCaseIdsRef = useRef<string[]>(selectedCaseIds)
  const teamSectionIdRef = useRef<string | undefined>(teamSectionId)
  const selectedTeamMemberIdsRef = useRef<string[]>(selectedTeamMemberIds)

  // Oppdater refs når de endres
  sectionsRef.current = sections
  casesSectionIdRef.current = casesSectionId
  selectedCaseIdsRef.current = selectedCaseIds
  teamSectionIdRef.current = teamSectionId
  selectedTeamMemberIdsRef.current = selectedTeamMemberIds

  const saveCaseSelection = async () => {
    const currentCasesSectionId = casesSectionIdRef.current
    const currentSelectedCaseIds = selectedCaseIdsRef.current
    
    if (!currentCasesSectionId) return

    try {
      await supabase
        .from('section_case_studies')
        .delete()
        .eq('section_id', currentCasesSectionId)

      if (currentSelectedCaseIds.length > 0) {
        const inserts = currentSelectedCaseIds.map((caseId, index) => ({
          section_id: currentCasesSectionId,
          case_study_id: caseId,
          order_index: index
        }))

        const { error } = await supabase
          .from('section_case_studies')
          .insert(inserts)

        if (error) throw error
      }
    } catch (error) {
      console.error('Error saving cases:', error)
    }
  }

  const saveTeamSelection = async () => {
    const currentTeamSectionId = teamSectionIdRef.current
    const currentSelectedTeamMemberIds = selectedTeamMemberIdsRef.current
    
    if (!currentTeamSectionId) return

    try {
      await supabase
        .from('section_team_members')
        .delete()
        .eq('section_id', currentTeamSectionId)

      if (currentSelectedTeamMemberIds.length > 0) {
        const inserts = currentSelectedTeamMemberIds.map((teamMemberId, index) => ({
          section_id: currentTeamSectionId,
          team_member_id: teamMemberId,
          order_index: index
        }))

        const { error } = await supabase
          .from('section_team_members')
          .insert(inserts)

        if (error) throw error
      }
    } catch (error) {
      console.error('Error saving team members:', error)
    }
  }

  const handleSave = useCallback(async (showAlert = false) => {
    try {
      // Bruk ref for å få nyeste versjon av sections
      const currentSections = sectionsRef.current
      
      // Oppdater hver seksjon
      for (const section of currentSections) {
        const { error } = await supabase
          .from('sections')
          .update({
            content: section.content,
            visible: section.visible,
            updated_at: new Date().toISOString()
          })
          .eq('id', section.id)

        if (error) throw error
      }

      // Lagre case-valg og team-valg også
      await saveCaseSelection()
      await saveTeamSelection()

      // Oppdater prosjekt updated_at
      await supabase
        .from('projects')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', projectId)

      // Stille lagring - ingen alert
    } catch (error) {
      console.error('Error saving:', error)
      if (showAlert) {
        alert('❌ Kunne ikke lagre endringer')
      }
    }
  }, [projectId])

  // Auto-save med debounce (venter 1 sekund etter siste endring)
  const autoSave = useCallback(() => {
    if (!editMode) return
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(() => {
      handleSave(false) // Ikke vis alert ved auto-save
    }, 1000)
  }, [editMode, handleSave])

  return {
    handleSave,
    autoSave
  }
}

