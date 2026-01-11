import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Project } from '@/lib/types'

export function usePublishing(
  project: Project | null,
  setProject: (project: Project | null) => void,
  shareLink: string | null,
  setShareLink: (link: string | null) => void,
  projectId: string
) {
  const [publishing, setPublishing] = useState(false)

  const togglePublish = async () => {
    setPublishing(true)

    try {
      if (project?.status === 'published') {
        // AVPUBLISER
        if (!confirm('Vil du avpublisere? Delbar link vil slutte å fungere.')) {
          setPublishing(false)
          return
        }

        await supabase
          .from('projects')
          .update({ status: 'draft', updated_at: new Date().toISOString() })
          .eq('id', projectId)

        await supabase
          .from('project_shares')
          .delete()
          .eq('project_id', projectId)

        if (project) {
          setProject({ ...project, status: 'draft' })
        }
        setShareLink(null)

        // Prosjekt avpublisert
      } else {
        // PUBLISER
        const token = Math.random().toString(36).substring(2, 15) + 
                      Math.random().toString(36).substring(2, 15)

        const { data: existingShare } = await supabase
          .from('project_shares')
          .select('token')
          .eq('project_id', projectId)
          .single()

        let finalToken = token

        if (existingShare) {
          finalToken = existingShare.token
        } else {
          const { error: shareError } = await supabase
            .from('project_shares')
            .insert({
              project_id: projectId,
              token: token,
              expires_at: null
            })

          if (shareError) throw shareError
        }

        await supabase
          .from('projects')
          .update({ status: 'published', updated_at: new Date().toISOString() })
          .eq('id', projectId)

        if (project) {
          setProject({ ...project, status: 'published' })
        }

        const url = `${window.location.origin}/p/${finalToken}`
        setShareLink(url)

        // Prosjekt publisert
      }
    } catch (error) {
      console.error('Error toggling publish:', error)
      alert('❌ Kunne ikke oppdatere publiseringsstatus')
    } finally {
      setPublishing(false)
    }
  }

  return {
    publishing,
    togglePublish
  }
}

